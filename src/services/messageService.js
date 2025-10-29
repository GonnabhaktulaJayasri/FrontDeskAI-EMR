import twilio from "twilio";
import fhirService from './fhirService.js';
import fhirSearchService from './fhirSearchService.js';
import { bookAppointment, findPatientAppointments, cancelAppointmentByDetails, rescheduleAppointmentByDetails } from "./appointment.js";
import { checkDoctorAvailability } from "./doctors.js";
import { processPrescriptionRefill } from './prescriptionRefill.js';
import callService from './callService.js';
import OpenAI from 'openai';
import 'dotenv/config';

/**
 * FHIR-based Message Service 
 */
class MessageService {
    constructor() {
        this.twilioClient = null;
        this.openai = null;
        this.initializeTwilio();
        this.initializeOpenAI();

        // Track active reminder/follow-up conversations
        this.activeConversations = new Map();

        // Cache WhatsApp availability (phone -> {hasWhatsApp: bool, checkedAt: timestamp})
        this.whatsappCache = new Map();
        this.CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

        // Performance tracking
        this.performanceStats = {
            totalRequests: 0,
            aiProcessed: 0,
            remindersSent: 0,
            followUpsSent: 0,
            callsTriggered: 0,
            appointmentsConfirmed: 0,
            appointmentsRescheduled: 0,
            appointmentsCancelled: 0,
            whatsappSent: 0,
            smsSent: 0,
            errors: 0,
            responseTimeSum: 0
        };
    }

    initializeTwilio() {
        if (process.env.TWILIO_SID && process.env.TWILIO_AUTH) {
            this.twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
        } else {
            console.error('Twilio credentials missing');
        }
    }

