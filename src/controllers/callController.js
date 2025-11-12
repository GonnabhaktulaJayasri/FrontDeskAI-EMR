import twilio from "twilio";
import fhirService from "../services/fhirService.js";
import fhirSearchService from "../services/fhirSearchService.js";
import callService from "../services/callService.js";
import 'dotenv/config';
import { updateConversationCallStatus } from "./chatbotController.js";
import { normalizePhoneNumber } from "../utils/phoneUtils.js";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Handle inbound calls from Twilio
 * UPDATED: Uses FHIR only
 */
export const inboundCall = async (req, res) => {
    try {
        const callerId = req.body.From;
        const callSid = req.body.CallSid;
        const to = req.body.To;

        console.log(`Inbound call from ${callerId} to ${to}`);

        // ==================== STEP 1: CHECK FHIR/EMR ====================
        const fhirResult = await fhirSearchService.findPatientByPhone(callerId);

        let patientFhirId;
        let patientData = null;
        let patientSource = 'unknown';

        if (fhirResult.success) {
            // Patient found in FHIR
            patientFhirId = fhirResult.patientId;
            patientData = fhirSearchService.extractPatientInfo(fhirResult.patient);
            patientSource = 'fhir';
        } else {
            // ==================== STEP 2: NOT IN FHIR - CREATE NEW ====================
            console.log('Patient not in FHIR/EMR');
            patientFhirId = null;
            patientData = null;
            // console.log('Creating new patient in FHIR...');

            // const newPatient = {
            //     resourceType: 'Patient',
            //     name: [{
            //         use: 'official',
            //         family: 'Patient',  // Placeholder - AI will collect
            //         given: ['New']      // Placeholder - AI will collect
            //     }],
            //     telecom: [{
            //         system: 'phone',
            //         value: normalizePhoneNumber(callerId),
            //         use: 'mobile'
            //     }]
            // };

            // const createResult = await fhirService.createPatient(newPatient);

            // if (createResult.success) {
            //     patientFhirId = createResult.fhirId;
            //     patientData = {
            //         id: createResult.fhirId,
            //         firstName: 'New',
            //         lastName: 'Patient',
            //         phone: normalizePhoneNumber(callerId)
            //     };
            //     patientSource = 'new_created';
            //     console.log(`New patient created in FHIR: ${patientFhirId}`);
            // } else {
            //     console.error('Failed to create patient in FHIR:', createResult.error);
            //     return res.status(500).send("Error creating patient");
            // }
        }

        // ==================== FIND HOSPITAL (ORGANIZATION) ====================
        let hospital = null;
        let hospitalData = null;

        // Search for Organization by phone number
        const orgSearchResult = await fhirService.searchOrganizations({
            identifier: `http://hospital-system/twilio-phone|${to}`
        });

        if (orgSearchResult.success && orgSearchResult.total > 0) {
            hospital = orgSearchResult.entries[0].resource;

            hospitalData = {
                id: hospital.id,
                name: hospital.name || 'Unknown Hospital',
                phone: hospital.telecom?.find(t => t.system === 'phone')?.value || to,
                twilioPhone: to,
                email: hospital.telecom?.find(t => t.system === 'email')?.value || '',
                address: hospital.address?.[0]?.text || '',
                website: hospital.telecom?.find(t => t.system === 'url')?.value || '',
                weekdayHours: "8:00 AM - 8:00 PM",
                weekendHours: "9:00 AM - 5:00 PM",
                emergencyHours: "24/7",
                departments: []
            };
        } else {
            console.warn(`No hospital found in FHIR for Twilio number: ${to}`);
        }

        // ==================== CREATE CALL RECORD (FHIR COMMUNICATION) ====================
        const fhirCommunication = {
            resourceType: 'Communication',
            status: 'in-progress',
            identifier: [{
                system: 'http://twilio.com/call-sid',
                value: callSid,
                use: 'official'
            }],
            category: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                    code: 'phone-call',
                    display: 'Phone Call'
                }]
            }],
            medium: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
                    code: 'PHONE',
                    display: 'Phone'
                }]
            }],
            subject: {
                reference: `Patient/${patientFhirId}`
            },
            sent: new Date().toISOString(),
            payload: [{
                contentString: JSON.stringify({
                    type: "inbound",
                    callSid: callSid,
                    from: callerId,
                    to: to,
                    patientFhirId: patientFhirId,
                    hospitalId: hospital?.id
                })
            }]
        };

        if (hospital?.id) {
            fhirCommunication.recipient = [{
                reference: `Organization/${hospital.id}`
            }];
        }

        const callCommResult = await fhirService.createCommunication(fhirCommunication);

        let callRecordId = null;
        if (callCommResult.success) {
            callRecordId = callCommResult.fhirId;
        } else {
            console.error('Failed to create call record in FHIR:', callCommResult.error);
        }

        // ==================== STORE CALL CONTEXT ====================
        global.callContextMap = global.callContextMap || new Map();
        const contextKey = `inbound_${callRecordId || Date.now()}`;

        const callContext = {
            type: 'inbound',
            callType: 'general',
            patientFhirId: patientFhirId,
            patientSource: patientSource,
            callRecordId: callRecordId,
            from: callerId,
            to: to,
            patientData: patientData,
            patientName: patientData?.firstName || 'Patient',
            hospital: hospitalData,
            contextKey: contextKey,
            timestamp: Date.now(),

            nameVerificationPending: true,
            callerIdentityVerified: false,
            callerContext: null,
            bookingMode: null
        };

        // Store context by multiple keys for lookup flexibility
        global.callContextMap.set(contextKey, callContext);
        global.callContextMap.set(callSid, callContext);

        // Update context with actual Twilio SID
        const context = global.callContextMap.get(contextKey);
        context.twilioCallSid = callSid;
        global.callContextMap.set(callSid, context);
        global.callContextMap.set(contextKey, context);

        // ==================== TELL TWILIO TO STREAM AUDIO ====================
        console.log('Setting up Twilio stream...');
        const twiml = new VoiceResponse();
        twiml.connect().stream({
            url: `${process.env.BASE_URL.replace(/^https?:\/\//, "wss://")}/api/calls/stream?contextKey=${contextKey}`
        });

        res.type("text/xml");
        res.send(twiml.toString());

    } catch (err) {
        console.error("Inbound call error:", err);
        res.status(500).send("Error handling inbound call");
    }
};


