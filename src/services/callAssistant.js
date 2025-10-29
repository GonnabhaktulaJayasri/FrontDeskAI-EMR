import WebSocket from "ws";
import twilio from "twilio";
import { checkDoctorAvailability } from "./doctors.js";
import 'dotenv/config';
import fs from "fs";
import wav from "wav";
import fhirService from "../services/fhirService.js";
import fhirSearchService from "../services/fhirSearchService.js";
import {
    updatePatientInfo,
    updatePatientFromCall
} from "./patient.js";
import { processPrescriptionRefill } from './prescriptionRefill.js';
import { loadPatientData, bookAppointment, findPatientAppointments, cancelAppointmentByDetails, rescheduleAppointmentByDetails, getFamilyAppointments } from "./appointment.js";
import { checkPatientExists } from "./patient.js"
import { AudioBufferManager, transcribeAudio } from "./transcription.js";

function getInstructions(callContext, patientData, appointmentData) {
    const hospitalName = callContext.hospital?.name || 'City General Hospital';
    const hospitalPhone = callContext.hospital?.phonenumber || 'our main number';
    const hospitalAddress = callContext.hospital?.hospitalAddress || 'our hospital';
    const departments = callContext.hospital?.departments || [];

    // Build patient context if available
    let patientContext = "";
    if (patientData) {
        patientContext = `
            PATIENT CONTEXT:
            - Patient Name: ${patientData.firstName}
            - Phone: ${patientData.phone}
            - Previous visits: ${patientData.totalVisits}
            ${patientData.preferredDoctor ? `- Preferred Doctor: ${patientData.preferredDoctor}` : ''}
            ${patientData.age ? `- Age: ${patientData.age}` : ''}
            ${patientData.gender ? `- Gender: ${patientData.gender}` : ''}
            ${patientData.dob ? `- dob: ${patientData.dob}` : ''}`



    }

    let appointmentContext = "";
    if (callContext.type === 'outbound' && callContext.callType === 'follow_up') {
        // For follow-up calls, show PAST appointment info
        if (appointmentData && appointmentData.pastAppointment) {
            appointmentContext = `
                RECENT APPOINTMENT (FOLLOW-UP CONTEXT):
                - Date: ${appointmentData.pastAppointment.date}
                - Time: ${appointmentData.pastAppointment.time}  
                - Doctor: Dr. ${appointmentData.pastAppointment.doctor}
                - Reason: ${appointmentData.pastAppointment.reason}
                - Status: ${appointmentData.pastAppointment.status}`;
        }

        // Also include upcoming appointments if any
        if (appointmentData && appointmentData.upcomingAppointments && appointmentData.upcomingAppointments.length > 0) {
            appointmentContext += `

                UPCOMING APPOINTMENTS:
                ${appointmentData.upcomingAppointments.map(apt =>
                `- ${apt.date} at ${apt.time} with Dr. ${apt.doctor} (${apt.reason})`
            ).join('\n')}`;
        }
    } else if (callContext.type === 'outbound' && callContext.callType === 'appointment_reminder') {
        // For reminder calls, show the specific appointment being reminded about
        if (callContext.reminderData) {
            appointmentContext = `
                APPOINTMENT REMINDER DETAILS:
                - Date: ${callContext.reminderData.appointmentDate}
                - Time: ${callContext.reminderData.appointmentTime}
                - Doctor: Dr. ${callContext.reminderData.doctorName} (${callContext.reminderData.doctorSpecialty})
                - Reason: ${callContext.reminderData.reason}
                - Confirmation: ${callContext.reminderData.confirmationNumber}`;
        }
    } else {
        // For inbound calls or other outbound calls, show upcoming appointments
        if (appointmentData && appointmentData.upcomingAppointments && appointmentData.upcomingAppointments.length > 0) {
            appointmentContext = `
                UPCOMING APPOINTMENTS:
                ${appointmentData.upcomingAppointments.map(apt =>
                `- ${apt.date} at ${apt.time} with Dr. ${apt.doctor} (${apt.reason}) - Confirmation: ${apt.confirmationNumber}`
            ).join('\n')}`;
        } else {
            appointmentContext = `
                UPCOMING APPOINTMENTS:
                - No upcoming appointments scheduled`;
        }
    }

    // Different instructions based on call type
    let roleAndGreeting = "";
    let specificInstructions = "";

    if (callContext.type === 'outbound') {
        // Outbound call specific behavior
        switch (callContext.callType) {
            case 'appointment_reminder':
                roleAndGreeting = `You are an Virtual assistant calling from ${hospitalName} for an OUTBOUND appointment reminder. The patient should be expecting this call or may not be. Be professional and clear about why you're calling.

                GREETING: "Hello, This is the Virtual assistant from ${hospitalName} calling. Am I speaking with ${patientData?.firstName || 'the patient'}? I'm calling to remind you about your upcoming appointment."`;

                // ENHANCED: Add timing-specific messaging
                const timingMessage = callContext.reminderType === '24_hour' ?
                    'This is your 24-hour reminder for tomorrow\'s appointment.' :
                    'This is your 1-hour reminder - your appointment is coming up soon.';

                specificInstructions = `
                    APPOINTMENT REMINDER SPECIFIC INSTRUCTIONS:
                    - Primary goal: Confirm the upcoming appointment and ensure patient remembers
                    - Timing: ${timingMessage}
                    - Appointment details: ${callContext.reminderData ? `
                    Date: ${callContext.reminderData.appointmentDate}
                    Time: ${callContext.reminderData.appointmentTime}
                    Doctor: Dr. ${callContext.reminderData.doctorName} (${callContext.reminderData.doctorSpecialty})
                    Reason: ${callContext.reminderData.reason}
                    Confirmation: ${callContext.reminderData.confirmationNumber}` : 'Details will be provided during call'}
                    - Ask if they need to reschedule
                    - For 24-hour reminders: Also remind about any preparation needed
                    - For 1-hour reminders: Focus on confirmation and arrival instructions
                    - Confirm their contact information
                    - If patient wants to cancel/reschedule, help them immediately`;
                break;

            case 'follow_up':
                roleAndGreeting = `You are an Virtual assistant calling from ${hospitalName} for an OUTBOUND follow-up call. This is a check-in call to see how the patient is doing AFTER their recent appointment.

                GREETING: "Hello, I am Virtual assistant calling from ${hospitalName}. Am I speaking with ${patientData?.firstName || 'the patient'}? I'm calling to follow up on your recent visit with us."`;

                specificInstructions = `
                FOLLOW-UP SPECIFIC INSTRUCTIONS:
                - Primary goal: Check on patient's wellbeing and recovery after their RECENT appointment
                - Be empathetic and caring
                - Reference their PAST appointment that you're following up on
                - Ask how they're feeling since their last visit
                - Check if they have any concerns or questions about their recent treatment
                - Do NOT mention upcoming appointments unless patient asks about scheduling
                - Focus on their recovery and wellbeing from the recent visit
                - Document any issues they mention
                - If they report problems, offer to connect them with medical staff
                - Only mention future appointments if they specifically ask about next steps`;
                break;

            case 'prescription_reminder':
                roleAndGreeting = `You are an Virtual assistant calling from ${hospitalName} regarding prescription refills.

                GREETING: "Hello, I am Virtual assistant calling from ${hospitalName}. Am I speaking with ${patientData?.firstName || 'the patient'}? I'm calling about your prescription refill."`;

                specificInstructions = `
                PRESCRIPTION REMINDER INSTRUCTIONS:
                - Remind about prescription that needs refilling
                - Check if they still need the medication
                - Help process refill if needed
                - Confirm pharmacy information
                - Ask about any side effects or concerns`;
                break;

            default:
                roleAndGreeting = `You are an Virtual assistant calling from ${hospitalName}. Be professional and clearly state why you're calling.

                GREETING: "Hello,I am Virtual assistant calling from ${hospitalName}. Am I speaking with ${patientData?.firstName || 'the patient'}?"`;

                specificInstructions = `
                GENERAL OUTBOUND INSTRUCTIONS:
                - Clearly state the reason for your call
                - Be respectful of their time
                - If this is an inconvenient time, offer to call back
                - Stay focused on the purpose of the call`;
        }

        specificInstructions += `

                OUTBOUND CALL BEST PRACTICES:
                - Always verify you're speaking to the correct person
                - If the patient seems confused, clearly explain why you're calling
                - Be prepared for the patient to be busy or unavailable
                - Offer to call back at a more convenient time
                - If they ask to be removed from calls, note this and respect their wishes
                - If no answer or wrong number, end call gracefully
                - Be more directive and purpose-driven than inbound calls`;

    } else {
        // Inbound call behavior (existing)
        roleAndGreeting = `You are the Virtual receptionist for ${hospitalName}. Your role is to help patients with appointments, prescription refills, and general inquiries.

        GREETING:
        - For new patients: "This is Virtual assistant,Thank you for calling ${hospitalName}. How can I help you today?"
        - For returning patients: "Hello ${patientData?.firstName || 'there'}!, I am Virtual assistant from ${hospitalName}, How are you doing? What can I help you with today?"`;

        specificInstructions = `
        INBOUND CALL INSTRUCTIONS:
        - Listen to what the patient needs first
        - Be reactive to their requests
        - Use stored patient information efficiently
        - Let the conversation flow naturally based on their needs`;
    }

    return `${roleAndGreeting}

        ${patientContext}

        HOSPITAL INFORMATION:
        - Hospital Name: ${hospitalName}
        - Main Phone: ${hospitalPhone}
        - Address: ${hospitalAddress}
        - Available Departments: ${departments.join(', ')}
        - Hours: ${callContext.hospital.weekdayHours || '8:00 AM - 8:00 PM'} (weekdays)
        - Weekend Hours: ${callContext.hospital.weekendHours || '9:00 AM - 5:00 PM'}
        - Emergency Department: '24/7'

        ${specificInstructions}

        COMMUNICATION STYLE:
        - Sound natural and conversational, like a helpful human ${callContext.type === 'outbound' ? 'healthcare coordinator' : 'receptionist'}
        - Use casual, friendly language: "Sure!", "Absolutely!", "Let me check that for you"
        - Vary your responses - don't sound robotic or repetitive
        - Show genuine interest: "That sounds good", "Perfect!", "Great choice"
        - Use natural speech patterns with contractions: "I'll", "You're", "We've", "Let's"
        - ${callContext.type === 'outbound' ? 'Be respectful of their time and stay focused on the call purpose' : 'Make patients feel welcomed and comfortable'}

        CALL ENDING INSTRUCTIONS:
        - When you call the end_call function, that means the conversation is COMPLETELY FINISHED
        - Do NOT generate any additional responses after calling end_call
        - Your final message should be your natural goodbye BEFORE calling end_call
        - The end_call function call itself should be the very last action
        - DO NOT explain that you're ending the call or provide additional farewells after calling end_call

        CALL ENDING DETECTION:
        - ONLY end the call when the patient CLEARLY indicates they want to end the conversation
        - Do NOT end the call just because patient says "thank you" - this could be in the middle of conversation
        - Look for CLEAR ending phrases like:
        * "Nothing else" + any closing phrase
        * "I'm good" + "goodbye/bye"
        * "Have a good day" (from patient to you)
        * Patient says "goodbye" or "bye" 
        - Do NOT end for simple "thank you" responses during ongoing conversation
        - When patient CLEARLY wants to end: 
        1. Say your natural goodbye message
        2. THEN immediately call end_call function
        3. DO NOT say anything else after calling end_call
        - Ask "Is there anything else I can help you with today?" if unsure whether patient wants to continue

        CORE RESPONSIBILITIES:
        - Help patients schedule, reschedule, or cancel appointments
        - Process prescription refill requests
        - Check doctor availability
        - Answer questions about hospital services, hours, location, and departments
        - Show upcoming appointments when requested
        - ${callContext.type === 'outbound' ? 'Complete the specific purpose of this outbound call efficiently' : 'Use stored patient information efficiently'}

        ENHANCED APPOINTMENT BOOKING - CRITICAL FLOW:
        When someone wants to book an appointment, ALWAYS follow this sequence:

        1. IDENTIFY WHO THE APPOINTMENT IS FOR:
           Ask: "Is this appointment for yourself, a family member, or a care center patient?"
           
           Listen for keywords:
           - "for me", "myself", "I need" â†’ SELF
           - "my son/daughter/mother/father/wife/husband", "family" â†’ FAMILY
           - "care center", "nursing home", "resident" â†’ CARE_CENTER

        2. FOR SELF BOOKINGS:
           - Use caller's stored information
           - Collect: doctor, date, time, reason
           - Use book_appointment with booking_type: "self"

        3. FOR FAMILY BOOKINGS:
           - Ask: "Have they been a patient here before?"
           
           IF YES:
           - Ask: "Can you provide their phone number?"
           - Use check_patient_exists function first
           - If found: "I found their record. They last visited on [date]."
           - If not found: Collect their full information
           
           IF NO:
           - Collect: first name, last name, phone, date of birth, gender
           
           - Then collect appointment details
           - Use book_appointment with booking_type: "family"
           - IMPORTANT: Book in FAMILY MEMBER'S NAME, not caller's name

           
        ### FAMILY APPOINTMENT BOOKING (booking_type: "family"):
        When caller wants to book for someone else:

        1. **Determine booking type FIRST:**
        - Ask: "Is this appointment for yourself or someone else?"
        - If for someone else: "What is your relationship to the patient?" (parent, spouse, child, etc.)

        2. **Collect family member information:**
        - Full name (first and last)
        - Date of birth or age
        - Phone number (may be same as caller's, but always ask)
        
        3. **Collect appointment details:**
        - Preferred doctor or specialty
        - Date and time preference
        - Reason for visit

        4. **Confirmation:**
        - Summarize: "I'm booking an appointment for [family member name], your [relationship], with [doctor] on [date] at [time] for [reason]. Is this correct?"

        5. **Important notes:**
        - If booking for a minor, ensure caller is parent/guardian
        - If booking for elderly parent, note caregiver relationship
        - Confirm contact phone for appointment reminders

        **Example dialogue:**
        - Caller: "I need to book an appointment for my daughter"
        - AI: "I'd be happy to help! What is your daughter's full name?"
        - Caller: "Sarah Johnson"
        - AI: "And what is Sarah's date of birth?"
        - Caller: "May 15, 2015"
        - AI: "What phone number should we use for appointment reminders?"
        - ... continue with doctor, date, time, reason

        4. FOR CARE CENTER BOOKINGS:
           - Ask: "What is the patient's name?"
           - Ask: "Which care center are they from?"
           - Ask: "Do you have their patient ID?"
           - Ask: "Have they been a patient here before?"
           
           IF YES:
           - Use check_patient_exists function first
           - If found: "I found their record in our system."
           - If not found: Collect their information
           
           IF NO:
           - Collect: full name, facility name, patient ID, date of birth
           
           - Then collect appointment details
           - Use book_appointment with booking_type: "care_center"
           - IMPORTANT: Book in PATIENT'S NAME

        5. ALWAYS CONFIRM before booking:
           - FOR SELF: "You're booking for yourself with Dr. [Name] on [Date] at [Time]."
           - FOR FAMILY: "You're booking for [Family Member Name], your [relationship], with Dr. [Name]..."
           - FOR CARE CENTER: "You're booking for [Patient Name] from [Facility] with Dr. [Name]..."
        
        6. After booking, provide the confirmation number

        CRITICAL BOOKING RULES:
        - ALWAYS ask who the appointment is for FIRST before collecting any other information
        - ALWAYS use check_patient_exists before creating new patients (family/care center)
        - NEVER book in caller's name for family or care center bookings
        - ALWAYS provide confirmation numbers after successful booking

        IMPORTANT LIMITATIONS:
        - Never provide medical advice, diagnosis, or treatment recommendations
        - For medical concerns: "I'll need to connect you with one of our medical professionals..."
        - Cannot access medical records or discuss protected health information
        - For complex issues: "Let me connect you with our staff member who can assist you further..."

        HUMAN TRANSFER CAPABILITY:
        - You CAN transfer callers to human staff when requested
        - Listen for phrases like: "speak to a person", "talk to someone real", "human representative", "transfer me", "I need to speak to staff"
        - When someone asks for a human, respond warmly: "Of course! I'll transfer you to one of our staff members right away. Please hold on."
        - Use the transfer_to_human function when patients request it
        - Common transfer reasons:
        * Patient explicitly asks for human help
        * Complex medical questions beyond your scope
        * Billing or insurance issues
        * Complaints or sensitive situations
        * Technical issues you cannot resolve

        TRANSFER SCENARIOS:
        - "Can I speak to a real person?" â†’ "Absolutely! Let me connect you with our staff right away."
        - "This is too complicated" â†’ "No problem! I'll transfer you to someone who can help."
        - "I need to speak to someone about billing" â†’ "I'll transfer you to our billing department."
        - "I have a complaint" â†’ "I understand. Let me connect you with our patient relations team."

        IMPORTANT TRANSFER NOTES:
        - Always be positive about transfers - never make it seem like a failure
        - Briefly explain what you're doing: "I'm transferring you now..."
        - If transfer fails, apologize and offer to help yourself
        - Don't over-explain technical details about the transfer process

        Remember: You're a helpful, ${callContext.type === 'outbound' ? 'proactive' : 'responsive'} person who works at ${hospitalName} - make every interaction professional and valuable.`;
}