    initializeOpenAI() {
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });
        } else {
            console.error('OpenAI API key missing');
        }
    }

    /**
     * Get patient communication preferences from FHIR Patient resource
     */
    async getPatientPreferences(patientId) {
        try {
            const result = await fhirService.getPatient(patientId);
            if (!result.success) return null;

            const patient = result.data;
            const extensions = patient.extension || [];
            const commPrefExt = extensions.find(ext =>
                ext.url === 'http://hospital.com/fhir/StructureDefinition/communication-preferences'
            );

            if (commPrefExt) {
                return {
                    preferredMethod: commPrefExt.valueCodeableConcept?.coding?.[0]?.code || null,
                    whatsappAvailable: commPrefExt.extension?.find(e => e.url === 'whatsappAvailable')?.valueBoolean || false,
                    lastWhatsAppCheck: commPrefExt.extension?.find(e => e.url === 'lastWhatsAppCheck')?.valueDateTime || null
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting patient preferences:', error);
            return null;
        }
    }

    /**
     * Update patient communication preferences in FHIR
     */
    async updatePatientPreferences(patientId, preferences) {
        try {
            const result = await fhirService.getPatient(patientId);
            if (!result.success) return false;

            const patient = result.data;
            patient.extension = patient.extension || [];

            // Remove old communication preferences extension if exists
            patient.extension = patient.extension.filter(ext =>
                ext.url !== 'http://hospital.com/fhir/StructureDefinition/communication-preferences'
            );

            // Add new communication preferences
            const commPrefExt = {
                url: 'http://hospital.com/fhir/StructureDefinition/communication-preferences',
                extension: []
            };

            if (preferences.preferredMethod) {
                commPrefExt.valueCodeableConcept = {
                    coding: [{
                        system: 'http://hospital.com/fhir/CodeSystem/communication-method',
                        code: preferences.preferredMethod,
                        display: preferences.preferredMethod.toUpperCase()
                    }]
                };
            }

            if (preferences.whatsappAvailable !== undefined) {
                commPrefExt.extension.push({
                    url: 'whatsappAvailable',
                    valueBoolean: preferences.whatsappAvailable
                });
            }

            if (preferences.lastWhatsAppCheck) {
                commPrefExt.extension.push({
                    url: 'lastWhatsAppCheck',
                    valueDateTime: preferences.lastWhatsAppCheck
                });
            }

            patient.extension.push(commPrefExt);
            const updateResult = await fhirService.updatePatient(patientId, patient);
            return updateResult.success;
        } catch (error) {
            console.error('Error updating patient preferences:', error);
            return false;
        }
    }

    /**
     * Check if a phone number has WhatsApp using Twilio Lookup API
     */
    async checkWhatsAppAvailability(phoneNumber) {
        try {
            const cleanNumber = phoneNumber.replace('whatsapp:', '').replace('+', '').trim();
            const formattedNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;

            // Check cache first
            const cached = this.whatsappCache.get(formattedNumber);
            if (cached && (Date.now() - cached.checkedAt) < this.CACHE_TTL) {
                console.log(`📱 WhatsApp status (cached): ${formattedNumber} - ${cached.hasWhatsApp ? 'Available' : 'Not available'}`);
                return cached.hasWhatsApp;
            }

            if (!this.twilioClient) {
                console.log('⚠️ Twilio client not initialized, defaulting to SMS');
                return false;
            }

            console.log(`🔍 Checking WhatsApp availability for: ${formattedNumber}`);

            try {
                const lookupResult = await this.twilioClient.lookups.v2
                    .phoneNumbers(formattedNumber)
                    .fetch({ fields: 'line_type_intelligence' });

                const hasWhatsApp = lookupResult.lineTypeIntelligence?.carrier_name?.toLowerCase().includes('whatsapp') || false;
                const whatsappAvailable = hasWhatsApp || await this.verifyWhatsAppByFHIR(formattedNumber);

                // Cache the result
                this.whatsappCache.set(formattedNumber, {
                    hasWhatsApp: whatsappAvailable,
                    checkedAt: Date.now()
                });

                console.log(`✅ WhatsApp check complete: ${formattedNumber} - ${whatsappAvailable ? 'Available' : 'Not available'}`);
                return whatsappAvailable;
            } catch (lookupError) {
                console.log('WhatsApp lookup failed, checking FHIR history');
                return await this.verifyWhatsAppByFHIR(formattedNumber);
            }

        } catch (error) {
            console.error('❌ Error checking WhatsApp availability:', error.message);
            return false;
        }
    }

    /**
     * Verify WhatsApp by checking FHIR patient history
     */
    async verifyWhatsAppByFHIR(phoneNumber) {
        try {
            const patientResult = await fhirSearchService.findPatientByPhone(phoneNumber);
            if (patientResult.success) {
                const preferences = await this.getPatientPreferences(patientResult.patientId);
                if (preferences?.whatsappAvailable !== undefined) {
                    return preferences.whatsappAvailable;
                }
            }

            // Check recent FHIR Communications
            const commResult = await fhirService.searchCommunications({
                recipient: phoneNumber,
                _count: 1
            });

            if (commResult.success && commResult.total > 0) {
                const comm = commResult.entries[0].resource;
                const sender = comm.sender?.reference || '';
                return sender.includes('whatsapp:');
            }

            return false;
        } catch (error) {
            console.error('Error verifying WhatsApp:', error);
            return false;
        }
    }

    /**
     * Automatically determine the best communication method
     */
    async determineBestMethod(phoneNumber, patientId = null) {
        try {
            if (patientId) {
                const preferences = await this.getPatientPreferences(patientId);
                if (preferences?.preferredMethod) {
                    const preferred = preferences.preferredMethod;

                    if (preferred === 'whatsapp') {
                        const hasWhatsApp = await this.checkWhatsAppAvailability(phoneNumber);
                        if (hasWhatsApp) {
                            console.log(`📱 Using preferred method: WhatsApp`);
                            return 'whatsapp';
                        }
                        console.log(`📱 WhatsApp preferred but not available, falling back to SMS`);
                    }

                    console.log(`📱 Using preferred method: ${preferred}`);
                    return preferred;
                }
            }

            const hasWhatsApp = await this.checkWhatsAppAvailability(phoneNumber);
            const method = hasWhatsApp ? 'whatsapp' : 'sms';

            if (patientId && hasWhatsApp) {
                await this.updatePatientPreferences(patientId, {
                    whatsappAvailable: true,
                    lastWhatsAppCheck: new Date().toISOString()
                });
            }

            console.log(`📱 Auto-selected method: ${method.toUpperCase()}`);
            return method;

        } catch (error) {
            console.error('Error determining best method:', error);
            return 'sms';
        }
    }

    /**
     * Get organization (hospital) phone number from FHIR
     */
    async getOrganizationPhone(organizationId) {
        try {
            const result = await fhirService.getOrganization(organizationId);
            if (!result.success) return null;

            const org = result.data;
            const phoneContact = org.telecom?.find(t => t.system === 'phone');
            return phoneContact?.value || null;
        } catch (error) {
            console.error('Error getting organization phone:', error);
            return null;
        }
    }

    /**
     * Send message with automatic WhatsApp/SMS selection
     */
    async sendMessageAuto(to, message, patientId = null, organizationId) {
        try {
            const method = await this.determineBestMethod(to, patientId);
            const result = await this.sendMessage(to, message, method, organizationId);

            if (!result.success && method === 'whatsapp') {
                console.log('⚠️ WhatsApp failed, retrying with SMS...');

                const cleanNumber = to.replace('whatsapp:', '').replace('+', '').trim();
                const formattedNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;
                this.whatsappCache.set(formattedNumber, {
                    hasWhatsApp: false,
                    checkedAt: Date.now()
                });

                if (patientId) {
                    await this.updatePatientPreferences(patientId, { whatsappAvailable: false });
                }

                return await this.sendMessage(to, message, 'sms', organizationId);
            }

            return result;

        } catch (error) {
            console.error('❌ Error in sendMessageAuto:', error);
            this.performanceStats.errors++;
            return { success: false, error: error.message };
        }
    }

    /**
     * Send message via Twilio (SMS or WhatsApp)
     */
    async sendMessage(to, messageBody, method = 'sms', organizationId) {
        try {
            if (!this.twilioClient) {
                throw new Error('Twilio not initialized');
            }

            const fromNumber = await this.getOrganizationPhone(organizationId);
            if (!fromNumber) {
                throw new Error('Organization phone number not configured');
            }

            const cleanTo = to.replace('whatsapp:', '').trim();
            const toNumber = method === 'whatsapp' ? `whatsapp:${cleanTo}` : cleanTo;
            const fromFormatted = method === 'whatsapp' ? `whatsapp:${fromNumber}` : fromNumber;

            console.log(`📤 Sending ${method.toUpperCase()} from ${fromFormatted} to ${toNumber}`);

            const result = await this.twilioClient.messages.create({
                body: messageBody,
                from: fromFormatted,
                to: toNumber
            });

            if (method === 'whatsapp') {
                this.performanceStats.whatsappSent++;
            } else {
                this.performanceStats.smsSent++;
            }

            console.log(`✅ ${method.toUpperCase()} sent: ${result.sid}`);
            return { success: true, messageSid: result.sid, method: method };

        } catch (error) {
            console.error(`❌ Error sending ${method}:`, error);
            this.performanceStats.errors++;
            return { success: false, error: error.message, method: method };
        }
    }

    /**
     * Store communication in FHIR as Communication resource
     */
    async storeCommunication(data) {
        try {
            const {
                patientId,
                organizationId,
                appointmentId,
                from,
                to,
                body,
                direction,
                messageSid,
                status,
                method,
                conversationType
            } = data;

            const communication = {
                resourceType: 'Communication',
                status: status === 'sent' || status === 'delivered' ? 'completed' : 'in-progress',
                category: [{
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                        code: conversationType || 'notification',
                        display: conversationType || 'Notification'
                    }]
                }],
                medium: [{
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
                        code: method === 'whatsapp' ? 'MSGWRIT' : 'SMSWRIT',
                        display: method === 'whatsapp' ? 'WhatsApp' : 'SMS'
                    }]
                }],
                subject: {
                    reference: `Patient/${patientId}`
                },
                sent: new Date().toISOString(),
                payload: [{
                    contentString: body
                }]
            };

            if (direction === 'outbound') {
                communication.sender = {
                    reference: `Organization/${organizationId}`,
                    display: from
                };
                communication.recipient = [{
                    reference: `Patient/${patientId}`,
                    display: to
                }];
            } else {
                communication.sender = {
                    reference: `Patient/${patientId}`,
                    display: from
                };
                communication.recipient = [{
                    reference: `Organization/${organizationId}`,
                    display: to
                }];
            }

            if (appointmentId) {
                communication.basedOn = [{
                    reference: `Appointment/${appointmentId}`
                }];
            }

            if (messageSid) {
                communication.identifier = [{
                    system: 'http://twilio.com/message-sid',
                    value: messageSid
                }];
            }

            const result = await fhirService.createCommunication(communication);

            if (result.success) {
                console.log(`✅ Communication stored in FHIR: ${result.fhirId}`);
                return { success: true, communicationId: result.fhirId };
            }

            return { success: false, error: result.error };

        } catch (error) {
            console.error('❌ Error storing communication:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if reminder has been sent today using FHIR Communications
     */
    async hasReminderBeenSent(appointmentId, conversationType) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const result = await fhirService.searchCommunications({
                'based-on': `Appointment/${appointmentId}`,
                sent: `ge${today.toISOString()}`,
                category: conversationType
            });

            return result.success && result.total > 0;
        } catch (error) {
            console.error('Error checking if reminder sent:', error);
            return false;
        }
    }

    /**
     * Get conversation history from FHIR Communications
     */
    async getConversationHistory(patientId, limit = 5) {
        try {
            const result = await fhirService.searchCommunications({
                subject: `Patient/${patientId}`,
                _sort: '-sent',
                _count: limit
            });

            if (!result.success || result.total === 0) {
                return [];
            }

            return result.entries.map(entry => {
                const comm = entry.resource;
                const isOutbound = comm.sender?.reference?.includes('Organization');
                const body = comm.payload?.[0]?.contentString || '';

                return {
                    role: isOutbound ? 'assistant' : 'user',
                    content: body
                };
            }).reverse();

        } catch (error) {
            console.error('Error getting conversation history:', error);
            return [];
        }
    }

    /**
     * Check if there's an active conversation (from FHIR or memory)
     */
    async isReminderFollowupConversation(phoneNumber) {
        try {
            if (this.activeConversations.has(phoneNumber)) {
                const conversation = this.activeConversations.get(phoneNumber);
                const hoursSinceStart = (Date.now() - conversation.startedAt) / (1000 * 60 * 60);
                if (hoursSinceStart < 24) {
                    console.log(`Active ${conversation.type} conversation for ${phoneNumber}`);
                    return true;
                } else {
                    this.activeConversations.delete(phoneNumber);
                }
            }

            // Check FHIR for recent conversations
            const patientResult = await fhirSearchService.findPatientByPhone(phoneNumber);
            if (!patientResult.success) return false;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const commResult = await fhirService.searchCommunications({
                subject: `Patient/${patientResult.patientId}`,
                sent: `ge${today.toISOString()}`,
                _count: 1,
                _sort: '-sent'
            });

            if (commResult.success && commResult.total > 0) {
                const recentComm = commResult.entries[0].resource;
                const appointmentRef = recentComm.basedOn?.[0]?.reference;

                if (appointmentRef) {
                    const appointmentId = appointmentRef.split('/')[1];
                    const conversationType = recentComm.category?.[0]?.coding?.[0]?.code || 'reminder';

                    this.activeConversations.set(phoneNumber, {
                        appointmentId: appointmentId,
                        type: conversationType,
                        startedAt: new Date(recentComm.sent).getTime()
                    });

                    console.log(`Recent reminder/follow-up found in FHIR for ${phoneNumber}`);
                    return true;
                }
            }

            console.log(`ℹ️ No active conversation for ${phoneNumber}`);
            return false;

        } catch (error) {
            console.error('Error checking conversation:', error);
            return false;
        }
    }

    /**
     * Main entry point: Process incoming message from Twilio webhook
     */
    async processIncomingMessage(req, organizationId) {
        const startTime = Date.now();
        this.performanceStats.totalRequests++;

        try {
            const { From, To, Body, MessageSid, ConversationSid } = req.body;

            if (!From || !Body) {
                console.log('Missing From or Body in request');
                return { success: false, error: 'Missing required fields' };
            }

            // Get organization
            const orgResult = await fhirService.getOrganization(organizationId);
            if (!orgResult.success) {
                throw new Error('Organization not found');
            }

            const orgPhone = await this.getOrganizationPhone(organizationId);
            if (!orgPhone) {
                throw new Error('Organization phone number not configured');
            }

            const isWhatsApp = From.startsWith('whatsapp:');
            const cleanFrom = From.replace('whatsapp:', '');
            const cleanTo = To ? To.replace('whatsapp:', '') : orgPhone;
            const message = Body.trim();

            console.log(`\n🤖 Processing ${isWhatsApp ? 'WhatsApp' : 'SMS'} from ${cleanFrom}`);
            console.log(`💬 Message: "${message}"`);

            // Find patient in FHIR by phone
            let patientResult = await fhirSearchService.findPatientByPhone(cleanFrom);
            let patientId, patient;

            if (!patientResult.success) {
                // Create new patient in FHIR
                const newPatient = {
                    resourceType: 'Patient',
                    telecom: [{
                        system: 'phone',
                        value: cleanFrom,
                        use: 'mobile'
                    }],
                    extension: [{
                        url: 'http://hospital.com/fhir/StructureDefinition/communication-preferences',
                        valueCodeableConcept: {
                            coding: [{
                                code: isWhatsApp ? 'whatsapp' : 'sms'
                            }]
                        }
                    }]
                };

                const createResult = await fhirService.createPatient(newPatient);
                if (createResult.success) {
                    patientId = createResult.fhirId;
                    patient = createResult.data;
                } else {
                    throw new Error('Failed to create patient');
                }
            } else {
                patientId = patientResult.patientId;
                patient = patientResult.patient;
            }

            // Check for active conversation
            let conversationMeta = this.activeConversations.get(cleanFrom);
            if (!conversationMeta) {
                conversationMeta = this.activeConversations.get(From);
            }

            let appointmentId = conversationMeta?.appointmentId;

            // Try to find appointment from recent FHIR communications
            if (!appointmentId) {
                console.log('No active conversation found, checking FHIR...');
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const commResult = await fhirService.searchCommunications({
                    subject: `Patient/${patientId}`,
                    sent: `ge${today.toISOString()}`,
                    _count: 1,
                    _sort: '-sent'
                });

                if (commResult.success && commResult.total > 0) {
                    const recentComm = commResult.entries[0].resource;
                    const appointmentRef = recentComm.basedOn?.[0]?.reference;

                    if (appointmentRef) {
                        appointmentId = appointmentRef.split('/')[1];
                        const conversationType = recentComm.category?.[0]?.coding?.[0]?.code || 'reminder';

                        this.activeConversations.set(cleanFrom, {
                            appointmentId: appointmentId,
                            type: conversationType,
                            startedAt: new Date(recentComm.sent).getTime(),
                            flowType: conversationMeta?.flowType
                        });
                        this.activeConversations.set(From, {
                            appointmentId: appointmentId,
                            type: conversationType,
                            startedAt: new Date(recentComm.sent).getTime(),
                            flowType: conversationMeta?.flowType
                        });
                        console.log(`Restored conversation from FHIR for appointment: ${appointmentId}`);
                    }
                }
            }

            console.log(`Appointment ID: ${appointmentId || 'NONE'}`);

            // Store incoming communication in FHIR
            await this.storeCommunication({
                patientId,
                organizationId,
                appointmentId,
                from: cleanFrom,
                to: cleanTo,
                body: message,
                direction: 'inbound',
                messageSid: MessageSid,
                status: 'received',
                method: isWhatsApp ? 'whatsapp' : 'sms'
            });

            // Get AI response
            const aiResponse = await this.getAIResponse(
                message,
                patient,
                patientId,
                orgResult.data,
                organizationId,
                appointmentId
            );

            // Track flow state after showing availability
            if (aiResponse.action === 'doctor_available') {
                const currentFlow = this.activeConversations.get(cleanFrom) || {};
                if (!currentFlow.flowType || currentFlow.flowType !== 'reschedule') {
                    this.activeConversations.set(cleanFrom, {
                        ...currentFlow,
                        flowType: 'booking',
                        flowStartedAt: Date.now()
                    });
                    this.activeConversations.set(From, {
                        ...currentFlow,
                        flowType: 'booking',
                        flowStartedAt: Date.now()
                    });
                }
            }

            // Send response
            if (aiResponse.shouldRespond) {
                const result = await this.sendMessage(
                    cleanFrom,
                    aiResponse.message,
                    isWhatsApp ? 'whatsapp' : 'sms',
                    organizationId
                );

                if (result.success) {
                    await this.storeCommunication({
                        patientId,
                        organizationId,
                        appointmentId,
                        from: cleanTo,
                        to: cleanFrom,
                        body: aiResponse.message,
                        direction: 'outbound',
                        messageSid: result.messageSid,
                        status: 'sent',
                        method: isWhatsApp ? 'whatsapp' : 'sms'
                    });
                }
            }

            this.updateStats(aiResponse.action);

            // Clean up conversation if ended
            if (aiResponse.conversationEnded) {
                this.activeConversations.delete(cleanFrom);
                this.activeConversations.delete(From);
                console.log(`Conversation ended for ${cleanFrom}`);
            }

            this.performanceStats.aiProcessed++;
            this.performanceStats.responseTimeSum += (Date.now() - startTime);
            console.log(`✅ Processed in ${Date.now() - startTime}ms - Action: ${aiResponse.action}\n`);

            return {
                success: true,
                action: aiResponse.action,
                responseTime: Date.now() - startTime,
                appointmentId: appointmentId
            };

        } catch (error) {
            console.error('❌ Error processing message:', error);
            this.performanceStats.errors++;
            return { success: false, error: error.message };
        }
    }

    /**
     * Get AI response using OpenAI with function calling
     */
    async getAIResponse(message, patient, patientId, organization, organizationId, appointmentId) {
        try {
            if (!this.openai) {
                throw new Error('OpenAI not initialized');
            }

            let appointment = null;
            if (appointmentId) {
                const apptResult = await fhirService.getAppointment(appointmentId);
                if (apptResult.success) {
                    appointment = apptResult.data;
                }
            }

            const systemMessage = this.buildSystemMessage(patient, patientId, organization, appointment);
            const history = await this.getConversationHistory(patientId, 5);

            const messages = [
                { role: "system", content: systemMessage },
                ...history,
                { role: "user", content: message }
            ];

            console.log('Calling OpenAI GPT-4o-mini...');

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages,
                tools: this.getAllFunctionTools(),
                tool_choice: "auto",
                temperature: 0.7,
                max_tokens: 1000
            });

            const assistantMessage = completion.choices[0].message;

            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                console.log(`AI calling ${assistantMessage.tool_calls.length} function(s)`);
                return await this.handleFunctionCalls(
                    assistantMessage,
                    patient,
                    patientId,
                    organization,
                    organizationId,
                    appointment
                );
            }

            if (assistantMessage.content) {
                return {
                    shouldRespond: true,
                    message: assistantMessage.content,
                    action: 'ai_text_response',
                    conversationEnded: false
                };
            }

            throw new Error('No response from OpenAI');

        } catch (error) {
            console.error('OpenAI error:', error.message);
            return {
                shouldRespond: true,
                message: "I'm having trouble processing your message. Our team will call you shortly.",
                action: 'error',
                conversationEnded: true
            };
        }
    }

    /**
     * Build system message for AI context
     */
    buildSystemMessage(patient, patientId, organization, appointment) {
        const orgName = organization.name || 'Our Medical Center';
        const patientInfo = fhirSearchService.extractPatientInfo(patient);
        const patientName = patientInfo.name || 'the patient';
        const patientPhone = patientInfo.phone;

        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        const todayReadable = today.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        const conversationState = this.activeConversations.get(patientPhone);
        const flowType = conversationState?.flowType;
        const isInFlow = conversationState?.flowStartedAt &&
            (Date.now() - conversationState.flowStartedAt) < 10 * 60 * 1000;

        let flowContext = '';
        if (isInFlow && flowType === 'reschedule') {
            flowContext = `\n\nCURRENT FLOW: RESCHEDULE
The patient is rescheduling their existing appointment. When they pick a date/time, use reschedule_appointment function.`;
        } else if (isInFlow && flowType === 'booking') {
            flowContext = `\n\nCURRENT FLOW: NEW BOOKING
The patient is booking a new appointment. When they pick a date/time, use book_appointment function.`;
        }

        let appointmentInfo = '';
        if (appointment) {
            const date = new Date(appointment.start).toLocaleDateString();
            const time = new Date(appointment.start).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Extract practitioner name
            const practitionerRef = appointment.participant?.find(p =>
                p.actor?.reference?.startsWith('Practitioner/')
            );
            let doctorName = 'TBD';
            if (practitionerRef) {
                const practitionerId = practitionerRef.actor.reference.split('/')[1];
                doctorName = practitionerId; // In a full implementation, fetch practitioner name
            }

            appointmentInfo = `
APPOINTMENT DETAILS:
- Doctor: Dr. ${doctorName}
- Date: ${date}
- Time: ${time}
- Status: ${appointment.status}`;
        }

        return `You are an AI assistant for ${orgName}, helping ${patientName} via text message about their appointment.

CURRENT DATE: ${todayReadable} (${todayFormatted})

PATIENT: ${patientName} (${patientPhone})
ORGANIZATION: ${orgName}${appointmentInfo}${flowContext}

CRITICAL CONVERSATION FLOW:

1. If patient wants to CONFIRM existing appointment:
   → Patient may say "YES", "CONFIRM", "OK"
   → Use confirm_appointment_attendance function

2. If patient says "reschedule", "change appointment", "move my appointment":
   → FIRST use ask_communication_preference function with action="reschedule"
   → After they choose TEXT, they may ask for available dates
   → Show them available slots using check_doctor_availability
   → When they pick a slot, use reschedule_appointment function

3. If patient asks "which dates available" or "when can I see doctor" (WITHOUT mentioning reschedule):
   → They want to book NEW appointment
   → Show them available slots using check_doctor_availability
   → When they pick a slot, use book_appointment function

4. If patient wants to CANCEL their appointment:
   → Patient may say "NO", "CANCEL IT", "cancel appointment"
   → FIRST use ask_communication_preference function with action="cancel"
   → If they reply "TEXT": Use cancel_appointment function
   → If they reply "CALL": Use trigger_call_to_patient function

5. If patient says "call me", "I want to talk", "phone me":
   → Use trigger_call_to_patient function IMMEDIATELY

DECISION LOGIC FOR DATE/TIME SELECTION:
- If in RESCHEDULE flow → use reschedule_appointment
- If in BOOKING flow → use book_appointment
- If unclear → use book_appointment (default to booking new)

IMPORTANT RULES:
- NEVER ask the same preference question twice in a row
- If patient says "TEXT" or "CALL" as a standalone message, they're answering your preference question
- After they choose TEXT for reschedule, show them available dates immediately
- When checking availability, ALWAYS use ${todayFormatted} as the starting date
- NEVER check dates in the past
- Be concise (text message format)

IMPORTANT: NEVER tell users to reply with just the word "CANCEL" - Twilio will unsubscribe them!

Remember: Track the conversation flow to know whether to book or reschedule!`;
    }

    /**
     * Get all function tools for OpenAI
     */
    getAllFunctionTools() {
        return [
            {
                type: "function",
                function: {
                    name: "get_my_appointments",
                    description: "Show patient their appointments",
                    parameters: {
                        type: "object",
                        properties: {
                            include_past: { type: "boolean", default: false },
                            limit: { type: "number", default: 5 }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "check_doctor_availability",
                    description: "Check doctor availability. Use TODAY'S date when patient asks 'which dates available'. NEVER use past dates.",
                    parameters: {
                        type: "object",
                        properties: {
                            doctor_name: { type: "string" },
                            date: {
                                type: "string",
                                description: "Date in YYYY-MM-DD format. Use CURRENT DATE from system message for general availability."
                            },
                            specialty: { type: "string" }
                        },
                        required: ["date"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "book_appointment",
                    description: "Book new appointment. Use when patient selects a slot from shown availability in BOOKING flow.",
                    parameters: {
                        type: "object",
                        properties: {
                            patient_name: { type: "string" },
                            patient_phone: { type: "string" },
                            doctor_name: { type: "string" },
                            date: { type: "string", description: "YYYY-MM-DD" },
                            time: { type: "string", description: "HH:MM" },
                            reason: { type: "string" }
                        },
                        required: ["doctor_name", "date", "time", "reason"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "reschedule_appointment",
                    description: "Reschedule appointment. Use ONLY in RESCHEDULE flow when patient chose TEXT.",
                    parameters: {
                        type: "object",
                        properties: {
                            patient_name: { type: "string" },
                            patient_phone: { type: "string" },
                            old_date: { type: "string", description: "Current appointment date YYYY-MM-DD" },
                            new_date: { type: "string", description: "New appointment date YYYY-MM-DD" },
                            new_time: { type: "string", description: "New time HH:MM" }
                        },
                        required: ["patient_phone", "old_date", "new_date", "new_time"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "cancel_appointment",
                    description: "Cancel appointment via text. Use ONLY if patient explicitly chose TEXT communication.",
                    parameters: {
                        type: "object",
                        properties: {
                            patient_name: { type: "string" },
                            patient_phone: { type: "string" },
                            appointment_date: { type: "string", description: "YYYY-MM-DD" },
                            reason: { type: "string" }
                        },
                        required: ["patient_phone", "appointment_date"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "prescription_refill",
                    description: "Request prescription refill",
                    parameters: {
                        type: "object",
                        properties: {
                            medication_name: { type: "string" },
                            patient_name: { type: "string" },
                            patient_phone: { type: "string" },
                            pharmacy_name: { type: "string" }
                        },
                        required: ["medication_name", "patient_phone"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_patient_info",
                    description: "Update patient information",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "number" },
                            gender: { type: "string", enum: ["male", "female", "other"] },
                            preferred_doctor: { type: "string" },
                            preferred_time: { type: "string" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "trigger_call_to_patient",
                    description: "Trigger AI phone call to patient.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: {
                                type: "string",
                                description: "Reason for call"
                            },
                            urgency: {
                                type: "string",
                                enum: ["urgent", "normal"],
                                default: "normal"
                            },
                            call_type: {
                                type: "string",
                                enum: ["appointment_management", "prescription_refill", "general_inquiry", "follow_up"],
                                default: "appointment_management"
                            },
                            context: {
                                type: "string"
                            }
                        },
                        required: ["reason", "call_type"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "ask_communication_preference",
                    description: "Ask patient if they prefer TEXT or CALL for an action (reschedule/cancel)",
                    parameters: {
                        type: "object",
                        properties: {
                            action: {
                                type: "string",
                                enum: ["reschedule", "cancel"],
                                description: "Action that needs preference"
                            },
                            context: { type: "string" }
                        },
                        required: ["action"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "confirm_appointment_attendance",
                    description: "Confirm patient will attend their appointment. Use when they say YES, CONFIRM, OK.",
                    parameters: {
                        type: "object",
                        properties: {
                            patient_phone: { type: "string" },
                            appointment_date: { type: "string", description: "YYYY-MM-DD" }
                        },
                        required: ["patient_phone"]
                    }
                }
            }
        ];
    }

    /**
     * Handle function calls from OpenAI
     */
    async handleFunctionCalls(assistantMessage, patient, patientId, organization, organizationId, appointment) {
        try {
            const toolCall = assistantMessage.tool_calls[0];
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            console.log(`Executing function: ${functionName}`, functionArgs);

            // Auto-fill patient info if missing
            const patientInfo = fhirSearchService.extractPatientInfo(patient);
            if (!functionArgs.patient_phone && patientInfo.phone) functionArgs.patient_phone = patientInfo.phone;
            if (!functionArgs.patient_name && patientInfo.name) functionArgs.patient_name = patientInfo.name;

            switch (functionName) {
                case 'get_my_appointments':
                    return await this.handleGetAppointments(patientId, functionArgs);
                case 'check_doctor_availability':
                    return await this.handleCheckAvailability(functionArgs, organizationId);
                case 'book_appointment':
                    return await this.handleBookAppointment(patientId, functionArgs, organizationId);
                case 'reschedule_appointment':
                    return await this.handleReschedule(patient, patientId, functionArgs, appointment);
                case 'cancel_appointment':
                    return await this.handleCancel(patient, patientId, functionArgs, appointment);
                case 'prescription_refill':
                    return await this.handlePrescriptionRefill(patientId, functionArgs);
                case 'update_patient_info':
                    return await this.handleUpdatePatientInfo(patientId, functionArgs);
                case 'trigger_call_to_patient':
                    return await this.triggerCallToPatient(patient, patientId, organization, organizationId, functionArgs);
                case 'ask_communication_preference':
                    const result = await this.askCommunicationPreference(functionArgs, patient);
                    if (result.flowType) {
                        const patientPhone = patientInfo.phone;
                        const currentConv = this.activeConversations.get(patientPhone) || {};
                        this.activeConversations.set(patientPhone, {
                            ...currentConv,
                            flowType: result.flowType,
                            flowStartedAt: Date.now()
                        });
                        const cleanPhone = patientPhone.replace('whatsapp:', '').replace('+', '');
                        this.activeConversations.set(cleanPhone, {
                            ...currentConv,
                            flowType: result.flowType,
                            flowStartedAt: Date.now()
                        });
                    }
                    return result;
                case 'confirm_appointment_attendance':
                    return await this.confirmAppointment(patient, patientId, functionArgs, appointment);
                default:
                    return {
                        shouldRespond: true,
                        message: "I'm here to help with your appointment. What would you like to do?",
                        action: 'unknown_function',
                        conversationEnded: false
                    };
            }

        } catch (error) {
            console.error('Function error:', error);
            return {
                shouldRespond: true,
                message: "I encountered an error. Would you like me to call you? Reply CALL or TEXT",
                action: 'function_error',
                conversationEnded: false
            };
        }
    }

    /**
     * FUNCTION HANDLERS
     */

    async handleGetAppointments(patientId, args) {
        try {
            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                return {
                    shouldRespond: true,
                    message: "Error finding your appointments.",
                    action: 'error',
                    conversationEnded: false
                };
            }

            const patientInfo = fhirSearchService.extractPatientInfo(patientResult.data);

            const appointments = await findPatientAppointments({
                patient_phone: patientInfo.phone,
                include_past: args.include_past,
                limit: args.limit || 5
            });

            if (!appointments || appointments.length === 0) {
                return {
                    shouldRespond: true,
                    message: "You don't have any upcoming appointments.",
                    action: 'no_appointments',
                    conversationEnded: false
                };
            }

            let message = `Your appointments:\n\n`;
            appointments.forEach((apt, i) => {
                const date = new Date(apt.dateTime).toLocaleDateString();
                const time = new Date(apt.dateTime).toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit'
                });
                message += `${i + 1}. Dr. ${apt.doctor.name}\n   ${date} at ${time}\n   ${apt.reason}\n\n`;
            });

            return {
                shouldRespond: true,
                message: message.trim(),
                action: 'appointments_listed',
                conversationEnded: false
            };

        } catch (error) {
            console.error('Error getting appointments:', error);
            return {
                shouldRespond: true,
                message: "Error getting appointments. Would you like me to call you? Reply CALL",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async handleCheckAvailability(args, organizationId) {
        try {
            const requestedDate = new Date(args.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (requestedDate < today) {
                return {
                    shouldRespond: true,
                    message: `That date has already passed. Please provide a future date.`,
                    action: 'invalid_date',
                    conversationEnded: false
                };
            }

            const availability = await checkDoctorAvailability(
                args.doctor_name,
                args.date,
                args.specialty,
                organizationId
            );

            if (availability.results && availability.results.length > 0) {
                let availableDoctors = availability.results.filter(doc => doc.available && doc.slots && doc.slots.length > 0);

                if (args.doctor_name) {
                    availableDoctors = availableDoctors.filter(doc =>
                        doc.doctor_name.toLowerCase().includes(args.doctor_name.toLowerCase()) ||
                        args.doctor_name.toLowerCase().includes(doc.doctor_name.toLowerCase())
                    );
                }

                if (availableDoctors.length === 0) {
                    const doctorText = args.doctor_name ? `${args.doctor_name}` : 'doctors';
                    return {
                        shouldRespond: true,
                        message: `${doctorText} is not available soon. Reply CALL to find alternative dates or doctors.`,
                        action: 'not_available',
                        conversationEnded: false
                    };
                }

                const doc = availableDoctors[0];
                const futureAvailableSlots = doc.slots.filter(slot => {
                    const slotDate = new Date(slot.date);
                    slotDate.setHours(0, 0, 0, 0);
                    return slotDate >= today && slot.status === 'available';
                });

                if (futureAvailableSlots.length === 0) {
                    return {
                        shouldRespond: true,
                        message: `${doc.doctor_name} has no upcoming available slots. Reply CALL to discuss alternatives.`,
                        action: 'not_available',
                        conversationEnded: false
                    };
                }

                let message = `${doc.doctor_name} (${doc.specialty}) availability:\n\n`;

                const slotsToShow = futureAvailableSlots.slice(0, 8);
                const formattedSlots = slotsToShow.map(slot => {
                    const slotDate = new Date(slot.date);
                    const dateStr = slotDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                    });

                    const [hours, minutes] = slot.time.split(':');
                    const hour = parseInt(hours);
                    const ampm = hour >= 12 ? 'PM' : 'AM';
                    const hour12 = hour % 12 || 12;
                    const timeStr = `${hour12}:${minutes} ${ampm}`;

                    return `- ${dateStr} at ${timeStr}`;
                });

                message += formattedSlots.join('\n');

                if (futureAvailableSlots.length > 8) {
                    message += `\n\n+${futureAvailableSlots.length - 8} more slots available`;
                }

                message += `\n\nReply with your preferred date and time to book, or CALL for help.`;

                return {
                    shouldRespond: true,
                    message: message,
                    action: 'doctor_available',
                    conversationEnded: false
                };
            }

            return {
                shouldRespond: true,
                message: `No availability found. Reply CALL to speak with us.`,
                action: 'not_available',
                conversationEnded: false
            };

        } catch (error) {
            console.error('Error checking availability:', error);
            return {
                shouldRespond: true,
                message: "Error checking availability. Reply CALL for help.",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async handleBookAppointment(patientId, args, organizationId) {
        try {
            const result = await bookAppointment({
                ...args,
                hospitalId: organizationId
            });

            if (result.success) {
                return {
                    shouldRespond: true,
                    message: `Appointment booked!\n\n${args.date} at ${args.time}\nDr. ${args.doctor_name}\n\nYou'll receive a reminder!`,
                    action: 'appointment_booked',
                    conversationEnded: true
                };
            }

            return {
                shouldRespond: true,
                message: "Having trouble booking. Reply CALL for help",
                action: 'booking_failed',
                conversationEnded: false
            };

        } catch (error) {
            return {
                shouldRespond: true,
                message: "Error booking. Reply CALL",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async handleReschedule(patient, patientId, args, appointment) {
        try {
            let actualAppointment = appointment;

            if (!actualAppointment) {
                const conversationMeta = this.activeConversations.get(fhirSearchService.extractPatientInfo(patient).phone);
                if (conversationMeta?.appointmentId) {
                    const apptResult = await fhirService.getAppointment(conversationMeta.appointmentId);
                    if (apptResult.success) {
                        actualAppointment = apptResult.data;
                    }
                }
            }

            if (!actualAppointment) {
                // Find upcoming appointment
                const apptResult = await fhirSearchService.findPatientAppointments(patientId, {
                    date: `ge${new Date().toISOString()}`,
                    status: 'booked'
                });

                if (apptResult.success && apptResult.total > 0) {
                    actualAppointment = apptResult.appointments[0];
                }
            }

            if (!actualAppointment) {
                return {
                    shouldRespond: true,
                    message: "Couldn't find your appointment to reschedule. Reply CALL for help.",
                    action: 'appointment_not_found',
                    conversationEnded: false
                };
            }

            // Extract original appointment details
            const aptDate = new Date(actualAppointment.start);
            const originalDate = aptDate.toISOString().split('T')[0];
            const originalTime = aptDate.toTimeString().slice(0, 5);

            // Extract practitioner
            const practitionerRef = actualAppointment.participant?.find(p =>
                p.actor?.reference?.startsWith('Practitioner/')
            );
            let originalDoctor = 'Unknown';
            if (practitionerRef) {
                const practitionerId = practitionerRef.actor.reference.split('/')[1];
                const practResult = await fhirService.getPractitioner(practitionerId);
                if (practResult.success) {
                    const practInfo = fhirSearchService.extractPractitionerInfo(practResult.data);
                    originalDoctor = practInfo.name;
                }
            }

            const patientInfo = fhirSearchService.extractPatientInfo(patient);

            const result = await rescheduleAppointmentByDetails({
                patient_name: patientInfo.name,
                patient_phone: patientInfo.phone,
                original_doctor: originalDoctor,
                original_date: originalDate,
                original_time: originalTime,
                new_date: args.new_date,
                new_time: args.new_time
            });

            if (result.success) {
                this.performanceStats.appointmentsRescheduled++;

                const newDate = new Date(`${args.new_date}T${args.new_time}:00`);
                const formattedDate = newDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                });
                const formattedTime = newDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                return {
                    shouldRespond: true,
                    message: `Appointment rescheduled!\n\nNew date: ${formattedDate}\nNew time: ${formattedTime}\nDoctor: ${originalDoctor}\n\nYou'll receive a reminder!`,
                    action: 'rescheduled',
                    conversationEnded: true
                };
            } else {
                console.log('Reschedule failed:', result.message);
                return {
                    shouldRespond: true,
                    message: "Having trouble rescheduling. Reply CALL for help.",
                    action: 'reschedule_failed',
                    conversationEnded: false
                };
            }

        } catch (error) {
            console.error('Reschedule error:', error);
            return {
                shouldRespond: true,
                message: "Error rescheduling. Reply CALL for help.",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async handleCancel(patient, patientId, args, appointment) {
        try {
            let appointmentToCancel = appointment;
            let doctorName = null;
            let appointmentDate = null;
            let appointmentTime = null;

            if (appointmentToCancel) {
                const aptDate = new Date(appointmentToCancel.start);
                appointmentDate = aptDate.toISOString().split('T')[0];
                appointmentTime = aptDate.toTimeString().slice(0, 5);

                // Extract practitioner
                const practitionerRef = appointmentToCancel.participant?.find(p =>
                    p.actor?.reference?.startsWith('Practitioner/')
                );
                if (practitionerRef) {
                    const practitionerId = practitionerRef.actor.reference.split('/')[1];
                    const practResult = await fhirService.getPractitioner(practitionerId);
                    if (practResult.success) {
                        const practInfo = fhirSearchService.extractPractitionerInfo(practResult.data);
                        doctorName = practInfo.name;
                    }
                }
            }

            if (!doctorName && args.appointment_date) {
                const searchDate = new Date(args.appointment_date);
                searchDate.setHours(0, 0, 0, 0);
                const nextDay = new Date(searchDate);
                nextDay.setDate(nextDay.getDate() + 1);

                const apptResult = await fhirSearchService.findPatientAppointments(patientId, {
                    date: `ge${searchDate.toISOString()}`,
                    date: `lt${nextDay.toISOString()}`,
                    status: 'booked'
                });

                if (apptResult.success && apptResult.total > 0) {
                    appointmentToCancel = apptResult.appointments[0];
                    const aptDate = new Date(appointmentToCancel.start);
                    appointmentDate = aptDate.toISOString().split('T')[0];
                    appointmentTime = aptDate.toTimeString().slice(0, 5);

                    const practitionerRef = appointmentToCancel.participant?.find(p =>
                        p.actor?.reference?.startsWith('Practitioner/')
                    );
                    if (practitionerRef) {
                        const practitionerId = practitionerRef.actor.reference.split('/')[1];
                        const practResult = await fhirService.getPractitioner(practitionerId);
                        if (practResult.success) {
                            const practInfo = fhirSearchService.extractPractitionerInfo(practResult.data);
                            doctorName = practInfo.name;
                        }
                    }
                }
            }

            if (!doctorName) {
                return {
                    shouldRespond: true,
                    message: "Couldn't find your appointment details. Reply CALL for help.",
                    action: 'appointment_not_found',
                    conversationEnded: false
                };
            }

            const patientInfo = fhirSearchService.extractPatientInfo(patient);

            const result = await cancelAppointmentByDetails({
                patient_name: patientInfo.name || args.patient_name,
                patient_phone: patientInfo.phone,
                doctor_name: doctorName,
                appointment_date: appointmentDate,
                appointment_time: appointmentTime,
                reason: args.reason || 'Patient requested via text'
            });

            if (result.success) {
                this.performanceStats.appointmentsCancelled++;

                return {
                    shouldRespond: true,
                    message: `Appointment cancelled.\n\nWe hope everything is okay. If you need to reschedule later, just let us know!`,
                    action: 'cancelled',
                    conversationEnded: true
                };
            } else {
                console.log('Cancel failed:', result.message);
                return {
                    shouldRespond: true,
                    message: "Having trouble cancelling. Reply CALL for help.",
                    action: 'cancel_failed',
                    conversationEnded: false
                };
            }

        } catch (error) {
            console.error('Cancel error:', error);
            return {
                shouldRespond: true,
                message: "Error cancelling. Reply CALL for help.",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async handlePrescriptionRefill(patientId, args) {
        try {
            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                return {
                    shouldRespond: true,
                    message: "Error processing refill",
                    action: 'error',
                    conversationEnded: false
                };
            }

            const patientInfo = fhirSearchService.extractPatientInfo(patientResult.data);

            const result = await processPrescriptionRefill({
                ...args,
                patient_name: patientInfo.name
            });

            if (result.success) {
                return {
                    shouldRespond: true,
                    message: `Prescription refill requested!\n\nMedication: ${args.medication_name}\n\nOur pharmacy will process within 24-48 hours.`,
                    action: 'refill_requested',
                    conversationEnded: true
                };
            }

            return {
                shouldRespond: true,
                message: "Having trouble with refill. Reply CALL for help",
                action: 'refill_failed',
                conversationEnded: false
            };

        } catch (error) {
            return {
                shouldRespond: true,
                message: "Error processing refill. Reply CALL",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async handleUpdatePatientInfo(patientId, args) {
        try {
            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                return {
                    shouldRespond: true,
                    message: "Error updating info",
                    action: 'error',
                    conversationEnded: false
                };
            }

            const patient = patientResult.data;

            // Update name
            if (args.name) {
                const [firstName, ...lastNameParts] = args.name.split(' ');
                patient.name = [{
                    use: 'official',
                    given: [firstName],
                    family: lastNameParts.join(' ')
                }];
            }

            // Update gender
            if (args.gender) {
                patient.gender = args.gender;
            }

            // Update age/birthdate (calculate from age)
            if (args.age) {
                const today = new Date();
                const birthYear = today.getFullYear() - args.age;
                patient.birthDate = `${birthYear}-01-01`;
            }

            // Update preferred doctor and time in extensions
            if (args.preferred_doctor || args.preferred_time) {
                patient.extension = patient.extension || [];
                const prefExt = {
                    url: 'http://hospital.com/fhir/StructureDefinition/patient-preferences',
                    extension: []
                };

                if (args.preferred_doctor) {
                    prefExt.extension.push({
                        url: 'preferredDoctor',
                        valueString: args.preferred_doctor
                    });
                }

                if (args.preferred_time) {
                    prefExt.extension.push({
                        url: 'preferredTime',
                        valueString: args.preferred_time
                    });
                }

                patient.extension.push(prefExt);
            }

            const updateResult = await fhirService.updatePatient(patientId, patient);

            if (updateResult.success) {
                return {
                    shouldRespond: true,
                    message: `Your information has been updated!`,
                    action: 'info_updated',
                    conversationEnded: true
                };
            }

            return {
                shouldRespond: true,
                message: "Error updating info. Reply CALL",
                action: 'error',
                conversationEnded: false
            };

        } catch (error) {
            return {
                shouldRespond: true,
                message: "Error updating info. Reply CALL",
                action: 'error',
                conversationEnded: false
            };
        }
    }

    async triggerCallToPatient(patient, patientId, organization, organizationId, args) {
        try {
            const { reason, urgency = 'normal', call_type = 'appointment_management', context } = args;

            const patientInfo = fhirSearchService.extractPatientInfo(patient);

            console.log(`Triggering call to ${patientInfo.phone}`);
            console.log(`Reason: ${reason} | Type: ${call_type} | Urgency: ${urgency}`);

            const callParams = {
                phoneNumber: patientInfo.phone,
                patientId: patientId,
                hospitalId: organizationId,
                reason: reason,
                callType: call_type,
                priority: urgency === 'urgent' ? 'high' : 'normal',
                escalationContext: {
                    escalatedFrom: 'messaging',
                    originalContext: context || reason,
                    timestamp: new Date(),
                    messageTriggered: true
                }
            };

            const callResult = await callService.makeOutboundCall(callParams);

            if (callResult.success) {
                this.performanceStats.callsTriggered++;

                const waitTime = urgency === 'urgent' ? 'immediately' : 'within 5-10 minutes';

                return {
                    shouldRespond: true,
                    message: `${urgency === 'urgent' ? 'Calling you RIGHT NOW!' : `Perfect! We'll call you ${waitTime}.`}\n\nPlease keep your phone nearby!`,
                    action: 'call_triggered',
                    conversationEnded: true,
                    callSid: callResult.call?.sid
                };
            }

            return {
                shouldRespond: true,
                message: `Having trouble calling. Please call us at ${organization.telecom?.find(t => t.system === 'phone')?.value || process.env.HOSPITAL_MAIN_PHONE}`,
                action: 'call_failed',
                conversationEnded: true
            };

        } catch (error) {
            console.error('Call trigger error:', error);
            return {
                shouldRespond: true,
                message: `Error setting up call. Please call us at ${organization.telecom?.find(t => t.system === 'phone')?.value || process.env.HOSPITAL_MAIN_PHONE}`,
                action: 'call_error',
                conversationEnded: true
            };
        }
    }

    async askCommunicationPreference(args, patient) {
        const { action, context } = args;

        const messages = {
            reschedule: "I can help you reschedule!\n\nWould you like to:\n\n- TEXT - Reschedule via messages\n- CALL - I'll call you to reschedule\n\nReply TEXT or CALL",
            cancel: "I understand you need to cancel your appointment.\n\nWould you like to:\n\n- TEXT - Cancel via message\n- CALL - I'll call you\n\nReply TEXT or CALL"
        };

        return {
            shouldRespond: true,
            message: messages[action] || "Would you prefer TEXT or CALL? Reply TEXT or CALL",
            action: 'preference_asked',
            flowType: action,
            conversationEnded: false
        };
    }

    async confirmAppointment(patient, patientId, args, appointment) {
        try {
            console.log(`Confirming appointment:`, {
                hasAppointment: !!appointment,
                patientPhone: args.patient_phone,
                appointmentDate: args.appointment_date
            });

            const patientInfo = fhirSearchService.extractPatientInfo(patient);
            const conversationMeta = this.activeConversations.get(patientInfo.phone) ||
                this.activeConversations.get(args.patient_phone);

            const reminderType = conversationMeta?.type || '24_hour';

            console.log(`Confirming via ${reminderType} reminder`);

            let appointmentToUpdate = appointment;

            if (!appointmentToUpdate && args.patient_phone && args.appointment_date) {
                console.log('No appointment passed, searching by date and patient...');
                const searchDate = new Date(args.appointment_date);
                searchDate.setHours(0, 0, 0, 0);
                const nextDay = new Date(searchDate);
                nextDay.setDate(nextDay.getDate() + 1);

                const apptResult = await fhirSearchService.findPatientAppointments(patientId, {
                    date: `ge${searchDate.toISOString()}`,
                    date: `lt${nextDay.toISOString()}`,
                    status: 'booked'
                });

                if (apptResult.success && apptResult.total > 0) {
                    appointmentToUpdate = apptResult.appointments[0];
                }
            }

            if (appointmentToUpdate) {
                // Update appointment status to booked/confirmed in FHIR
                const appointmentId = appointmentToUpdate.id;
                appointmentToUpdate.status = 'booked';

                const updateResult = await fhirService.updateAppointment(appointmentId, appointmentToUpdate);

                if (updateResult.success) {
                    console.log(`Appointment status updated to confirmed: ${appointmentId}`);
                }

                this.performanceStats.appointmentsConfirmed++;

                return {
                    shouldRespond: true,
                    message: `Great! Your appointment is confirmed. We'll see you then!`,
                    action: 'confirmed',
                    conversationEnded: true
                };
            } else {
                console.log(`No appointment found to confirm`);
                return {
                    shouldRespond: true,
                    message: "Confirmed! See you at your appointment!",
                    action: 'confirmed',
                    conversationEnded: true
                };
            }

        } catch (error) {
            console.error('Error confirming appointment:', error);
            return {
                shouldRespond: true,
                message: "Confirmed! See you at your appointment!",
                action: 'confirmed',
                conversationEnded: true
            };
        }
    }

    //     /**
    //      * Start message conversation (initiates reminder/follow-up)
    //      */
    //     async startMessageConversation(appointmentId, conversationType, method = 'sms', organizationId) {
    //         try {
    //             const apptResult = await fhirService.getAppointment(appointmentId);
    //             if (!apptResult.success) {
    //                 return { success: false, error: 'Appointment not found' };
    //             }

    //             const appointment = apptResult.data;

    //             // Extract patient reference
    //             const patientRef = appointment.participant?.find(p =>
    //                 p.actor?.reference?.startsWith('Patient/')
    //             );
    //             if (!patientRef) {
    //                 return { success: false, error: 'Patient not found in appointment' };
    //             }

    //             const patientId = patientRef.actor.reference.split('/')[1];

    //             const patientResult = await fhirService.getPatient(patientId);
    //             if (!patientResult.success) {
    //                 return { success: false, error: 'Patient not found' };
    //             }

    //             const patient = patientResult.data;
    //             const patientInfo = fhirSearchService.extractPatientInfo(patient);

    //             if (!patientInfo.phone) {
    //                 return { success: false, error: 'Patient phone missing' };
    //             }

    //             const orgPhone = await this.getOrganizationPhone(organizationId);
    //             if (!orgPhone) {
    //                 return { success: false, error: 'Organization phone not configured' };
    //             }

    //             const alreadySent = await this.hasReminderBeenSent(appointmentId, conversationType);
    //             if (alreadySent) {
    //                 console.log(`Reminder already sent for appointment ${appointmentId} today`);
    //                 return {
    //                     success: false,
    //                     error: 'Reminder already sent today',
    //                     reason: 'duplicate_prevention'
    //                 };
    //             }

    //             // Extract practitioner info
    //             const practitionerRef = appointment.participant?.find(p =>
    //                 p.actor?.reference?.startsWith('Practitioner/')
    //             );
    //             let practitionerName = 'your doctor';
    //             let practitionerSpecialty = '';

    //             if (practitionerRef) {
    //                 const practitionerId = practitionerRef.actor.reference.split('/')[1];
    //                 const practResult = await fhirService.getPractitioner(practitionerId);
    //                 if (practResult.success) {
    //                     const practInfo = fhirSearchService.extractPractitionerInfo(practResult.data);
    //                     practitionerName = practInfo.name;
    //                     practitionerSpecialty = practInfo.specialty ? ` (${practInfo.specialty})` : '';
    //                 }
    //             }

    //             let message = '';

    //             if (['appointment_reminder', '24_hour', '1_hour'].includes(conversationType)) {
    //                 let timeUntil = 'soon';
    //                 if (conversationType === '1_hour') timeUntil = 'in 1 hour';
    //                 else if (conversationType === '24_hour' || conversationType === 'appointment_reminder') timeUntil = 'tomorrow';

    //                 const date = new Date(appointment.start).toLocaleDateString('en-US', {
    //                     weekday: 'long',
    //                     month: 'long',
    //                     day: 'numeric'
    //                 });
    //                 const time = new Date(appointment.start).toLocaleTimeString('en-US', {
    //                     hour: 'numeric',
    //                     minute: '2-digit',
    //                     hour12: true
    //                 });

    //                 const appointmentReason = appointment.comment || 'consultation';

    //                 message = `Hi! 👋

    // You have an appointment ${timeUntil}:

    // 📅 Date: ${date}
    // 🕐 Time: ${time}
    // 👨‍⚕️ Doctor: ${practitionerName}${practitionerSpecialty}
    // Reason: ${appointmentReason}

    // Please reply:
    // - "YES" to confirm
    // - "RESCHEDULE" if you need to change the time
    // - "NO" if you need to cancel
    // - "CALL" if you'd like us to call you

    // Thank you!`;

    //                 this.performanceStats.remindersSent++;

    //             } else if (conversationType === 'follow_up') {
    //                 const appointmentDate = new Date(appointment.start).toLocaleDateString('en-US', {
    //                     month: 'short',
    //                     day: 'numeric'
    //                 });

    //                 message = `Hi! 👋

    // We hope you're feeling better after your visit with ${practitionerName} on ${appointmentDate}.

    // How are you feeling?

    // Please reply:
    // - "GOOD" - Feeling better
    // - "SAME" - No change
    // - "WORSE" - Not feeling well
    // - "CALL" - I'd like to speak with someone

    // We care about your recovery!`;

    //                 this.performanceStats.followUpsSent++;
    //             }

    //             const result = await this.sendMessage(patientInfo.phone, message, method, organizationId);

    //             if (result.success) {
    //                 this.activeConversations.set(patientInfo.phone, {
    //                     appointmentId: appointmentId,
    //                     type: conversationType,
    //                     startedAt: Date.now()
    //                 });

    //                 const cleanPhone = patientInfo.phone.replace('whatsapp:', '').replace('+', '');
    //                 this.activeConversations.set(cleanPhone, {
    //                     appointmentId: appointmentId,
    //                     type: conversationType,
    //                     startedAt: Date.now()
    //                 });

    //                 console.log(`Conversation started for ${patientInfo.phone} - Type: ${conversationType}`);

    //                 await this.storeCommunication({
    //                     patientId,
    //                     organizationId,
    //                     appointmentId,
    //                     from: method === 'whatsapp' ? `whatsapp:${orgPhone}` : orgPhone,
    //                     to: patientInfo.phone,
    //                     body: message,
    //                     direction: 'outbound',
    //                     messageSid: result.messageSid,
    //                     status: 'sent',
    //                     method,
    //                     conversationType
    //                 });

    //                 console.log(`${conversationType} sent successfully`);
    //                 return { success: true, messageSid: result.messageSid };
    //             }

    //             return { success: false, error: 'Failed to send message' };

    //         } catch (error) {
    //             console.error('❌ Error starting conversation:', error);
    //             return { success: false, error: error.message };
    //         }
    //     }

    /**
     * Start message conversation (initiates reminder/follow-up)
     * UPDATED: Now supports sending reminders to caller/family member phone
     */
    async startMessageConversation(appointmentId, conversationType, method = 'sms', organizationId) {
        try {
            const apptResult = await fhirService.getAppointment(appointmentId);
            if (!apptResult.success) {
                return { success: false, error: 'Appointment not found' };
            }

            const appointment = apptResult.data;

            // Extract patient reference
            const patientRef = appointment.participant?.find(p =>
                p.actor?.reference?.startsWith('Patient/')
            );
            if (!patientRef) {
                return { success: false, error: 'Patient not found in appointment' };
            }

            const patientId = patientRef.actor.reference.split('/')[1];

            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                return { success: false, error: 'Patient not found' };
            }

            const patient = patientResult.data;
            const patientInfo = fhirSearchService.extractPatientInfo(patient);

            // ============ NEW: GET REMINDER PHONE ============
            // Check appointment extensions for custom reminder phone
            const reminderPhoneExt = appointment.extension?.find(ext =>
                ext.url === 'http://your-system.com/fhir/StructureDefinition/reminderPhone'
            );

            // Check if caller booked for someone else
            const callerRelationshipExt = appointment.extension?.find(ext =>
                ext.url === 'http://your-system.com/fhir/StructureDefinition/callerRelationship'
            );

            const bookedByExt = appointment.extension?.find(ext =>
                ext.url === 'http://your-system.com/fhir/StructureDefinition/bookedBy'
            );

            // Determine which phone to use for reminders
            let reminderPhone = reminderPhoneExt?.valueString || patientInfo.phone;
            const callerRelationship = callerRelationshipExt?.valueString;
            const isBookedBySomeoneElse = callerRelationship && callerRelationship !== 'self';
            let callerName = null;

            // If booked by someone else, get caller's name
            if (isBookedBySomeoneElse && bookedByExt) {
                callerName = bookedByExt.valueReference?.display || null;
            }

            // Fallback: If no reminder phone and patient has no phone, try to get from contacts
            if (!reminderPhone) {
                // Try to get primary contact from patient record
                const primaryContact = patient.contact?.find(c =>
                    c.extension?.some(e =>
                        e.url === 'http://your-system.com/fhir/StructureDefinition/primaryContact' &&
                        e.valueBoolean === true
                    )
                );

                if (primaryContact) {
                    const contactPhone = primaryContact.telecom?.find(t => t.system === 'phone')?.value;
                    if (contactPhone) {
                        reminderPhone = contactPhone;
                        callerName = primaryContact.name?.text || 'family member';
                        isBookedBySomeoneElse = true;
                    }
                }
            }

            // If still no phone, return error
            if (!reminderPhone) {
                return {
                    success: false,
                    error: 'No phone number available for reminders (patient and contacts have no phone)'
                };
            }
            // ============ END NEW CODE ============

            const orgPhone = await this.getOrganizationPhone(organizationId);
            if (!orgPhone) {
                return { success: false, error: 'Organization phone not configured' };
            }

            const alreadySent = await this.hasReminderBeenSent(appointmentId, conversationType);
            if (alreadySent) {
                console.log(`Reminder already sent for appointment ${appointmentId} today`);
                return {
                    success: false,
                    error: 'Reminder already sent today',
                    reason: 'duplicate_prevention'
                };
            }

            // Extract practitioner info
            const practitionerRef = appointment.participant?.find(p =>
                p.actor?.reference?.startsWith('Practitioner/')
            );
            let practitionerName = 'your doctor';
            let practitionerSpecialty = '';

            if (practitionerRef) {
                const practitionerId = practitionerRef.actor.reference.split('/')[1];
                const practResult = await fhirService.getPractitioner(practitionerId);
                if (practResult.success) {
                    const practInfo = fhirSearchService.extractPractitionerInfo(practResult.data);
                    practitionerName = practInfo.name;
                    practitionerSpecialty = practInfo.specialty ? ` (${practInfo.specialty})` : '';
                }
            }

            let message = '';

            // ============ NEW: BUILD MESSAGE BASED ON WHO IS RECEIVING IT ============
            if (['appointment_reminder', '24_hour', '1_hour'].includes(conversationType)) {
                let timeUntil = 'soon';
                if (conversationType === '1_hour') timeUntil = 'in 1 hour';
                else if (conversationType === '24_hour' || conversationType === 'appointment_reminder') timeUntil = 'tomorrow';

                const date = new Date(appointment.start).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                });
                const time = new Date(appointment.start).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                const appointmentReason = appointment.description || appointment.comment || 'consultation';

                // NEW: Different message if sending to family member vs patient
                if (isBookedBySomeoneElse) {
                    // Message to family member/caller
                    const patientName = patientInfo.firstName
                        ? `${patientInfo.firstName} ${patientInfo.lastName || ''}`.trim()
                        : 'your family member';

                    message = `Hi! 👋

This is a reminder about the appointment for ${patientName} ${timeUntil}:

📅 Date: ${date}
🕐 Time: ${time}
👨‍⚕️ Doctor: ${practitionerName}${practitionerSpecialty}
Reason: ${appointmentReason}

Please reply:
- "YES" to confirm
- "RESCHEDULE" if you need to change the time
- "NO" if you need to cancel
- "CALL" if you'd like us to call you

Thank you!`;

                } else {
                    // Original message to patient
                    message = `Hi! 👋

You have an appointment ${timeUntil}:

📅 Date: ${date}
🕐 Time: ${time}
👨‍⚕️ Doctor: ${practitionerName}${practitionerSpecialty}
Reason: ${appointmentReason}

Please reply:
- "YES" to confirm
- "RESCHEDULE" if you need to change the time
- "NO" if you need to cancel
- "CALL" if you'd like us to call you

Thank you!`;
                }

                this.performanceStats.remindersSent++;

            } else if (conversationType === 'follow_up') {
                const appointmentDate = new Date(appointment.start).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });

                // NEW: Different message if sending to family member vs patient
                if (isBookedBySomeoneElse) {
                    const patientName = patientInfo.firstName
                        ? `${patientInfo.firstName} ${patientInfo.lastName || ''}`.trim()
                        : 'your family member';

                    message = `Hi! 👋

We hope ${patientName} is feeling better after the visit with ${practitionerName} on ${appointmentDate}.

How is ${patientInfo.firstName || 'the patient'} feeling?

Please reply:
- "GOOD" - Feeling better
- "SAME" - No change
- "WORSE" - Not feeling well
- "CALL" - I'd like to speak with someone

We care about your family's recovery!`;

                } else {
                    // Original message to patient
                    message = `Hi! 👋

We hope you're feeling better after your visit with ${practitionerName} on ${appointmentDate}.

How are you feeling?

Please reply:
- "GOOD" - Feeling better
- "SAME" - No change
- "WORSE" - Not feeling well
- "CALL" - I'd like to speak with someone

We care about your recovery!`;
                }

                this.performanceStats.followUpsSent++;
            }
            // ============ END NEW MESSAGE BUILDING ============

            // NEW: Send to reminderPhone instead of patientInfo.phone
            const result = await this.sendMessage(reminderPhone, message, method, organizationId);

            if (result.success) {
                // NEW: Store conversation with reminderPhone
                this.activeConversations.set(reminderPhone, {
                    appointmentId: appointmentId,
                    type: conversationType,
                    patientId: patientId,
                    isBookedBySomeoneElse: isBookedBySomeoneElse,
                    startedAt: Date.now()
                });

                const cleanPhone = reminderPhone.replace('whatsapp:', '').replace('+', '');
                this.activeConversations.set(cleanPhone, {
                    appointmentId: appointmentId,
                    type: conversationType,
                    patientId: patientId,
                    isBookedBySomeoneElse: isBookedBySomeoneElse,
                    startedAt: Date.now()
                });

                console.log(`Conversation started for ${reminderPhone} - Type: ${conversationType} - Patient: ${patientId}${isBookedBySomeoneElse ? ' (via family member)' : ''}`);

                await this.storeCommunication({
                    patientId,
                    organizationId,
                    appointmentId,
                    from: method === 'whatsapp' ? `whatsapp:${orgPhone}` : orgPhone,
                    to: reminderPhone, // NEW: Use reminderPhone
                    body: message,
                    direction: 'outbound',
                    messageSid: result.messageSid,
                    status: 'sent',
                    method,
                    conversationType,
                    // NEW: Add metadata about who received the message
                    metadata: {
                        sentToPatient: !isBookedBySomeoneElse,
                        sentToFamilyMember: isBookedBySomeoneElse,
                        callerRelationship: callerRelationship || null,
                        callerName: callerName || null
                    }
                });

                // NEW: Log more detailed info
                if (isBookedBySomeoneElse) {
                    console.log(`${conversationType} sent to family member (${callerRelationship || 'unknown relationship'}) for patient ${patientId}`);
                } else {
                    console.log(`${conversationType} sent to patient directly`);
                }

                return {
                    success: true,
                    messageSid: result.messageSid,
                    sentTo: reminderPhone,
                    sentToFamilyMember: isBookedBySomeoneElse
                };
            }

            return { success: false, error: 'Failed to send message' };

        } catch (error) {
            console.error('❌ Error starting conversation:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Update performance stats
     */
    updateStats(action) {
        switch (action) {
            case 'confirmed':
                this.performanceStats.appointmentsConfirmed++;
                break;
            case 'rescheduled':
                this.performanceStats.appointmentsRescheduled++;
                break;
            case 'cancelled':
                this.performanceStats.appointmentsCancelled++;
                break;
            case 'call_triggered':
                this.performanceStats.callsTriggered++;
                break;
        }
    }

    /**
     * Get performance stats (for API)
     */
    getPerformanceStats() {
        return {
            ...this.performanceStats,
            activeConversations: this.activeConversations.size,
            avgResponseTime: this.performanceStats.totalRequests > 0
                ? Math.round(this.performanceStats.responseTimeSum / this.performanceStats.totalRequests)
                : 0
        };
    }

    /**
     * Get conversations by query and limit
     */
    async getConversations(query, limit) {
        try {
            // Convert MongoDB-style query to FHIR search params
            const searchParams = {
                _count: parseInt(limit) || 10,
                _sort: '-sent'
            };

            if (query.patient) {
                searchParams.subject = `Patient/${query.patient}`;
            }

            const result = await fhirService.searchCommunications(searchParams);

            if (!result.success) {
                return [];
            }

            return result.entries.map(entry => entry.resource);
        } catch (error) {
            return [];
        }
    }
}

const messageService = new MessageService();
export default messageService;