/**
 * Make outbound call to a specific patient by phone number
 */
export const outboundCall = async (req, res) => {
    try {
        const { phoneNumber, reason, callType = 'general' } = req.body;

        const result = await callService.makeOutboundCall({
            phoneNumber,
            reason,
            callType,
            hospitalId: req.hospitalId,
            appointmentId: req.body.appointmentId,
            reminderType: req.body.reminderType,
            reminderData: req.body.reminderData,
            followUpData: req.body.followUpData,
            patientId: req.body.patientId,
            patientFhirId: req.body.patientFhirId
        });

        res.json(result);
    } catch (err) {
        console.error("Outbound call error:", err);
        res.status(500).json({
            error: "Failed to make outbound call",
            details: err.message,
            code: err.code
        });
    }
};

/**
 * Generate TwiML for outbound calls that connects to streaming
 */
export const outboundTwiml = async (req, res) => {
    try {
        const { contextKey } = req.query;

        if (!contextKey) {
            console.error("No context key provided for outbound call");
            return res.status(400).send("Missing context key");
        }

        const twiml = new VoiceResponse();
        twiml.connect().stream({
            url: `${process.env.BASE_URL.replace(/^https?:\/\//, "wss://")}/api/calls/stream?contextKey=${contextKey}`
        });

        res.type("text/xml");
        res.send(twiml.toString());
    } catch (err) {
        console.error("Outbound TwiML error:", err);
        res.status(500).send("Error generating outbound TwiML");
    }
};

/**
 * Make appointment reminder call
 */
export const makeAppointmentReminderCall = async (req, res) => {
    try {
        const { appointmentId, reminderType } = req.body;

        const result = await callService.makeAppointmentReminderCall(
            appointmentId,
            reminderType,
            req.hospitalId
        );

        res.json(result);
    } catch (err) {
        console.error("Appointment reminder call error:", err);
        res.status(500).json({
            error: "Failed to make appointment reminder call",
            details: err.message
        });
    }
};

/**
 * Make follow-up call
 */
export const makeFollowUpCall = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        const result = await callService.makeFollowUpCall(
            appointmentId,
            req.hospitalId
        );

        res.json(result);
    } catch (err) {
        console.error("Follow-up call error:", err);
        res.status(500).json({
            error: "Failed to make follow-up call",
            details: err.message
        });
    }
};

/**
 * End call
 */
export const endCall = async (req, res) => {
    try {
        const { callSid } = req.body;
        const result = await callService.endCall(callSid);
        res.json(result);
    } catch (err) {
        console.error("End call error:", err);
        res.status(500).json({ error: "Failed to end call" });
    }
};

/**
 * Transfer active call to hospital staff
 */