export async function callAssistant(connection, req) {
    console.log('Starting AI assistant');

    // Extract context from URL parameters or WebSocket connection
    let callContext = null;

    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const callSid = url.searchParams.get('callSid');
        const contextKey = url.searchParams.get('contextKey');

        // Get call context from global map
        if (global.callContextMap) {
            if (contextKey) {
                callContext = global.callContextMap.get(contextKey);
            }

            if (!callContext && callSid) {
                callContext = global.callContextMap.get(callSid);
            }
        }
    } catch (urlError) {
        console.error('Error parsing URL:', urlError);
    }

    // ENHANCED FALLBACK: Find most recent context
    if (!callContext) {
        if (global.callContextMap && global.callContextMap.size > 0) {
            let mostRecentContext = null;
            let mostRecentTime = 0;

            for (const [key, context] of global.callContextMap.entries()) {
                if (context.timestamp && context.timestamp > mostRecentTime) {
                    mostRecentTime = context.timestamp;
                    mostRecentContext = context;
                }
            }

            if (mostRecentContext) {
                const timeDiff = Date.now() - mostRecentContext.timestamp;
                // Use context if it's within last 60 seconds (increased from 30)
                if (timeDiff < 60000) {
                    callContext = mostRecentContext;
                } else {
                    console.log('Most recent context is too old, not using it');
                }
            } else {
                console.log(' No contexts found with timestamps');
            }
        }
    }

    // Enhanced mark tracking for call ending
    let finalMessageMarkSent = false;
    let finalMessageMarkReceived = false;
    let callEndingInProgress = false;

    let callLog = null;
    let patientId = callContext.patientId || null;
    let patientFhirId = callContext.patientFhirId || null;
    let callLogId = null;
    let conversationTranscript = [];
    let isFinalized = false;
    let from = callContext.from || null;
    let to = callContext.to || null;
    let type = callContext.type || null;
    let patientData = null;
    let upcomingAppointments = [];

    // Connection-specific state
    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;
    let audioChunkCount = 0;
    let openAiWs = null;
    let isInitialized = false;
    let detectedIntent = null;
    let extractedEntities = {};
    let TEMPERATURE = 0.8;
    let appointmentData;
    let transferInProgress = false;

    let userAudioBuffer = new AudioBufferManager(800); // Minimum 800ms of audio
    let isUserSpeaking = false;
    let speechEndTimeout = null;
    let transcriptionInProgress = false;

    // Handle incoming messages from Twilio
    connection.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.event) {
                case 'start':
                    streamSid = data.start.streamSid;
                    connection.streamSid = streamSid;

                    const twilioCallSid = data.start.callSid;

                    if (callContext && !callContext.twilioCallSid) {
                        callContext.twilioCallSid = twilioCallSid;
                        if (global.callContextMap) {
                            global.callContextMap.set(twilioCallSid, callContext);
                        }
                    }

                    if (patientFhirId) {
                        console.log('Loading patient data for patientFhirId:', patientFhirId);
                        const result = await loadPatientData(patientFhirId);
                        if (result) {
                            patientData = result.patientData;
                            upcomingAppointments = result.upcomingAppointments;
                        }
                    } else {
                        console.log('No patientId available, skipping patient data load');
                    }

                    if (!callLogId) {
                        callLogId = await createCallLog(data.start, from, to, patientFhirId, type);
                    }

                    if (!isInitialized) {
                        await initializeOpenAI();
                        isInitialized = true;
                    }

                    // Reset state
                    responseStartTimestampTwilio = null;
                    latestMediaTimestamp = 0;
                    audioChunkCount = 0;
                    break;

                case 'media':
                    if (!openAiWs || openAiWs.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    latestMediaTimestamp = data.media.timestamp;

                    // Save user audio
                    const ulawBuffer = Buffer.from(data.media.payload, "base64");
                    const pcm16Buffer = ulawToPcm16(ulawBuffer);

                    if (isUserSpeaking) {
                        userAudioBuffer.addChunk(ulawBuffer);
                    }

                    // Send to OpenAI
                    const audioAppend = {
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload
                    };
                    openAiWs.send(JSON.stringify(audioAppend));
                    break;

                case 'mark':
                    if (markQueue.length > 0) {
                        markQueue.shift();
                        const receivedMark = markQueue.shift();
                        // Check if this is the final message mark
                        if ((receivedMark === 'finalMessage' || data.mark?.name === 'finalMessage') && callEndingInProgress) {
                            finalMessageMarkReceived = true;
                            console.log('Final message mark received - ending call gracefully');

                            // Give a bit more time for audio to complete
                            setTimeout(() => {
                                endCallSafely();
                            }, 500);
                        }
                    }
                    break;

                case 'stop':
                    console.log('Stream stopped');
                    await finalizeCallLog();
                    break;

                default:
                    console.log('Unhandled Twilio event:', data.event);
                    break;
            }
        } catch (error) {
            console.error('Error parsing Twilio message:', error);
        }
    });

    connection.on("close", async () => {
        console.log('Twilio connection closed');
        if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
        }
        await finalizeCallLog();
    });

    connection.on("error", (error) => {
        console.error("Twilio WebSocket error:", error);
    });

    // Initialize OpenAI connection
    async function initializeOpenAI() {
        console.log('Initializing OpenAI connection...');

        openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`, {
            headers: {
                "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
            }
        });

        openAiWs.on("open", () => {
            const sessionUpdate = {
                type: "session.update",
                session: {
                    type: 'realtime',
                    model: "gpt-realtime",
                    output_modalities: ["audio"],
                    instructions: getInstructions(callContext, patientData, appointmentData),
                    audio: {
                        input: {
                            format: { type: 'audio/pcmu' },
                            turn_detection: { type: "server_vad", "silence_duration_ms": 850 }
                        },
                        output: {
                            format: { type: 'audio/pcmu' },
                            voice: 'cedar',
                            "speed": 1.0
                        },
                    },
                    tools: [
                        {
                            type: "function",
                            name: "get_my_appointments",
                            description: "Show patient their upcoming appointments",
                            parameters: {
                                type: "object",
                                properties: {
                                    include_past: {
                                        type: "boolean",
                                        description: "Whether to include past appointments",
                                        default: false
                                    },
                                    limit: {
                                        type: "number",
                                        description: "Number of appointments to show",
                                        default: 5
                                    }
                                }
                            }
                        },
                        {
                            type: "function",
                            name: "check_doctor_availability",
                            description: "Check if a doctor is available for appointments on a specific date",
                            parameters: {
                                type: "object",
                                properties: {
                                    doctor_name: {
                                        type: "string",
                                        description: "Name of the doctor to check availability for"
                                    },
                                    date: {
                                        type: "string",
                                        description: "Date to check in YYYY-MM-DD format"
                                    },
                                    specialty: {
                                        type: "string",
                                        description: "Medical specialty of the doctor (optional)"
                                    }
                                },
                                required: ["date"]
                            }
                        },
                        {
                            type: "function",
                            name: "book_appointment",
                            description: "Book a medical appointment for a patient",
                            parameters: {
                                type: "object",
                                properties: {
                                    booking_type: {
                                        type: "string",
                                        enum: ["self", "family", "care_center"],
                                        description: "CRITICAL: Who this appointment is for. MUST ask patient first before collecting other details."
                                    },
                                    patient_firstname: {
                                        type: "string",
                                        description: "Patient's first name (for family/care center bookings)"
                                    },
                                    patient_lastname: {
                                        type: "string",
                                        description: "Patient's last name (for family/care center bookings)"
                                    },
                                    patient_phone: {
                                        type: "string",
                                        description: "Patient's phone number (for family/care center bookings)"
                                    },
                                    patient_dob: {
                                        type: "string",
                                        description: "Patient's date of birth in YYYY-MM-DD format (for family/care center bookings)"
                                    },
                                    patient_age: {
                                        type: "number",
                                        description: "Patient's age (for family/care center bookings)"
                                    },
                                    relationship: {
                                        type: "string",
                                        description: "Caller's relationship to patient (for family bookings: spouse, parent, child, etc.)"
                                    },
                                    care_center_name: {
                                        type: "string",
                                        description: "Name of care center or nursing home (for care center bookings)"
                                    },
                                    care_center_patient_id: {
                                        type: "string",
                                        description: "Patient ID at care center (for care center bookings)"
                                    },
                                    doctor_name: {
                                        type: "string",
                                        description: "Name of the doctor"
                                    },
                                    specialty: {
                                        type: "string",
                                        description: "Doctor's specialty"
                                    },
                                    date: {
                                        type: "string",
                                        description: "Appointment date in YYYY-MM-DD format"
                                    },
                                    time: {
                                        type: "string",
                                        description: "Appointment time in HH:MM format (24-hour)"
                                    },
                                    reason: {
                                        type: "string",
                                        description: "Reason for visit"
                                    }
                                },
                                required: ["booking_type", "doctor_name", "date", "time", "reason"]
                            }
                        },
                        {
                            type: "function",
                            name: "find_patient_appointments",
                            description: "Find existing appointments for a patient",
                            parameters: {
                                type: "object",
                                properties: {
                                    patient_phone: {
                                        type: "string",
                                        description: "Patient's phone number"
                                    },
                                    patient_name: {
                                        type: "string",
                                        description: "Patient's full name"
                                    },
                                    status: {
                                        type: "string",
                                        enum: ["scheduled", "confirmed", "completed", "cancelled", "all"],
                                        description: "Filter by appointment status"
                                    }
                                },
                                required: ["patient_phone"]
                            }
                        },
                        {
                            type: "function",
                            name: "reschedule_appointment",
                            description: "Reschedule an existing appointment",
                            parameters: {
                                type: "object",
                                properties: {
                                    patient_phone: {
                                        type: "string",
                                        description: "Patient's phone number"
                                    },
                                    original_doctor_name: {
                                        type: "string",
                                        description: "Original doctor's name"
                                    },
                                    original_date: {
                                        type: "string",
                                        description: "Original appointment date (YYYY-MM-DD)"
                                    },
                                    new_date: {
                                        type: "string",
                                        description: "New appointment date (YYYY-MM-DD)"
                                    },
                                    new_time: {
                                        type: "string",
                                        description: "New appointment time (HH:MM)"
                                    },
                                    reason: {
                                        type: "string",
                                        description: "Reason for rescheduling"
                                    }
                                },
                                required: ["patient_phone", "new_date", "new_time"]
                            }
                        },
                        {
                            type: "function",
                            name: "cancel_appointment",
                            description: "Cancel an existing appointment",
                            parameters: {
                                type: "object",
                                properties: {
                                    patient_phone: {
                                        type: "string",
                                        description: "Patient's phone number"
                                    },
                                    doctor_name: {
                                        type: "string",
                                        description: "Doctor's name for the appointment"
                                    },
                                    date: {
                                        type: "string",
                                        description: "Appointment date (YYYY-MM-DD)"
                                    },
                                    reason: {
                                        type: "string",
                                        description: "Reason for cancellation"
                                    }
                                },
                                required: ["patient_phone"]
                            }
                        },
                        {
                            type: "function",
                            name: "update_patient_info",
                            description: "Update patient's personal information",
                            parameters: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "Patient's full name" },
                                    email: { type: "string", description: "Email address" },
                                    dob: { type: "string", description: "Date of birth (YYYYMMDD)" },
                                    age: { type: "number", description: "Age" },
                                    gender: { type: "string", description: "Gender" },
                                    preferred_doctor: { type: "string", description: "Preferred doctor name" },
                                    preferred_time: { type: "string", description: "Preferred appointment time" }
                                }
                            }
                        },
                        {
                            type: "function",
                            name: "request_prescription_refill",
                            description: "Process a prescription refill request",
                            parameters: {
                                type: "object",
                                properties: {
                                    patient_name: {
                                        type: "string",
                                        description: "Patient's full name"
                                    },
                                    patient_phone: {
                                        type: "string",
                                        description: "Patient's phone number"
                                    },
                                    medication_name: {
                                        type: "string",
                                        description: "Name of the medication to refill"
                                    },
                                    prescribing_doctor: {
                                        type: "string",
                                        description: "Name of the doctor who prescribed the medication"
                                    },
                                    last_refill_date: {
                                        type: "string",
                                        description: "Date of last refill in YYYY-MM-DD format"
                                    },
                                    reason_for_refill: {
                                        type: "string",
                                        enum: ["routine_refill", "lost_medication", "going_on_trip", "urgent_need", "other"],
                                        description: "Reason for requesting refill"
                                    },
                                    urgency: {
                                        type: "string",
                                        enum: ["routine", "urgent", "emergency"],
                                        description: "Urgency level of the refill request"
                                    },
                                    pharmacy_name: {
                                        type: "string",
                                        description: "Preferred pharmacy name"
                                    },
                                    additional_notes: {
                                        type: "string",
                                        description: "Any additional notes or special instructions"
                                    }
                                },
                                required: ["patient_name", "medication_name", "prescribing_doctor", "reason_for_refill"]
                            }
                        },
                        {
                            type: "function",
                            name: "end_call",
                            description: "CRITICAL: You must say your complete goodbye message BEFORE calling this function. After calling this function, you will NOT be able to say anything else. Example flow: 'Thank you for calling! Have a wonderful day!' [then call end_call]. Do NOT call this function until you have finished speaking your goodbye.",
                            parameters: {
                                type: "object",
                                properties: {
                                    reason: {
                                        type: "string",
                                        description: "Reason for ending",
                                        enum: ["conversation_complete", "patient_goodbye", "patient_finished"]
                                    }
                                },
                                required: ["reason"]
                            }
                        },
                        {
                            type: "function",
                            name: "verify_patient_identity",
                            description: "Verify patient identity for outbound calls",
                            parameters: {
                                type: "object",
                                properties: {
                                    name_provided: { type: "string", description: "Name provided by person answering" },
                                    verification_method: {
                                        type: "string",
                                        enum: ["name_match", "phone_confirmation", "dob_check"],
                                        description: "Method used to verify identity"
                                    },
                                    verified: { type: "boolean", description: "Whether identity was verified" }
                                },
                                required: ["verification_method", "verified"]
                            }
                        },
                        {
                            type: "function",
                            name: "confirm_appointment_reminder",
                            description: "Confirm appointment reminder details with patient",
                            parameters: {
                                type: "object",
                                properties: {
                                    appointment_confirmed: { type: "boolean", description: "Whether patient confirmed appointment" },
                                    needs_reschedule: { type: "boolean", description: "Whether patient needs to reschedule" },
                                    patient_notes: { type: "string", description: "Any notes from patient" }
                                },
                                required: ["appointment_confirmed"]
                            }
                        },
                        {
                            type: "function",
                            name: "record_follow_up_response",
                            description: "Record patient's response to follow-up call",
                            parameters: {
                                type: "object",
                                properties: {
                                    health_status: {
                                        type: "string",
                                        enum: ["improving", "same", "worse", "concerning"],
                                        description: "Patient's health status since last visit"
                                    },
                                    has_concerns: { type: "boolean", description: "Whether patient has health concerns" },
                                    concerns_description: { type: "string", description: "Description of patient concerns" },
                                    needs_appointment: { type: "boolean", description: "Whether patient needs follow-up appointment" },
                                    satisfaction_rating: {
                                        type: "string",
                                        enum: ["very_satisfied", "satisfied", "neutral", "dissatisfied", "very_dissatisfied"],
                                        description: "Patient satisfaction with recent care"
                                    }
                                },
                                required: ["health_status", "has_concerns"]
                            }
                        },
                        {
                            type: "function",
                            name: "schedule_callback",
                            description: "Schedule a callback for later if patient is busy",
                            parameters: {
                                type: "object",
                                properties: {
                                    preferred_time: { type: "string", description: "Patient's preferred callback time" },
                                    preferred_date: { type: "string", description: "Patient's preferred callback date" },
                                    reason: { type: "string", description: "Reason for callback" }
                                },
                                required: ["preferred_time", "reason"]
                            }
                        },
                        {
                            type: "function",
                            name: "transfer_to_human",
                            description: "Transfer the caller to a human representative when they request to speak with a real person, human, or staff member",
                            parameters: {
                                type: "object",
                                properties: {
                                    reason: {
                                        type: "string",
                                        description: "Reason for transfer (e.g., 'patient_request', 'complex_issue', 'billing_question')"
                                    },
                                    urgency: {
                                        type: "string",
                                        enum: ["normal", "urgent", "emergency"],
                                        description: "Urgency level of the transfer",
                                        default: "normal"
                                    },
                                    department: {
                                        type: "string",
                                        enum: ["general", "billing", "scheduling", "medical", "emergency"],
                                        description: "Which department to transfer to",
                                        default: "general"
                                    },
                                    caller_notes: {
                                        type: "string",
                                        description: "Brief notes about what the caller needs help with"
                                    }
                                },
                                required: ["reason"]
                            }
                        },
                        {
                            type: "function",
                            name: "check_patient_exists",
                            description: "Check if a patient already exists in the system. Use this BEFORE creating new patients for family or care center bookings to prevent duplicates.",
                            parameters: {
                                type: "object",
                                properties: {
                                    phone: {
                                        type: "string",
                                        description: "Patient's phone number"
                                    },
                                    first_name: {
                                        type: "string",
                                        description: "Patient's first name"
                                    },
                                    last_name: {
                                        type: "string",
                                        description: "Patient's last name"
                                    },
                                    dob: {
                                        type: "string",
                                        description: "Patient's date of birth (YYYY-MM-DD)"
                                    },
                                    patient_id: {
                                        type: "string",
                                        description: "Care center patient ID"
                                    },
                                    booking_type: {
                                        type: "string",
                                        enum: ["family", "care_center"],
                                        description: "Type of booking"
                                    }
                                },
                                required: ["booking_type"]
                            }
                        },
                        {
                            type: "function",
                            name: "get_family_appointments",
                            description: "Retrieve all upcoming appointments for the caller's family members",
                            parameters: {
                                type: "object",
                                properties: {
                                    include_self: {
                                        type: "boolean",
                                        description: "Whether to include caller's own appointments",
                                        default: true
                                    }
                                }
                            }
                        }
                    ],
                    tool_choice: "auto",
                    max_output_tokens: "inf",
                }
            };

            openAiWs.send(JSON.stringify(sessionUpdate));

            // Send initial greeting after a short delay to ensure stream is ready
            setTimeout(() => {
                sendInitialConversationItem();
            }, 200);
        });

        // Listen for messages from OpenAI WebSocket
        openAiWs.on('message', async (data) => {
            try {
                const response = JSON.parse(data);

                if (response.type === 'response.output_audio.delta' && response.delta) {
                    audioChunkCount++;

                    // Check if we have streamSid and connection is ready
                    if (!streamSid || connection.readyState !== WebSocket.OPEN) {
                        console.error('Cannot send audio - connection not ready, state:', connection.readyState);
                        return;
                    }

                    // Send audio to Twilio
                    const audioDelta = {
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: response.delta }
                    };

                    connection.send(JSON.stringify(audioDelta));

                    // Timing and mark handling
                    if (!responseStartTimestampTwilio) {
                        responseStartTimestampTwilio = latestMediaTimestamp;
                    }

                    if (response.item_id) {
                        lastAssistantItem = response.item_id;
                    }
                    // Send regular marks
                    if (!callEndingInProgress) {
                        sendMark(connection, streamSid);
                    }
                }

                if (response.type === 'input_audio_buffer.speech_started') {
                    console.log('User started speaking');
                    isUserSpeaking = true;
                    userAudioBuffer.clear();

                    // Clear any pending timeout
                    if (speechEndTimeout) {
                        clearTimeout(speechEndTimeout);
                        speechEndTimeout = null;
                    }

                    handleSpeechStartedEvent();
                }

                if (response.type === 'input_audio_buffer.speech_stopped') {
                    console.log('User stopped speaking');
                    isUserSpeaking = false;

                    // Wait a bit to ensure we have all audio
                    speechEndTimeout = setTimeout(async () => {
                        await processUserSpeech();
                    }, 300);
                }

                if (response.type === 'conversation.item.input_audio_transcription.completed') {
                    addToTranscript('User', response.transcript);
                }

                if (response.type === 'response.output_audio_transcript.done') {
                    addToTranscript('AI', response.transcript);
                }

                if (response.type === 'response.function_call_arguments.done') {
                    console.log('Function call:', response.name, response.arguments);
                    handleFunctionCall(response.call_id, response.name, JSON.parse(response.arguments));
                }

                if (response.type === 'session.created') {
                    console.log('OpenAI session created:', response.session.id);
                }
                // Detect when final message is complete
                if (response.type === 'response.output_audio.done') {
                    if (callEndingInProgress) {
                        sendFinalMessageMark(connection, streamSid);
                    }
                }

            } catch (error) {
                console.error('Error processing OpenAI message:', error);
            }
        });

        openAiWs.on('close', () => {
            console.log('Disconnected from OpenAI API');
        });

        openAiWs.on('error', (error) => {
            console.error('OpenAI WebSocket error:', error);
        });
    };

    // Send initial conversation item
    function sendInitialConversationItem() {
        const greetingType = callContext?.type === 'outbound' ? 'outbound' : 'inbound';
        const greetingMessage = `This is a ${greetingType} call ${greetingType === 'outbound' ? `for ${callContext.callType || 'general purpose'}` : ''}. ${patientData ? `Patient ${patientData.firstName} is ${greetingType === 'outbound' ? 'being called' : 'calling'}` : 'A new patient is calling'}. Follow your instructions and greet them appropriately.`;

        const initialConversationItem = {
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: greetingMessage
                    }
                ]
            }
        };

        openAiWs.send(JSON.stringify(initialConversationItem));
        openAiWs.send(JSON.stringify({ type: 'response.create' }));
    }

    // Handle speech started event
    const handleSpeechStartedEvent = () => {
    console.log('🎤 User started speaking - INTERRUPTING AI');
    
    // CRITICAL: Always clear Twilio audio immediately
    if (streamSid && connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify({ 
            event: 'clear', 
            streamSid: streamSid 
        }));
    }
    
    // Cancel OpenAI response generation
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        openAiWs.send(JSON.stringify({ 
            type: 'response.cancel' 
        }));
    }
    
    // Try to truncate if possible
    if (lastAssistantItem && responseStartTimestampTwilio) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        openAiWs.send(JSON.stringify({
            type: 'conversation.item.truncate',
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime
        }));
    }
    
    // Reset state
    markQueue = [];
    lastAssistantItem = null;
    responseStartTimestampTwilio = null;
};

    // Send mark to track audio chunks
    const sendMark = (connection, streamSid) => {
        if (connection && connection.readyState === WebSocket.OPEN) {
            const markEvent = {
                event: 'mark',
                streamSid: streamSid,
                mark: { name: 'responsePart' }
            };
            connection.send(JSON.stringify(markEvent));
            markQueue.push('responsePart');
        }
    };

    // Send final message mark
    const sendFinalMessageMark = (connection, streamSid) => {
        if (!finalMessageMarkSent && connection && connection.readyState === WebSocket.OPEN) {
            console.log('Sending final message mark');
            const finalMarkEvent = {
                event: 'mark',
                streamSid: streamSid,
                mark: { name: 'finalMessage' }
            };
            connection.send(JSON.stringify(finalMarkEvent));
            markQueue.push('finalMessage');
            finalMessageMarkSent = true;
        }
    };

    // Handle function calls
    const handleFunctionCall = async (callId, functionName, args) => {
        try {
            console.log('Executing function:', functionName);
            let result = {};

            switch (functionName) {
                case 'end_call':
                    callEndingInProgress = true;

                    result = {
                        success: true,
                        message: "Call ending gracefully. The AI should have already said goodbye.",
                        action: "ending_call"
                    };

                    console.log('END_CALL function triggered');

                    const endCallResponse = {
                        type: 'conversation.item.create',
                        item: {
                            type: 'function_call_output',
                            call_id: callId,
                            output: JSON.stringify(result)
                        }
                    };
                    openAiWs.send(JSON.stringify(endCallResponse));
                    setTimeout(() => {
                        console.log('Timeout reached, ending call');
                        endCallSafely();
                    }, 5000);
                    return;

                case 'get_my_appointments':
                    result = {
                        success: true,
                        upcoming_appointments: upcomingAppointments,
                        total_count: upcomingAppointments.length,
                        message: upcomingAppointments.length > 0
                            ? `You have ${upcomingAppointments.length} upcoming appointment${upcomingAppointments.length > 1 ? 's' : ''}`
                            : "You don't have any upcoming appointments scheduled"
                    };
                    break;

                case 'check_doctor_availability':
                    detectedIntent = 'check_availability';
                    extractedEntities = { ...extractedEntities, ...args };
                    result = await checkDoctorAvailability({
                        doctor_name: args.doctor_name,
                        date: args.date,
                        specialty: args.specialty
                    });
                    break;

                // case 'book_appointment':
                //     detectedIntent = 'book_appointment';

                //     const hospitalContext = {
                //         hospitalId: callContext?.hospital?._id || callContext?.hospital?.id || process.env.DEFAULT_HOSPITAL_ID
                //     };

                //     // Use stored patient data for returning patients
                //     const appointmentData = {
                //         patient_firstname: args.patient_firstname || patientData?.firstName,
                //         patient_lastname: args.patient_lastname || patientData?.lastName,
                //         patient_phone: args.patient_phone || patientData?.phone || from,
                //         patient_dob: args.patient_dob || patientData?.dob,
                //         patient_age: args.patient_age || patientData?.age,
                //         doctor_name: args.doctor_name,
                //         date: args.date,
                //         time: args.time,
                //         reason: args.reason,
                //         doctorInfo: {
                //             name: args.doctor_name,
                //             specialty: args.specialty || 'General Practice'
                //         },
                //         hospitalContext
                //     };

                //     extractedEntities = { ...extractedEntities, ...appointmentData };
                //     result = await bookAppointment(appointmentData);

                //     // Refresh appointments after booking
                //     if (result.success) {
                //         // For EMR-only: use FHIR ID if available
                //         const patientFhirIdToUpdate = result.patientFhirId || patientData?.fhirId;

                //         if (patientFhirIdToUpdate) {
                //             await updatePatientFromCall({
                //                 patientFhirId: patientFhirIdToUpdate,
                //                 doctor_name: appointmentData.doctor_name,
                //                 date: appointmentData.date,
                //                 time: appointmentData.time,
                //                 reason: appointmentData.reason
                //             });
                //         }

                //         // Refresh appointments from FHIR
                //         if (patientFhirId) {
                //             upcomingAppointments = await getUpcomingAppointments(patientFhirId);
                //         }
                //     }
                //     break;

                case 'book_appointment':
                    detectedIntent = 'book_appointment';

                    const hospitalContext = {
                        hospitalId: callContext?.hospital?._id || callContext?.hospital?.id || process.env.DEFAULT_HOSPITAL_ID
                    };

                    // Determine the patient and caller based on booking_type
                    let appointmentData;

                    if (args.booking_type === 'self') {
                        // For self-booking, use caller's information
                        appointmentData = {
                            booking_type: 'self',
                            patient_firstname: args.patient_firstname || patientData?.firstName,
                            patient_lastname: args.patient_lastname || patientData?.lastName,
                            patient_phone: args.patient_phone || patientData?.phone || from,
                            patient_dob: args.patient_dob || patientData?.dob,
                            patient_age: args.patient_age || patientData?.age,
                            doctor_name: args.doctor_name,
                            date: args.date,
                            time: args.time,
                            reason: args.reason,
                            doctorInfo: {
                                name: args.doctor_name,
                                specialty: args.specialty || 'General Practice'
                            },
                            hospitalContext
                        };
                    } else if (args.booking_type === 'family') {
                        // For family booking, collect family member info separately
                        appointmentData = {
                            booking_type: 'family',
                            patient_firstname: args.patient_firstname,  // Family member's name
                            patient_lastname: args.patient_lastname,
                            patient_phone: args.patient_phone,          // Family member's phone (may be same as caller)
                            patient_dob: args.patient_dob,
                            patient_age: args.patient_age,
                            relationship: args.relationship,            // e.g., "son", "mother"
                            caller_phone: from,                         // *** NEW: Caller's phone ***
                            doctor_name: args.doctor_name,
                            date: args.date,
                            time: args.time,
                            reason: args.reason,
                            doctorInfo: {
                                name: args.doctor_name,
                                specialty: args.specialty || 'General Practice'
                            },
                            hospitalContext
                        };
                    } else if (args.booking_type === 'care_center') {
                        // For care center bookings
                        appointmentData = {
                            booking_type: 'care_center',
                            patient_firstname: args.patient_firstname,
                            patient_lastname: args.patient_lastname,
                            patient_phone: args.patient_phone,
                            patient_dob: args.patient_dob,
                            patient_age: args.patient_age,
                            care_center_name: args.care_center_name,
                            care_center_patient_id: args.care_center_patient_id,
                            caller_phone: from,                         // *** NEW: Caller's phone ***
                            doctor_name: args.doctor_name,
                            date: args.date,
                            time: args.time,
                            reason: args.reason,
                            doctorInfo: {
                                name: args.doctor_name,
                                specialty: args.specialty || 'General Practice'
                            },
                            hospitalContext
                        };
                    }

                    extractedEntities = { ...extractedEntities, ...appointmentData };
                    result = await bookAppointment(appointmentData);

                    // Refresh appointments after booking
                    if (result.success) {
                        // For EMR-only: use FHIR ID if available
                        const patientFhirIdToUpdate = result.patientFhirId || patientData?.fhirId;

                        if (patientFhirIdToUpdate) {
                            await updatePatientFromCall({
                                patientFhirId: patientFhirIdToUpdate,
                                doctor_name: appointmentData.doctor_name,
                                date: appointmentData.date,
                                time: appointmentData.time,
                                reason: appointmentData.reason
                            });
                        }

                        // Refresh appointments from FHIR
                        if (patientFhirId) {
                            upcomingAppointments = await getUpcomingAppointments(patientFhirId);
                        }
                    }
                    break;

                case 'find_patient_appointments':
                    detectedIntent = 'find_appointments';
                    extractedEntities = { ...extractedEntities, ...args };
                    result = await findPatientAppointments(args);
                    break;

                case 'reschedule_appointment':
                    detectedIntent = 'reschedule_appointment';
                    extractedEntities = { ...extractedEntities, ...args };

                    // Ensure phone comes from callLog if missing
                    if (!args.patient_phone && callLog?.from) {
                        args.patient_phone = callLog.from;
                    }

                    result = await rescheduleAppointmentByDetails(args);
                    break;

                case 'cancel_appointment':
                    detectedIntent = 'cancel_appointment';
                    extractedEntities = { ...extractedEntities, ...args };

                    // Ensure phone comes from callLog if missing
                    if (!args.patient_phone && callLog?.from) {
                        args.patient_phone = callLog.from;
                    }

                    result = await cancelAppointmentByDetails(args);
                    break;

                case 'check_patient_exists':
                    detectedIntent = 'check_patient';
                    console.log('Checking if patient exists in FHIR');

                    extractedEntities = { ...extractedEntities, patient_search: args };
                    result = await checkPatientExists(args, args.booking_type);
                    break;

                case 'request_prescription_refill':
                    detectedIntent = 'prescription_refill';

                    // Use stored patient data
                    const refillData = {
                        patient_name: args.patient_name || patientData?.firstName,
                        patient_phone: args.patient_phone || patientData?.phone || from,
                        ...args
                    };

                    extractedEntities = { ...extractedEntities, ...refillData };
                    result = await processPrescriptionRefill(refillData);
                    break;

                case 'update_patient_info':
                    detectedIntent = 'update_patient';
                    console.log('Updating patient info in FHIR');

                    // Use patientData with fhirId
                    if (patientData?.fhirId) {
                        result = await updatePatientInfo(patientData.fhirId, args);
                        extractedEntities = { ...extractedEntities, patient_info: args };
                    } else if (patientFhirId) {
                        // Use patientFhirId from context
                        result = await updatePatientInfo(patientFhirId, args);
                        extractedEntities = { ...extractedEntities, patient_info: args };
                    } else {
                        result = {
                            success: false,
                            message: "Patient ID not available"
                        };
                    }
                    break;

                case 'verify_patient_identity':
                    result = {
                        success: true,
                        verified: args.verified,
                        method_used: args.verification_method,
                        message: args.verified ? "Patient identity verified" : "Could not verify patient identity"
                    };
                    extractedEntities = { ...extractedEntities, identity_verification: args };
                    break;

                case 'confirm_appointment_reminder':
                    detectedIntent = 'appointment_reminder_response';
                    extractedEntities = { ...extractedEntities, appointment_reminder: args };

                    // Update the appointment reminder status in FHIR
                    if (callContext.appointmentFhirId && callContext.reminderType) {
                        try {
                            const appointmentResult = await fhirService.getAppointment(callContext.appointmentFhirId);

                            if (appointmentResult.success) {
                                const appointment = appointmentResult.data;

                                // Add extension for reminder response
                                if (!appointment.extension) {
                                    appointment.extension = [];
                                }

                                appointment.extension.push({
                                    url: `http://hospital.com/fhir/reminder-response-${callContext.reminderType}`,
                                    valueString: args.appointment_confirmed ? 'confirmed' :
                                        args.needs_reschedule ? 'rescheduled' : 'no_response'
                                });

                                await fhirService.updateAppointment(callContext.appointmentFhirId, appointment);
                                console.log(`Updated reminder response in FHIR for appointment ${callContext.appointmentFhirId}: ${callContext.reminderType}`);
                            }
                        } catch (error) {
                            console.error('Error updating reminder response in FHIR:', error);
                        }
                    }

                    result = {
                        success: true,
                        confirmed: args.appointment_confirmed,
                        needs_reschedule: args.needs_reschedule,
                        message: args.appointment_confirmed ? "Thank you for confirming your appointment!" : "I'll help you with rescheduling",
                        reminder_type: callContext.reminderType
                    };
                    break;

                case 'record_follow_up_response':
                    detectedIntent = 'follow_up_recorded';
                    extractedEntities = { ...extractedEntities, follow_up_response: args };
                    result = {
                        success: true,
                        health_status: args.health_status,
                        needs_attention: args.has_concerns || args.health_status === 'worse' || args.health_status === 'concerning',
                        message: "Follow-up response recorded"
                    };
                    break;

                case 'schedule_callback':
                    result = {
                        success: true,
                        callback_scheduled: true,
                        preferred_time: args.preferred_time,
                        message: "Callback scheduled successfully"
                    };
                    extractedEntities = { ...extractedEntities, callback_request: args };
                    break;

                case 'transfer_to_human':
                    detectedIntent = 'transfer_to_human';
                    extractedEntities = { ...extractedEntities, transfer_request: args };

                    // Initiate the transfer
                    result = await initiateTransfer(args);

                    if (result.success) {
                        // Return success but don't continue conversation - transfer is happening
                        result = {
                            success: true,
                            action: 'transfer_initiated',
                            message: 'Transferring you now to our staff. Please hold on.',
                            transfer_number: result.transfer_number,
                            department: args.department || 'general'
                        };

                        // Set a flag to indicate transfer is happening
                        transferInProgress = true;

                        // Send function result
                        const functionResponse = {
                            type: 'conversation.item.create',
                            item: {
                                type: 'function_call_output',
                                call_id: callId,
                                output: JSON.stringify(result)
                            }
                        };

                        openAiWs.send(JSON.stringify(functionResponse));
                        openAiWs.send(JSON.stringify({ type: 'response.create' }));

                        // Execute transfer after AI gives final message
                        setTimeout(() => {
                            executeTransfer(args);
                        }, 5000); // 5 second delay to allow final message

                        return; // Don't continue with normal flow
                    } else {
                        result = {
                            success: false,
                            message: "I apologize, but I'm unable to transfer you right now. Let me try to help you with your question instead.",
                            error: result.error
                        };
                    }
                    break;

                case 'get_family_appointments':
                    result = await getFamilyAppointments(from);

                    if (result.success && result.appointments.length > 0) {
                        result.message = `You have ${result.appointments.length} upcoming appointment${result.appointments.length !== 1 ? 's' : ''} for your family members`;
                    }
                    break;

                default:
                    result = { error: `Unknown function: ${functionName}` };
            }

            // Send function result back to OpenAI
            const functionResponse = {
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(result)
                }
            };

            openAiWs.send(JSON.stringify(functionResponse));
            openAiWs.send(JSON.stringify({ type: 'response.create' }));

        } catch (error) {
            console.error('Error handling function call:', error);

            // Send error response back to OpenAI
            const errorResponse = {
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({ error: error.message })
                }
            };

            openAiWs.send(JSON.stringify(errorResponse));
            // Don't send response.create for errors either during call ending
            if (!callEndingInProgress) {
                openAiWs.send(JSON.stringify({ type: 'response.create' }));
            }
        }
    };

    const addToTranscript = (speaker, message) => {
        conversationTranscript.push({
            speaker,
            text: message,
            timestamp: new Date()
        });
    };

    // Create call log entry using FHIR Communication
    const createCallLog = async (startData, from, to, patientFhirId, type) => {
        try {
            const fhirCommunication = {
                resourceType: 'Communication',
                status: 'in-progress',
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
                sent: new Date().toISOString(),
                payload: [{
                    contentString: JSON.stringify({
                        callSid: startData.callSid || streamSid,
                        from: from || 'unknown',
                        to: to || 'hospital',
                        type: type,
                        callType: callContext.type,
                        callPurpose: callContext.callType,
                        metadata: callContext
                    })
                }]
            };

            if (patientFhirId) {
                fhirCommunication.subject = {
                    reference: `Patient/${patientFhirId}`
                };
            }

            const result = await fhirService.createCommunication(fhirCommunication);

            if (result.success) {
                callLog = result.data;
                console.log('Call log created in FHIR:', result.fhirId);
                return result.fhirId;
            } else {
                console.error('Failed to create call log in FHIR:', result.error);
                return null;
            }
        } catch (error) {
            console.error('Error creating call log in FHIR:', error);
            return null;
        }
    };

    // Finalize call log using FHIR Communication
    const finalizeCallLog = async () => {
        if (!callLogId || isFinalized) return;
        isFinalized = true;

        try {
            const endTime = new Date();
            const startTime = callLog?.sent ? new Date(callLog.sent) : new Date();
            const duration = Math.floor((endTime - startTime) / 1000);

            // Get current communication
            const commResult = await fhirService.getCommunication(callLogId);

            if (commResult.success) {
                const communication = commResult.data;

                // Update status to completed
                communication.status = 'completed';
                communication.received = endTime.toISOString();

                // Update payload with transcript and other data
                communication.payload = [{
                    contentString: JSON.stringify({
                        ...(communication.payload?.[0]?.contentString ? JSON.parse(communication.payload[0].contentString) : {}),
                        endTime: endTime.toISOString(),
                        duration: duration,
                        transcript: conversationTranscript,
                        intent: detectedIntent,
                        entities: extractedEntities,
                        actionTaken: detectedIntent ? 'completed' : 'conversation_only'
                    })
                }];

                await fhirService.updateCommunication(callLogId, communication);
                console.log('Call log finalized in FHIR:', callLogId);
            }
        } catch (error) {
            console.error('Error finalizing call log in FHIR:', error);
        }
    };

    const loadAppointmentData = async (callContext, patientFhirId) => {
        try {
            if (callContext.type === 'outbound' && callContext.callType === 'follow_up') {
                // For follow-up calls, load the PAST appointment being followed up on
                let pastAppointment = null;

                if (callContext.appointmentFhirId) {
                    // Load the specific appointment from FHIR
                    const appointmentResult = await fhirService.getAppointment(callContext.appointmentFhirId);

                    if (appointmentResult.success) {
                        const appointment = appointmentResult.data;
                        const aptDate = new Date(appointment.start);

                        pastAppointment = {
                            id: appointment.id,
                            doctor: appointment.participant?.[0]?.actor?.display || 'Unknown Doctor',
                            specialty: appointment.serviceType?.[0]?.coding?.[0]?.display || '',
                            date: aptDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            }),
                            time: aptDate.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                            }),
                            reason: appointment.description || appointment.reasonCode?.[0]?.text || '',
                            status: appointment.status
                        };
                    }
                }

                // Also get upcoming appointments (but don't emphasize them)
                const upcomingAppointments = await getUpcomingAppointments(patientFhirId);

                return {
                    pastAppointment,
                    upcomingAppointments: upcomingAppointments.slice(0, 2)
                };
            } else {
                // For other calls, just get upcoming appointments
                const upcomingAppointments = await getUpcomingAppointments(patientFhirId);
                return { upcomingAppointments };
            }
        } catch (error) {
            console.error('Error loading appointment data from FHIR:', error);
            return { upcomingAppointments: [] };
        }
    };

    // Get upcoming appointments from FHIR
    const getUpcomingAppointments = async (patientFhirId) => {
        try {
            const now = new Date();

            // Search for appointments in FHIR
            const result = await fhirSearchService.findPatientAppointments(patientFhirId, {
                date: `ge${now.toISOString().split('T')[0]}`,
                status: 'booked,confirmed'
            });

            if (!result.success || !result.appointments) {
                return [];
            }

            // Sort and limit to 5 appointments
            const appointments = result.appointments
                .sort((a, b) => new Date(a.start) - new Date(b.start))
                .slice(0, 5);

            return appointments.map(apt => {
                const aptDate = new Date(apt.start);
                return {
                    id: apt.id,
                    doctor: apt.participant?.[0]?.actor?.display || 'Unknown Doctor',
                    specialty: apt.serviceType?.[0]?.coding?.[0]?.display || '',
                    date: aptDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    time: aptDate.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    reason: apt.description || apt.reasonCode?.[0]?.text || '',
                    status: apt.status,
                    confirmationNumber: `APT-${apt.id.slice(-6).toUpperCase()}`
                };
            });
        } catch (error) {
            console.error('Error fetching upcoming appointments from FHIR:', error);
            return [];
        }
    };

    function endCallSafely() {
        if (!isFinalized) {
            console.log('Ending call gracefully...');

            setTimeout(async () => {
                await finalizeCallLog();

                if (connection && connection.readyState === WebSocket.OPEN) {
                    console.log('Closing Twilio connection');
                    connection.close();
                }

                if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                    console.log('Closing OpenAI connection');
                    openAiWs.close();
                }
            }, 1000); // Give time for final audio to complete
        }
    };

    function ulawToPcm16(ulawBuffer) {
        const pcm16Buffer = Buffer.alloc(ulawBuffer.length * 2);

        // Î¼-law decompression table for faster lookup
        const ulawTable = [
            -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
            -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
            -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
            -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
            -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
            -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
            -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
            -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
            -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
            -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
            -876, -844, -812, -780, -748, -716, -684, -652,
            -620, -588, -556, -524, -492, -460, -428, -396,
            -372, -356, -340, -324, -308, -292, -276, -260,
            -244, -228, -212, -196, -180, -164, -148, -132,
            -120, -112, -104, -96, -88, -80, -72, -64,
            -56, -48, -40, -32, -24, -16, -8, 0,
            32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
            23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
            15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
            11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
            7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
            5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
            3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
            2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
            1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
            1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
            876, 844, 812, 780, 748, 716, 684, 652,
            620, 588, 556, 524, 492, 460, 428, 396,
            372, 356, 340, 324, 308, 292, 276, 260,
            244, 228, 212, 196, 180, 164, 148, 132,
            120, 112, 104, 96, 88, 80, 72, 64,
            56, 48, 40, 32, 24, 16, 8, 0
        ];

        for (let i = 0; i < ulawBuffer.length; i++) {
            const sample = ulawTable[ulawBuffer[i]];
            pcm16Buffer.writeInt16LE(sample, i * 2);
        }

        return pcm16Buffer;
    };

    const initiateTransfer = async (transferArgs) => {
        try {
            // Get hospital information from call context
            const hospitalPhone = callContext?.hospital?.phonenumber || process.env.HOSPITAL_MAIN_PHONE;

            if (!hospitalPhone) {
                return {
                    success: false,
                    error: "Hospital contact number not available"
                };
            }

            // Log the transfer request
            console.log(`Transfer requested: ${transferArgs.reason} to ${transferArgs.department || 'general'}`);

            return {
                success: true,
                transfer_number: hospitalPhone,
                department: transferArgs.department || 'general'
            };

        } catch (error) {
            console.error('Error initiating transfer:', error);
            return {
                success: false,
                error: error.message
            };
        }
    };

    const executeTransfer = async (transferArgs) => {
        try {
            const hospitalPhone = callContext?.hospital?.phonenumber || process.env.HOSPITAL_MAIN_PHONE;

            if (!hospitalPhone || !streamSid) {
                console.error('Cannot execute transfer - missing phone or streamSid');
                return;
            }

            // Update call log with transfer information in FHIR
            if (callLogId) {
                try {
                    const commResult = await fhirService.getCommunication(callLogId);

                    if (commResult.success) {
                        const communication = commResult.data;
                        const currentPayload = communication.payload?.[0]?.contentString ?
                            JSON.parse(communication.payload[0].contentString) : {};

                        communication.payload = [{
                            contentString: JSON.stringify({
                                ...currentPayload,
                                actionTaken: 'transferred_to_human',
                                transferReason: transferArgs.reason,
                                transferDepartment: transferArgs.department || 'general',
                                transferredAt: new Date().toISOString()
                            })
                        }];

                        await fhirService.updateCommunication(callLogId, communication);
                    }
                } catch (error) {
                    console.error('Error updating communication with transfer info:', error);
                }
            }

            // Execute the transfer via Twilio
            await performTwilioTransfer(hospitalPhone, transferArgs);

        } catch (error) {
            console.error('Error executing transfer:', error);
        }
    };

    const performTwilioTransfer = async (phoneNumber, transferArgs) => {
        try {
            // Get the current call SID from context
            const twilioCallSid = callContext?.twilioCallSid;

            if (!twilioCallSid) {
                console.error('No Twilio Call SID available for transfer');
                return;
            }

            // Initialize Twilio client
            const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

            // Update the call to transfer to the hospital number
            await twilioClient.calls(twilioCallSid)
                .update({
                    twiml: `<Response>
                    <Say voice="alice">Please hold while I transfer you to our staff.</Say>
                    <Dial timeout="30" record="false">
                        <Number>${phoneNumber}</Number>
                    </Dial>
                    <Say voice="alice">I'm sorry, but no one is available right now. Please try calling back or leave a message after the tone.</Say>
                    <Record timeout="60" transcribe="false" />
                </Response>`
                });

            console.log(`Call ${twilioCallSid} transferred to ${phoneNumber}`);

            // Close WebSocket connections since call is now transferred
            if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.close();
            }

            // Mark call as transferred
            await finalizeCallLog();

        } catch (error) {
            console.error('Error performing Twilio transfer:', error);

            // If transfer fails, try to continue conversation
            const fallbackMessage = {
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "user",
                    content: [{
                        type: "input_text",
                        text: "The transfer failed. Please apologize and offer to help the caller with their question instead."
                    }]
                }
            };

            if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify(fallbackMessage));
                openAiWs.send(JSON.stringify({ type: 'response.create' }));
            }
        }
    };

    async function processUserSpeech() {
        if (transcriptionInProgress || !userAudioBuffer.hasEnoughAudio()) {
            console.log('Skipping transcription - insufficient audio or already in progress');
            return;
        }

        transcriptionInProgress = true;

        try {
            const audioBuffer = userAudioBuffer.getBuffer();
            const audioSize = userAudioBuffer.getSize();

            // Call transcription service
            const result = await transcribeAudio(audioBuffer, 'mulaw');

            if (result.success && result.text) {

                // Add to transcript
                addToTranscript('User', result.text);

                // Optional: Send transcription to OpenAI for context
                const contextItem = {
                    type: "conversation.item.create",
                    item: {
                        type: "message",
                        role: "user",
                        content: [{
                            type: "input_text",
                            text: `[User said: "${result.text}"]`
                        }]
                    }
                };

                if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                    openAiWs.send(JSON.stringify(contextItem));
                }
            } else {
                console.log('Transcription failed or returned empty text');
            }

        } catch (error) {
            console.error('Error processing user speech:', error);
        } finally {
            transcriptionInProgress = false;
            userAudioBuffer.clear();
        }
    }
}