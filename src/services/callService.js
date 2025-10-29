import twilio from "twilio";
import fhirService from "./fhirService.js";
import fhirSearchService from "./fhirSearchService.js";
import 'dotenv/config';

// NOTE: This implementation requires Communication resource support in fhirService
// Add the following methods to fhirService.js:
// - createCommunication(fhirCommunication)
// - updateCommunication(fhirId, fhirCommunication)

class CallService {
    constructor() {
        this.twilioClient = null;
        this.initializeTwilio();
    }

    initializeTwilio() {
        if (process.env.TWILIO_SID && process.env.TWILIO_AUTH) {
            this.twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
        }
    }

    /**
     * Make an outbound call - core logic without HTTP dependencies
     */
    async makeOutboundCall(options) {
        const {
            phoneNumber,
            reason,
            callType = 'general',
            appointmentId,
            reminderType,
            reminderData,
            followUpData,
            patientId,
            hospitalId,
            metadata
        } = options;

        try {
            // Validate environment
            this.validateTwilioConfig();

            if (!phoneNumber) {
                throw new Error("Phone number is required");
            }

            if (!hospitalId) {
                throw new Error("Hospital ID is required");
            }

            // Get hospital organization from FHIR
            const hospitalResult = await fhirService.getOrganization(hospitalId);
            if (!hospitalResult.success) {
                throw new Error("Hospital not found");
            }

            const hospital = hospitalResult.data;

            // Get Twilio phone number from hospital extensions
            const twilioPhoneExt = hospital.extension?.find(ext => 
                ext.url === 'http://hospital-system/twilio-phone-number'
            );

            if (!twilioPhoneExt || !twilioPhoneExt.valueString) {
                throw new Error("Hospital does not have a Twilio phone number configured");
            }

            const hospitalTwilioNumber = twilioPhoneExt.valueString;
            let patient = null;

            // If patientId provided, use it; otherwise look up by phone
            if (patientId) {
                const patientResult = await fhirService.getPatient(patientId);
                if (!patientResult.success) {
                    throw new Error("Patient not found with provided ID");
                }
                patient = patientResult.data;
            } else {
                // Look up patient by phone number using FHIR search
                console.log('Looking up patient by phone number:', phoneNumber);
                const searchResult = await fhirSearchService.findPatientByPhone(phoneNumber);

                if (!searchResult.success) {
                    console.log('Patient not found, creating new patient record');
                    
                    // Create new patient in FHIR
                    const newPatient = {
                        resourceType: 'Patient',
                        active: true,
                        name: [{
                            use: 'official',
                            text: `Patient ${phoneNumber.slice(-4)}`
                        }],
                        telecom: [{
                            system: 'phone',
                            value: phoneNumber,
                            use: 'mobile'
                        }]
                    };

                    const createResult = await fhirService.createPatient(newPatient);
                    if (!createResult.success) {
                        throw new Error("Failed to create patient");
                    }
                    
                    patient = createResult.data;
                    console.log('Created new patient:', patient.id);
                } else {
                    patient = searchResult.patient;
                    console.log('Found existing patient:', patient.id);
                }
            }

            const callMetadata = {
                callType: callType,
                originalPhoneInput: phoneNumber,
                appointmentId: appointmentId,
                reminderType: reminderType,
                ...(metadata || {})
            };

            // Create Communication resource for call record
            const fhirCommunication = {
                resourceType: 'Communication',
                status: 'preparation',
                category: [{
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/communication-category',
                        code: 'alert',
                        display: 'Alert'
                    }]
                }],
                medium: [{
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
                        code: 'VOICE',
                        display: 'voice'
                    }]
                }],
                subject: {
                    reference: `Patient/${patient.id}`
                },
                sent: new Date().toISOString(),
                reasonCode: [{
                    text: reason || "Outbound call"
                }],
                payload: [{
                    contentString: JSON.stringify(callMetadata)
                }],
                extension: [
                    {
                        url: 'http://hospital-system/call-type',
                        valueString: 'outbound'
                    },
                    {
                        url: 'http://hospital-system/from-number',
                        valueString: hospitalTwilioNumber
                    },
                    {
                        url: 'http://hospital-system/to-number',
                        valueString: phoneNumber
                    },
                    {
                        url: 'http://hospital-system/hospital-id',
                        valueString: hospitalId
                    }
                ]
            };

            const commResult = await fhirService.createCommunication(fhirCommunication);
            if (!commResult.success) {
                throw new Error("Failed to create call record");
            }

            const callRecord = commResult.data;

            // Get hospital details for context
            const hospitalData = {
                id: hospital.id,
                name: hospital.name,
                phone: hospital.telecom?.find(t => t.system === 'phone')?.value,
                twilioPhone: hospitalTwilioNumber,
                email: hospital.telecom?.find(t => t.system === 'email')?.value,
                address: hospital.address?.[0]?.text,
                website: hospital.telecom?.find(t => t.system === 'url')?.value,
                weekdayHours: hospital.extension?.find(ext => ext.url === 'http://hospital-system/weekday-hours')?.valueString || "8:00 AM - 8:00 PM",
                weekendHours: hospital.extension?.find(ext => ext.url === 'http://hospital-system/weekend-hours')?.valueString || "9:00 AM - 5:00 PM",
                emergencyHours: hospital.extension?.find(ext => ext.url === 'http://hospital-system/emergency-hours')?.valueString || "24/7",
                departments: [],
            };

            // Store enhanced context for outbound calls
            global.callContextMap = global.callContextMap || new Map();
            const contextKey = `outbound_${callRecord.id}`;

            const callContext = {
                type: 'outbound',
                callType: callType,
                patientId: patient.id,
                callRecordId: callRecord.id,
                from: hospitalTwilioNumber,
                to: phoneNumber,
                reason: reason,
                patientName: patient.name?.[0]?.text || 'Unknown',
                contextKey: contextKey,
                appointmentId: appointmentId,
                reminderType: reminderType,
                reminderData: reminderData,
                followUpData: followUpData,
                hospital: hospitalData,
                metadata: metadata || {},
                timestamp: Date.now()
            };

            // Store context by multiple keys for lookup flexibility
            global.callContextMap.set(contextKey, callContext);

            // Make the actual Twilio call using hospital's Twilio number
            const call = await this.twilioClient.calls.create({
                from: hospitalTwilioNumber,
                to: phoneNumber,
                url: `${process.env.BASE_URL}/api/calls/outbound-twiml?contextKey=${contextKey}`,
                statusCallback: `${process.env.BASE_URL}/api/calls/status`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'no_answer'],
                statusCallbackMethod: 'POST'
            });

            // Update Communication resource with Twilio SID
            callRecord.identifier = [{
                system: 'http://twilio.com/call-sid',
                value: call.sid
            }];
            callRecord.status = call.status === 'queued' ? 'preparation' : 'in-progress';
            
            const contextKeyExt = {
                url: 'http://hospital-system/context-key',
                valueString: contextKey
            };
            
            if (!callRecord.extension) {
                callRecord.extension = [];
            }
            callRecord.extension.push(contextKeyExt);

            await fhirService.updateCommunication(callRecord.id, callRecord);

            // Update context with actual Twilio SID
            const context = global.callContextMap.get(contextKey);
            context.twilioCallSid = call.sid;
            global.callContextMap.set(call.sid, context);
            global.callContextMap.set(contextKey, context);

            return {
                success: true,
                call: {
                    sid: call.sid,
                    status: call.status,
                    from: call.from,
                    to: call.to,
                    patientId: patient.id,
                    patientName: patient.name?.[0]?.text || 'Unknown',
                    callRecordId: callRecord.id,
                    contextKey: contextKey,
                    callType: callType,
                    reason: reason,
                    hospitalId: hospital.id,
                    hospitalName: hospital.name
                },
                patient: {
                    id: patient.id,
                    name: patient.name?.[0]?.text || 'Unknown',
                    phone: patient.telecom?.find(t => t.system === 'phone')?.value,
                }
            };

        } catch (error) {
            console.error("Outbound call service error:", error);
            throw error;
        }
    }

    /**
     * Make appointment reminder call - core logic
     */
    async makeAppointmentReminderCall(appointmentId, reminderType, hospitalId) {
        try {
            if (!hospitalId) {
                throw new Error("Hospital ID is required");
            }

            const appointmentResult = await fhirService.getAppointment(appointmentId);
            if (!appointmentResult.success) {
                throw new Error("Appointment not found");
            }

            const appointment = appointmentResult.data;

            // Get patient and practitioner references
            const patientRef = appointment.participant?.find(p => 
                p.actor?.reference?.startsWith('Patient/')
            )?.actor?.reference;
            
            const practitionerRef = appointment.participant?.find(p => 
                p.actor?.reference?.startsWith('Practitioner/')
            )?.actor?.reference;

            if (!patientRef) {
                throw new Error("No patient associated with appointment");
            }

            // Get patient details
            const patientId = patientRef.replace('Patient/', '');
            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                throw new Error("Patient not found");
            }

            const patient = patientResult.data;
            const patientPhone = patient.telecom?.find(t => t.system === 'phone')?.value;

            if (!patientPhone) {
                throw new Error("Patient has no phone number");
            }

            // Get practitioner details if available
            let practitionerName = 'Doctor';
            let practitionerSpecialty = '';
            
            if (practitionerRef) {
                const practitionerId = practitionerRef.replace('Practitioner/', '');
                const practitionerResult = await fhirService.getPractitioner(practitionerId);
                if (practitionerResult.success) {
                    const practitioner = practitionerResult.data;
                    practitionerName = practitioner.name?.[0]?.text || 'Doctor';
                    practitionerSpecialty = practitioner.qualification?.[0]?.code?.text || '';
                }
            }

            const appointmentDate = new Date(appointment.start);
            const reminderData = {
                appointmentDate: appointmentDate.toLocaleDateString(),
                appointmentTime: appointmentDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                doctorName: practitionerName,
                doctorSpecialty: practitionerSpecialty,
                reason: appointment.description || appointment.comment || '',
                confirmationNumber: `APT-${appointment.id.slice(-6).toUpperCase()}`,
                reminderType: reminderType || 'manual'
            };

            return await this.makeOutboundCall({
                phoneNumber: patientPhone,
                reason: `Appointment reminder - ${reminderType || 'manual'}`,
                callType: "appointment_reminder",
                appointmentId: appointmentId,
                reminderData: reminderData,
                reminderType: reminderType,
                hospitalId: hospitalId,
                patientId: patientId
            });

        } catch (error) {
            console.error("Appointment reminder call service error:", error);
            throw error;
        }
    }

    /**
     * Make follow-up call - core logic
     */
    async makeFollowUpCall(options) {
        const { patientId, followUpType, appointmentId, notes, hospitalId } = options;

        try {
            if (!hospitalId) {
                throw new Error("Hospital ID is required");
            }

            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                throw new Error("Patient not found");
            }

            const patient = patientResult.data;
            const patientPhone = patient.telecom?.find(t => t.system === 'phone')?.value;

            if (!patientPhone) {
                throw new Error("Patient has no phone number");
            }

            let followUpData = {
                followUpType: followUpType, // 'post_appointment', 'check_in', 'prescription_reminder'
                notes: notes
            };

            if (appointmentId) {
                const appointmentResult = await fhirService.getAppointment(appointmentId);
                if (appointmentResult.success) {
                    const appointment = appointmentResult.data;
                    const appointmentDate = new Date(appointment.start);
                    
                    // Get practitioner if available
                    const practitionerRef = appointment.participant?.find(p => 
                        p.actor?.reference?.startsWith('Practitioner/')
                    )?.actor?.reference;

                    let doctorName = 'Doctor';
                    if (practitionerRef) {
                        const practitionerId = practitionerRef.replace('Practitioner/', '');
                        const practitionerResult = await fhirService.getPractitioner(practitionerId);
                        if (practitionerResult.success) {
                            doctorName = practitionerResult.data.name?.[0]?.text || 'Doctor';
                        }
                    }

                    followUpData.lastAppointment = {
                        date: appointmentDate.toLocaleDateString(),
                        doctor: doctorName,
                        reason: appointment.description || appointment.comment || ''
                    };
                }
            }

            return await this.makeOutboundCall({
                patientId: patientId,
                phoneNumber: patientPhone,
                reason: `Follow-up call - ${followUpType}`,
                callType: "follow_up",
                followUpData: followUpData,
                hospitalId: hospitalId,
                appointmentId: appointmentId
            });

        } catch (error) {
            console.error("Follow-up call service error:", error);
            throw error;
        }
    }

    /**
     * End a call
     */
    async endCall(callSid) {
        try {
            await this.twilioClient.calls(callSid).update({ status: "completed" });
            return { success: true };
        } catch (error) {
            console.error("End call service error:", error);
            throw error;
        }
    }

    /**
     * Validate Twilio configuration
     */
    validateTwilioConfig() {
        if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH) {
            throw new Error("Missing Twilio credentials");
        }
        if (!process.env.BASE_URL) {
            throw new Error("Missing BASE_URL configuration");
        }
    }
}

// Create singleton instance
const callService = new CallService();
export default callService;