export const transferCall = async (req, res) => {
    try {
        const { callSid, reason, department = 'general' } = req.body;

        if (!callSid) {
            return res.status(400).json({
                error: 'Call SID is required'
            });
        }

        // Get hospital Organization from FHIR
        const hospitalId = req.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({
                error: 'Hospital ID not found'
            });
        }

        const hospitalResult = await fhirService.getOrganization(hospitalId);

        if (!hospitalResult.success) {
            return res.status(400).json({
                error: 'Hospital not found in FHIR'
            });
        }

        const hospital = hospitalResult.data;
        const telecom = hospital.telecom || [];

        const transferNumber = telecom.find(t => t.system === 'phone')?.value;
        const hospitalTwilioNumber = telecom.find(t => t.use === 'work' && t.system === 'phone')?.value;

        if (!transferNumber) {
            return res.status(400).json({
                error: 'Hospital phone number not configured in FHIR'
            });
        }

        if (!hospitalTwilioNumber) {
            return res.status(400).json({
                error: 'Hospital Twilio number not configured in FHIR'
            });
        }

        // Initialize Twilio client
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

        // Create transfer TwiML using hospital's Twilio number as caller ID
        const transferTwiml = `
            <Response>
                <Say voice="alice">Please hold while I transfer you to our ${department} department.</Say>
                <Dial timeout="30" record="false" callerId="${hospitalTwilioNumber}">
                    <Number>${transferNumber}</Number>
                </Dial>
                <Say voice="alice">I'm sorry, but no one is available right now. Please try calling ${transferNumber} directly or leave a message after the tone.</Say>
                <Record timeout="60" transcribe="false" maxLength="300" />
                <Say voice="alice">Thank you for your message. Someone will get back to you soon. Goodbye.</Say>
            </Response>
        `;

        // Execute transfer
        await twilioClient.calls(callSid).update({
            twiml: transferTwiml
        });

        // Log the transfer in FHIR as Communication
        const transferComm = {
            resourceType: 'Communication',
            status: 'completed',
            category: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                    code: 'transfer',
                    display: 'Transfer'
                }]
            }],
            medium: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
                    code: 'PHONE',
                    display: 'Phone'
                }]
            }],
            sent: new Date().toISOString(),
            payload: [{
                contentString: JSON.stringify({
                    callSid: callSid,
                    actionTaken: 'transferred_to_human',
                    transferReason: reason,
                    transferDepartment: department,
                    transferredAt: new Date().toISOString(),
                    transferNumber: transferNumber,
                    hospitalId: hospital.id
                })
            }],
            recipient: [{
                reference: `Organization/${hospital.id}`
            }]
        };

        await fhirService.createCommunication(transferComm);

        console.log(`Call ${callSid} transferred to ${transferNumber} (${department}) using caller ID ${hospitalTwilioNumber}`);

        res.json({
            success: true,
            message: `Call transferred to ${department} department`,
            transferNumber: transferNumber,
            department: department
        });

    } catch (error) {
        console.error('Transfer call error:', error);
        res.status(500).json({
            error: 'Failed to transfer call',
            details: error.message
        });
    }
};

/**
 * Handle call status updates from Twilio
 * ✅ UPDATED: Now uses FHIR Communication and updates chatbot conversation state
 */
export const handleCallStatus = async (req, res) => {
    try {
        const { CallSid, CallStatus, CallDuration } = req.body;
        const sessionId = req.query.sessionId;

        const normalizedStatus = mapTwilioStatus(CallStatus);

        // Find the Communication record in FHIR by searching for CallSid
        const commSearchResult = await fhirService.searchCommunications({
            identifier: `http://twilio.com/call-sid|${CallSid}`
        });

        let communicationId = null;
        let communication = null;

        if (commSearchResult.success && commSearchResult.total > 0) {
            communication = commSearchResult.entries[0].resource;
            communicationId = communication.id;

            // Update the Communication status
            const currentPayload = communication.payload?.[0]?.contentString ?
                JSON.parse(communication.payload[0].contentString) : {};

            communication.status = CallStatus === 'completed' ? 'completed' : 'in-progress';
            communication.payload = [{
                contentString: JSON.stringify({
                    ...currentPayload,
                    status: CallStatus,
                    normalizedStatus: normalizedStatus,
                    updatedAt: new Date().toISOString()
                })
            }];

            if (CallStatus === 'completed') {
                communication.received = new Date().toISOString();
            }

            await fhirService.updateCommunication(communicationId, communication);
            console.log(`Call ${CallSid} status updated in FHIR to ${CallStatus}`);
        } else {
            console.warn(`No Communication record found in FHIR for CallSid ${CallSid}`);
        }

        // Handle appointment reminder status updates
        if (communication && communicationId) {
            const payload = communication.payload?.[0]?.contentString ?
                JSON.parse(communication.payload[0].contentString) : {};

            if (payload.callType === "appointment_reminder" && payload.appointmentFhirId) {
                const reminderType = payload.reminderType || 'manual';

                // Get the appointment from FHIR
                const appointmentResult = await fhirService.getAppointment(payload.appointmentFhirId);

                if (appointmentResult.success) {
                    const appointment = appointmentResult.data;

                    // Add or update extension for reminder status
                    if (!appointment.extension) {
                        appointment.extension = [];
                    }

                    // Remove existing reminder extension if present
                    appointment.extension = appointment.extension.filter(
                        ext => ext.url !== `http://hospital.com/fhir/reminder-${reminderType}`
                    );

                    // Add new reminder extension
                    appointment.extension.push({
                        url: `http://hospital.com/fhir/reminder-${reminderType}`,
                        extension: [
                            { url: 'status', valueString: normalizedStatus },
                            { url: 'callSid', valueString: CallSid },
                            { url: 'updatedAt', valueDateTime: new Date().toISOString() }
                        ]
                    });

                    await fhirService.updateAppointment(payload.appointmentFhirId, appointment);
                    console.log(`Updated reminder status in FHIR for appointment ${payload.appointmentFhirId}`);
                }
            }

            // Handle follow-up call status updates
            if (payload.callType === "follow_up" && payload.appointmentFhirId) {
                const appointmentResult = await fhirService.getAppointment(payload.appointmentFhirId);

                if (appointmentResult.success) {
                    const appointment = appointmentResult.data;

                    if (!appointment.extension) {
                        appointment.extension = [];
                    }

                    // Remove existing follow-up extension if present
                    appointment.extension = appointment.extension.filter(
                        ext => ext.url !== 'http://hospital.com/fhir/follow-up-call'
                    );

                    // Add new follow-up extension
                    appointment.extension.push({
                        url: 'http://hospital.com/fhir/follow-up-call',
                        extension: [
                            { url: 'status', valueString: normalizedStatus },
                            { url: 'callSid', valueString: CallSid },
                            { url: 'lastStatusUpdate', valueDateTime: new Date().toISOString() }
                        ]
                    });

                    await fhirService.updateAppointment(payload.appointmentFhirId, appointment);
                    console.log(`Updated follow-up call status in FHIR for appointment ${payload.appointmentFhirId}`);
                }
            }
        }

        // ==================== ✅ UPDATE CHATBOT CONVERSATION STATE ====================
        if (sessionId) {
            try {
                console.log(`📞 Updating chatbot for session: ${sessionId}`);

                const result = await updateConversationCallStatus(sessionId, {
                    callSid: CallSid,
                    callStatus: CallStatus.toLowerCase(),
                    callDuration: CallDuration || 0,
                    timestamp: new Date()
                });

                if (result.success) {
                    console.log(`✅ Chatbot conversation state updated successfully`);
                } else {
                    console.warn(`⚠️ Chatbot update returned error: ${result.error}`);
                }

            } catch (chatbotError) {
                console.error('⚠️ Error updating chatbot state (non-critical):', chatbotError);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("Error handling call status update:", err);
        res.sendStatus(500);
    }
};

/**
 * Map Twilio call status to our follow-up status
 */
const mapTwilioStatus = (twilioStatus) => {
    switch (twilioStatus) {
        case 'completed':
            return 'answered';
        case 'busy':
            return 'busy';
        case 'no-answer':
            return 'no-answer';
        case 'failed':
            return 'failed';
        case 'canceled':
            return 'canceled';
        default:
            return 'in-progress';
    }
};

/**
 * Fetch call logs from FHIR Communications
 */
export const callLogs = async (req, res) => {
    try {
        // Search for all phone call Communications in FHIR
        const result = await fhirService.searchCommunications({
            category: 'phone-call',
            _sort: '-sent',
            _count: 100
        });

        if (!result.success) {
            return res.status(500).json({
                error: "Failed to fetch call logs from FHIR",
                details: result.error
            });
        }

        // Transform FHIR Communications to call log format
        const logs = await Promise.all(result.entries.map(async (entry) => {
            const comm = entry.resource;
            const payload = comm.payload?.[0]?.contentString ?
                JSON.parse(comm.payload[0].contentString) : {};

            // Get patient info if available
            let patientInfo = null;
            if (comm.subject?.reference) {
                const patientId = comm.subject.reference.split('/')[1];
                const patientResult = await fhirService.getPatient(patientId);

                if (patientResult.success) {
                    const patient = patientResult.data;
                    const name = patient.name?.[0];
                    patientInfo = {
                        phone: patient.telecom?.find(t => t.system === 'phone')?.value || '',
                        name: name ? `${name.given?.join(' ')} ${name.family}` : 'Unknown'
                    };
                }
            }

            return {
                id: comm.id,
                callSid: payload.callSid || '',
                type: payload.type || 'unknown',
                from: payload.from || '',
                to: payload.to || '',
                status: comm.status,
                sent: comm.sent,
                received: comm.received,
                patient: patientInfo,
                payload: payload
            };
        }));

        res.json(logs);
    } catch (err) {
        console.error("Call logs error:", err);
        res.status(500).json({
            error: "Failed to fetch call logs",
            details: err.message
        });
    }
};