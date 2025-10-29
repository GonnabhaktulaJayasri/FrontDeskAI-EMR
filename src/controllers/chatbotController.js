import OpenAI from 'openai';
import fhirService from '../services/fhirService.js';
import fhirSearchService from '../services/fhirSearchService.js';
import callService from '../services/callService.js';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Store conversation state (in production, use Redis or DB)
const conversationStates = new Map();

// System prompt for the chatbot
const SYSTEM_PROMPT = `You are a friendly, intelligent, and professional healthcare virtual assistant for Orion West Medical practice. 

**INITIAL GREETING:**
When a user joins the chat, greet them warmly:
"Hello! Thank you for reaching out to Orion West Medical. I'm your virtual assistant. How can I help you today?"

After the user responds to your greeting, politely ask: "Have you visited our practice before?"

**HANDLING RETURNING PATIENTS (User says "Yes"):**
1. Ask for their registered phone number to locate their record in the EMR system
2. If their details are found in EMR:
   - Greet them warmly by name
   - Ask how you can assist them today
   - Help with: checking appointments, rescheduling, canceling, updating details, or answering questions
3. If their record is NOT found:
   - Politely inform them their phone number wasn't found
   - Ask if they would like to create a new patient record

**CHECKING APPOINTMENTS:**
When user asks about their appointments:
- "What are my appointments?"
- "Do I have any appointments?"
- "When is my next appointment?"
System will automatically retrieve and display their upcoming appointments with:
- Date and time
- Doctor name and specialty
- Reason for visit
- Appointment status
If no appointments: Offer to book one

**HANDLING NEW PATIENTS (User says "No"):**
1. Start collecting necessary details ONE BY ONE in this order:
   - First name
   - Last name
   - Phone number
   - Email address
   - Age
   - Gender (Male/Female/Other)
   - Date of birth (MM/DD/YYYY)
2. After collecting all details, system will automatically create the record
3. Thank them and say: "Thank you! Your patient record has been created successfully. How can I assist you further today?"

**APPOINTMENT BOOKING:**
When user wants to book an appointment:
1. First ask: "Who would you like to book this appointment for?"
   - Yourself
   - A family member
   - Someone in your care (e.g., elderly parent, child)
2. If booking for someone else:
   - Ask for their details (name, age, relationship)
   - Confirm the callback number (their number or patient's number)
3. Then say: "I'll initiate a call right now to confirm the details and complete your appointment booking."

**APPOINTMENT MANAGEMENT:**
- **Scheduling/Booking**: Say "I'll call you now to complete your appointment booking."
- **Rescheduling**: Say "I'll call you now to reschedule your appointment to a more convenient time."
- **Canceling**: Say "I understand. I'll call you to confirm the cancellation."

**UPDATING PATIENT DETAILS:**
1. Ask which information they want to change (email, phone, address, etc.)
2. Request the new information
3. System will update in EMR directly
4. Confirm: "I've successfully updated your [field] to [new value]. Your information has been updated in our medical records system."

**ANSWERING QUERIES:**
- Appointments: Check their record and provide accurate appointment information
- Services: Provide information about available medical services
- Doctors: Share information about available doctors and specialties
- Clinic timings: Provide accurate timing information
- General questions: Answer helpfully and professionally

**CONVERSATION GUIDELINES:**
- Always maintain a polite and empathetic tone
- NEVER repeat information already provided
- Ensure all actions are confirmed before proceeding
- Keep responses concise (2-4 sentences)
- Sound natural and professional
- Handle both new and returning patients smoothly

**CLOSING CONVERSATIONS:**
When user says "thank you", "no more questions", "that's all", "nothing else", or similar:
End gracefully: "You're most welcome! It was a pleasure assisting you today. Take care and have a great day!"

**CRITICAL RULES:**
- One question at a time - don't overwhelm patients
- Always confirm actions before executing
- Be warm but professional
- Never make up information
- If unsure, offer to have staff call them
- Respect patient privacy

Remember: You represent Orion West Medical - be helpful, accurate, and caring in every interaction.`;

/**
 * ✅ Check if we have all required patient information
 */
function checkIfHasRequiredPatientInfo(patientData) {
    const required = ['firstName', 'lastName', 'phone', 'email', 'age', 'gender', 'dob'];
    const critical = ['firstName', 'lastName', 'phone', 'email'];
    
    const missing = [];
    const present = [];
    const criticalMissing = [];
    
    for (const field of required) {
        if (!patientData[field] || patientData[field].toString().trim() === '') {
            missing.push(field);
            if (critical.includes(field)) {
                criticalMissing.push(field);
            }
        } else {
            present.push(field);
        }
    }
    
    const canCreate = criticalMissing.length === 0;
    const complete = missing.length === 0;
    
    return {
        complete: complete,
        canCreate: canCreate,
        missing: missing,
        criticalMissing: criticalMissing,
        present: present,
        percentComplete: Math.round((present.length / required.length) * 100)
    };
}

/**
 * Convert chatbot patient data to FHIR Patient resource
 */
function convertToFHIRPatient(patientData) {
    const fhirPatient = {
        resourceType: 'Patient',
        name: [{
            use: 'official',
            family: patientData.lastName,
            given: [patientData.firstName]
        }],
        telecom: []
    };

    if (patientData.phone) {
        fhirPatient.telecom.push({
            system: 'phone',
            value: normalizePhoneNumber(patientData.phone),
            use: 'mobile'
        });
    }

    if (patientData.email) {
        fhirPatient.telecom.push({
            system: 'email',
            value: patientData.email
        });
    }

    if (patientData.gender) {
        fhirPatient.gender = patientData.gender.toLowerCase();
    }

    if (patientData.dob) {
        // Convert MM/DD/YYYY to YYYY-MM-DD
        const parts = patientData.dob.split('/');
        if (parts.length === 3) {
            fhirPatient.birthDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
    }

    return fhirPatient;
}

/**
 * Initialize chat conversation
 */
export const initializeChat = async (req, res) => {
    try {
        const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const context = await gatherContextualInformation(req);

        conversationStates.set(sessionId, {
            stage: 'greeting',
            patientData: {},
            appointmentData: {
                bookingFor: null,
                patientName: null,
                patientAge: null,
                relationship: null,
                callbackNumber: null
            },
            messages: [],
            context: context,
            startTime: new Date(),
            lastActivity: new Date(),
            callStatus: null,
            callAttempted: false,
            appointmentInfoShared: false,
            conversationEnding: false,
            updateMode: null,
            pendingUpdate: null
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: "User just joined the chat. Greet them warmly as instructed." }
            ],
            temperature: 0.7,
            max_tokens: 150
        });

        const aiMessage = completion.choices[0].message.content;

        const state = conversationStates.get(sessionId);
        state.messages.push(
            { role: "system", content: SYSTEM_PROMPT },
            { role: "assistant", content: aiMessage }
        );
        conversationStates.set(sessionId, state);

        logChatInitialization(sessionId, context);

        res.json({
            success: true,
            sessionId,
            message: aiMessage,
            stage: 'greeting',
            context: {
                timeOfDay: context.timeOfDay,
                isReturningVisitor: context.isReturningVisitor
            }
        });

    } catch (error) {
        console.error('Error initializing chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize chat',
            details: error.message
        });
    }
};

/**
 * Handle incoming message from user
 */
export const sendMessage = async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        if (!sessionId || !message) {
            return res.status(400).json({
                success: false,
                error: 'Session ID and message are required'
            });
        }

        const state = conversationStates.get(sessionId);
        
        if (!state) {
            return res.status(404).json({
                success: false,
                error: 'Session not found. Please start a new conversation.'
            });
        }

        state.lastActivity = new Date();
        const userMessage = message.trim();

        console.log(`\n📩 [${sessionId}] User: ${userMessage}`);
        console.log(`   Stage: ${state.stage}`);

        // Handle "Yes" for returning patients
        if (state.stage === 'awaiting_confirmation' && 
            (userMessage.toLowerCase() === 'yes' || userMessage.toLowerCase().includes('yes'))) {
            
            state.stage = 'awaiting_phone';
            state.patientData.isReturning = true;
            conversationStates.set(sessionId, state);

            state.messages.push({ role: "user", content: userMessage });

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    ...state.messages,
                    { role: "system", content: "User confirmed they have visited before. Ask for their phone number to locate their record." }
                ],
                temperature: 0.7,
                max_tokens: 100
            });

            const aiMessage = completion.choices[0].message.content;
            state.messages.push({ role: "assistant", content: aiMessage });
            conversationStates.set(sessionId, state);

            console.log(`🤖 Bot: ${aiMessage}`);

            return res.json({
                success: true,
                message: aiMessage,
                stage: state.stage
            });
        }

        // Handle "No" for new patients
        if (state.stage === 'awaiting_confirmation' && 
            (userMessage.toLowerCase() === 'no' || userMessage.toLowerCase().includes('no'))) {
            
            state.stage = 'new_patient_registration';
            state.patientData.isReturning = false;
            state.patientData.notFoundInSystem = true;
            conversationStates.set(sessionId, state);

            state.messages.push({ role: "user", content: userMessage });

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    ...state.messages,
                    { role: "system", content: "User is NEW patient. Start collecting details one by one. Ask for first name first." }
                ],
                temperature: 0.7,
                max_tokens: 100
            });

            const aiMessage = completion.choices[0].message.content;
            state.messages.push({ role: "assistant", content: aiMessage });
            conversationStates.set(sessionId, state);

            console.log(`🤖 Bot: ${aiMessage}`);

            return res.json({
                success: true,
                message: aiMessage,
                stage: state.stage
            });
        }

        // Handle phone number lookup for returning patients
        if (state.stage === 'awaiting_phone' && state.patientData.isReturning) {
            const phoneNumber = normalizePhoneNumber(userMessage);
            
            console.log(`🔍 Searching FHIR for patient with phone: ${phoneNumber}`);
            
            const searchResult = await fhirSearchService.findPatientByPhone(phoneNumber);

            if (searchResult.success) {
                const patientInfo = fhirSearchService.extractPatientInfo(searchResult.patient);
                
                state.stage = 'patient_found';
                state.patientData = {
                    ...state.patientData,
                    patientId: patientInfo.id,
                    fhirId: patientInfo.id,
                    firstName: patientInfo.firstName,
                    lastName: patientInfo.lastName,
                    phone: patientInfo.phone,
                    email: patientInfo.email,
                    age: patientInfo.age,
                    gender: patientInfo.gender,
                    isExisting: true,
                    existingInfo: {
                        name: patientInfo.name,
                        phone: patientInfo.phone,
                        email: patientInfo.email
                    }
                };
                
                conversationStates.set(sessionId, state);

                state.messages.push({ role: "user", content: userMessage });

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        ...state.messages,
                        { 
                            role: "system", 
                            content: `Patient found in FHIR! Name: ${patientInfo.name}. Greet them warmly by name and ask how you can help them today.` 
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 150
                });

                const aiMessage = completion.choices[0].message.content;
                state.messages.push({ role: "assistant", content: aiMessage });
                conversationStates.set(sessionId, state);

                console.log(`✅ Patient found: ${patientInfo.name}`);
                console.log(`🤖 Bot: ${aiMessage}`);

                return res.json({
                    success: true,
                    message: aiMessage,
                    stage: state.stage,
                    patientInfo: {
                        name: patientInfo.name,
                        phone: patientInfo.phone
                    }
                });

            } else {
                state.stage = 'new_patient_registration';
                state.patientData.notFoundInSystem = true;
                state.patientData.phone = phoneNumber;
                conversationStates.set(sessionId, state);

                state.messages.push({ role: "user", content: userMessage });

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        ...state.messages,
                        { 
                            role: "system", 
                            content: "Phone number not found in FHIR. Politely inform patient and offer to create a new record. Ask for first name." 
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 150
                });

                const aiMessage = completion.choices[0].message.content;
                state.messages.push({ role: "assistant", content: aiMessage });
                conversationStates.set(sessionId, state);

                console.log(`❌ Patient not found. Starting registration.`);
                console.log(`🤖 Bot: ${aiMessage}`);

                return res.json({
                    success: true,
                    message: aiMessage,
                    stage: state.stage
                });
            }
        }

        // Handle patient data collection for new patients
        if (state.stage === 'new_patient_registration' && state.patientData.notFoundInSystem) {
            const extractedInfo = await extractPatientInfo(userMessage, state);
            
            if (extractedInfo) {
                state.patientData = { ...state.patientData, ...extractedInfo };
                conversationStates.set(sessionId, state);
                
                console.log(`✅ Collected: ${JSON.stringify(extractedInfo)}`);
            }

            const infoCheck = checkIfHasRequiredPatientInfo(state.patientData);
            console.log(`📊 Registration ${infoCheck.percentComplete}% complete`);
            console.log(`   Have: ${infoCheck.present.join(', ')}`);
            console.log(`   Need: ${infoCheck.missing.join(', ')}`);

            if (infoCheck.canCreate && !state.patientCreationAttempted) {
                try {
                    const fhirPatient = convertToFHIRPatient(state.patientData);
                    
                    console.log('🔄 Creating patient in FHIR...');
                    const createResult = await fhirService.createPatient(fhirPatient);

                    if (createResult.success) {
                        state.patientData.patientId = createResult.fhirId;
                        state.patientData.fhirId = createResult.fhirId;
                        state.patientData.isExisting = true;
                        state.stage = 'patient_created';
                        state.patientCreationAttempted = true;
                        conversationStates.set(sessionId, state);

                        console.log(`✅ Patient created in FHIR with ID: ${createResult.fhirId}`);

                        state.messages.push({ role: "user", content: userMessage });

                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                ...state.messages,
                                { 
                                    role: "system", 
                                    content: "Patient record successfully created in FHIR. Thank them and ask how you can assist them further." 
                                }
                            ],
                            temperature: 0.7,
                            max_tokens: 150
                        });

                        const aiMessage = completion.choices[0].message.content;
                        state.messages.push({ role: "assistant", content: aiMessage });
                        conversationStates.set(sessionId, state);

                        console.log(`🤖 Bot: ${aiMessage}`);

                        return res.json({
                            success: true,
                            message: aiMessage,
                            stage: state.stage,
                            patientCreated: true,
                            patientId: createResult.fhirId
                        });
                    } else {
                        throw new Error(createResult.error || 'Failed to create patient in FHIR');
                    }
                } catch (error) {
                    console.error('❌ Error creating patient in FHIR:', error);
                    
                    state.messages.push({ role: "user", content: userMessage });

                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            ...state.messages,
                            { 
                                role: "system", 
                                content: "There was an error creating the patient record. Apologize and offer to have staff call them." 
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 150
                    });

                    const aiMessage = completion.choices[0].message.content;
                    state.messages.push({ role: "assistant", content: aiMessage });
                    conversationStates.set(sessionId, state);

                    return res.json({
                        success: true,
                        message: aiMessage,
                        stage: state.stage,
                        error: 'Failed to create patient record'
                    });
                }
            }

            state.messages.push({ role: "user", content: userMessage });

            const contextMessage = buildContextMessage(state);

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    ...state.messages,
                    { role: "system", content: contextMessage }
                ],
                temperature: 0.7,
                max_tokens: 150
            });

            const aiMessage = completion.choices[0].message.content;
            state.messages.push({ role: "assistant", content: aiMessage });
            conversationStates.set(sessionId, state);

            console.log(`🤖 Bot: ${aiMessage}`);

            return res.json({
                success: true,
                message: aiMessage,
                stage: state.stage,
                registrationProgress: infoCheck.percentComplete
            });
        }

        // Handle appointment queries for existing patients
        if ((state.stage === 'patient_found' || state.stage === 'patient_created') && state.patientData.patientId) {
            const lowerMessage = userMessage.toLowerCase();
            
            if ((lowerMessage.includes('appointment') && (lowerMessage.includes('my') || lowerMessage.includes('check'))) ||
                lowerMessage.includes('when is my') || 
                lowerMessage.includes('do i have') ||
                lowerMessage.includes('show me my')) {
                
                if (!state.appointmentInfoShared) {
                    console.log(`🔍 Fetching appointments from FHIR for patient: ${state.patientData.patientId}`);
                    
                    const appointmentsResult = await fhirSearchService.findPatientAppointments(state.patientData.patientId);

                    let appointmentInfo = '';
                    if (appointmentsResult.success && appointmentsResult.total > 0) {
                        const upcomingAppointments = appointmentsResult.appointments
                            .filter(apt => {
                                const aptDate = new Date(apt.start);
                                return aptDate > new Date() && apt.status !== 'cancelled';
                            })
                            .sort((a, b) => new Date(a.start) - new Date(b.start));

                        if (upcomingAppointments.length > 0) {
                            appointmentInfo = `Patient has ${upcomingAppointments.length} upcoming appointment(s):\n`;
                            
                            upcomingAppointments.forEach((apt, index) => {
                                const aptDate = new Date(apt.start);
                                const formattedDate = aptDate.toLocaleDateString('en-US', { 
                                    weekday: 'long', 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                });
                                const formattedTime = aptDate.toLocaleTimeString('en-US', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                });
                                
                                appointmentInfo += `${index + 1}. ${formattedDate} at ${formattedTime}\n`;
                                appointmentInfo += `   Status: ${apt.status}\n`;
                                if (apt.description) {
                                    appointmentInfo += `   Reason: ${apt.description}\n`;
                                }
                            });
                        } else {
                            appointmentInfo = 'No upcoming appointments found.';
                        }
                    } else {
                        appointmentInfo = 'No appointments found in FHIR system.';
                    }

                    state.appointmentInfoShared = true;
                    conversationStates.set(sessionId, state);

                    state.messages.push({ role: "user", content: userMessage });

                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            ...state.messages,
                            { 
                                role: "system", 
                                content: `Appointment information from FHIR:\n${appointmentInfo}\n\nShare this with the patient in a friendly way. If no appointments, offer to book one.` 
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 250
                    });

                    const aiMessage = completion.choices[0].message.content;
                    state.messages.push({ role: "assistant", content: aiMessage });
                    conversationStates.set(sessionId, state);

                    console.log(`🤖 Bot: ${aiMessage}`);

                    return res.json({
                        success: true,
                        message: aiMessage,
                        stage: state.stage,
                        appointments: appointmentsResult.success ? appointmentsResult.appointments : []
                    });
                }
            }

            // Handle appointment booking intent
            if ((lowerMessage.includes('book') || lowerMessage.includes('schedule') || 
                 lowerMessage.includes('make an appointment')) && !state.callAttempted) {
                
                state.stage = 'booking_appointment';
                conversationStates.set(sessionId, state);

                state.messages.push({ role: "user", content: userMessage });

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        ...state.messages,
                        { 
                            role: "system", 
                            content: "User wants to book appointment. Ask who the appointment is for: themselves, family member, or someone in their care." 
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 150
                });

                const aiMessage = completion.choices[0].message.content;
                state.messages.push({ role: "assistant", content: aiMessage });
                conversationStates.set(sessionId, state);

                console.log(`🤖 Bot: ${aiMessage}`);

                return res.json({
                    success: true,
                    message: aiMessage,
                    stage: state.stage
                });
            }

            // Handle appointment booking details collection
            if (state.stage === 'booking_appointment') {
                if (!state.appointmentData.bookingFor) {
                    if (lowerMessage.includes('myself') || lowerMessage.includes('me') || lowerMessage === 'self') {
                        state.appointmentData.bookingFor = 'self';
                        state.appointmentData.callbackNumber = state.patientData.phone;
                    } else if (lowerMessage.includes('family') || lowerMessage.includes('parent') || 
                               lowerMessage.includes('child') || lowerMessage.includes('spouse')) {
                        state.appointmentData.bookingFor = 'other';
                        state.appointmentData.relationship = userMessage;
                    }
                    conversationStates.set(sessionId, state);
                }

                if (state.appointmentData.bookingFor === 'self' && !state.callAttempted) {
                    const hospitalId = process.env.DEFAULT_HOSPITAL_ID || null;
                    
                    try {
                        const callResult = await initiateCall(
                            state.patientData.phone, 
                            state.patientData, 
                            state.appointmentData, 
                            hospitalId,
                            sessionId
                        );

                        if (callResult.success) {
                            state.callAttempted = true;
                            state.callSid = callResult.callSid;
                            conversationStates.set(sessionId, state);

                            state.messages.push({ role: "user", content: userMessage });

                            const completion = await openai.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: [
                                    ...state.messages,
                                    { 
                                        role: "system", 
                                        content: "Call initiated successfully. Inform the patient that you're calling them now to complete the booking." 
                                    }
                                ],
                                temperature: 0.7,
                                max_tokens: 100
                            });

                            const aiMessage = completion.choices[0].message.content;
                            state.messages.push({ role: "assistant", content: aiMessage });
                            conversationStates.set(sessionId, state);

                            console.log(`📞 Call initiated: ${callResult.callSid}`);
                            console.log(`🤖 Bot: ${aiMessage}`);

                            return res.json({
                                success: true,
                                message: aiMessage,
                                stage: state.stage,
                                callInitiated: true,
                                callSid: callResult.callSid
                            });
                        }
                    } catch (error) {
                        console.error('❌ Error initiating call:', error);
                    }
                }

                if (state.appointmentData.bookingFor === 'other') {
                    state.messages.push({ role: "user", content: userMessage });

                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            ...state.messages,
                            { 
                                role: "system", 
                                content: `Booking for ${state.appointmentData.relationship}. Ask for name and age, then initiate call.` 
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 150
                    });

                    const aiMessage = completion.choices[0].message.content;
                    state.messages.push({ role: "assistant", content: aiMessage });
                    conversationStates.set(sessionId, state);

                    console.log(`🤖 Bot: ${aiMessage}`);

                    return res.json({
                        success: true,
                        message: aiMessage,
                        stage: state.stage
                    });
                }
            }

            // Handle update patient information
            if (lowerMessage.includes('update') || lowerMessage.includes('change') || lowerMessage.includes('modify')) {
                state.updateMode = true;
                conversationStates.set(sessionId, state);

                state.messages.push({ role: "user", content: userMessage });

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        ...state.messages,
                        { 
                            role: "system", 
                            content: "User wants to update their information. Ask which information they want to change (email, phone, address, etc.)." 
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 150
                });

                const aiMessage = completion.choices[0].message.content;
                state.messages.push({ role: "assistant", content: aiMessage });
                conversationStates.set(sessionId, state);

                console.log(`🤖 Bot: ${aiMessage}`);

                return res.json({
                    success: true,
                    message: aiMessage,
                    stage: state.stage
                });
            }

            if (state.updateMode && state.patientData.fhirId) {
                let fieldToUpdate = null;
                let newValue = null;

                if (lowerMessage.includes('email')) {
                    fieldToUpdate = 'email';
                    const emailMatch = userMessage.match(/[\w.-]+@[\w.-]+\.\w+/);
                    if (emailMatch) {
                        newValue = emailMatch[0];
                    }
                } else if (lowerMessage.includes('phone')) {
                    fieldToUpdate = 'phone';
                    newValue = normalizePhoneNumber(userMessage);
                }

                if (fieldToUpdate && newValue) {
                    try {
                        // Get current patient data from FHIR
                        const patientResult = await fhirService.getPatient(state.patientData.fhirId);
                        
                        if (patientResult.success) {
                            const fhirPatient = patientResult.data;

                            // Update the appropriate field
                            if (fieldToUpdate === 'email') {
                                const emailIndex = fhirPatient.telecom.findIndex(t => t.system === 'email');
                                if (emailIndex >= 0) {
                                    fhirPatient.telecom[emailIndex].value = newValue;
                                } else {
                                    fhirPatient.telecom.push({
                                        system: 'email',
                                        value: newValue
                                    });
                                }
                                state.patientData.email = newValue;
                            } else if (fieldToUpdate === 'phone') {
                                const phoneIndex = fhirPatient.telecom.findIndex(t => t.system === 'phone');
                                if (phoneIndex >= 0) {
                                    fhirPatient.telecom[phoneIndex].value = newValue;
                                } else {
                                    fhirPatient.telecom.push({
                                        system: 'phone',
                                        value: newValue,
                                        use: 'mobile'
                                    });
                                }
                                state.patientData.phone = newValue;
                            }

                            // Update in FHIR
                            const updateResult = await fhirService.updatePatient(state.patientData.fhirId, fhirPatient);

                            if (updateResult.success) {
                                state.updateMode = false;
                                conversationStates.set(sessionId, state);

                                console.log(`✅ Updated ${fieldToUpdate} in FHIR to: ${newValue}`);

                                state.messages.push({ role: "user", content: userMessage });

                                const completion = await openai.chat.completions.create({
                                    model: "gpt-4o-mini",
                                    messages: [
                                        ...state.messages,
                                        { 
                                            role: "system", 
                                            content: `Successfully updated ${fieldToUpdate} to ${newValue} in FHIR. Confirm the update to the patient.` 
                                        }
                                    ],
                                    temperature: 0.7,
                                    max_tokens: 150
                                });

                                const aiMessage = completion.choices[0].message.content;
                                state.messages.push({ role: "assistant", content: aiMessage });
                                conversationStates.set(sessionId, state);

                                console.log(`🤖 Bot: ${aiMessage}`);

                                return res.json({
                                    success: true,
                                    message: aiMessage,
                                    stage: state.stage,
                                    updated: true,
                                    field: fieldToUpdate
                                });
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error updating patient in FHIR:', error);
                    }
                }
            }
        }

        // Default: General conversation
        state.messages.push({ role: "user", content: userMessage });

        const contextMessage = buildContextMessage(state);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                ...state.messages,
                { role: "system", content: contextMessage }
            ],
            temperature: 0.7,
            max_tokens: 200
        });

        const aiMessage = completion.choices[0].message.content;
        state.messages.push({ role: "assistant", content: aiMessage });
        conversationStates.set(sessionId, state);

        console.log(`🤖 Bot: ${aiMessage}`);

        res.json({
            success: true,
            message: aiMessage,
            stage: state.stage
        });

    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process message',
            details: error.message
        });
    }
};

async function initiateCall(phoneNumber, patientData, appointmentData, hospitalId, sessionId) {
    console.log(`📞 Initiating call to: ${phoneNumber}`);
    
    const metadata = {
        sessionId,
        source: 'chatbot',
        bookingFor: appointmentData.bookingFor || 'self',
        relationship: appointmentData.relationship,
        patientName: appointmentData.patientName
    };
    
    const result = await callService.makeOutboundCall({
        phoneNumber,
        patientId: patientData.patientId || null,
        hospitalId,
        reason: appointmentData.bookingFor === 'self' 
            ? 'Appointment booking' 
            : `Appointment booking for ${appointmentData.relationship}`,
        callType: 'general',
        metadata
    });

    if (result.success) {
        return { success: true, callSid: result.call?.sid };
    }
    throw new Error(result.error || 'Failed to initiate call');
}

async function extractPatientInfo(message, state) {
    try {
        const missingFields = checkIfHasRequiredPatientInfo(state.patientData).missing;
        const lastBotMessage = state.messages[state.messages.length - 1]?.content || '';
        
        let expectedField = null;
        if (lastBotMessage.toLowerCase().includes('first name')) {
            expectedField = 'firstName';
        } else if (lastBotMessage.toLowerCase().includes('last name')) {
            expectedField = 'lastName';
        } else if (lastBotMessage.toLowerCase().includes('email')) {
            expectedField = 'email';
        } else if (lastBotMessage.toLowerCase().includes('phone')) {
            expectedField = 'phone';
        } else if (lastBotMessage.toLowerCase().includes('age')) {
            expectedField = 'age';
        } else if (lastBotMessage.toLowerCase().includes('gender')) {
            expectedField = 'gender';
        } else if (lastBotMessage.toLowerCase().includes('date of birth') || lastBotMessage.toLowerCase().includes('dob')) {
            expectedField = 'dob';
        }
        
        console.log(`🔍 Extracting patient info. Expected field: ${expectedField}, Missing: ${missingFields.join(', ')}`);
        
        if (expectedField && missingFields.includes(expectedField)) {
            const extracted = {};
            extracted[expectedField] = message.trim();
            
            console.log(`✅ Direct extraction: ${expectedField} = "${message.trim()}"`);
            return extracted;
        }
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Extract information and return only valid JSON. Map the user's response to the correct field based on context." },
                { 
                    role: "user", 
                    content: `Context: We just asked "${lastBotMessage}". Missing fields: ${missingFields.join(', ')}. User responded: "${message}". Extract patient info. Return JSON with appropriate field: firstName, lastName, phone, email, age, dob, or gender.` 
                }
            ],
            temperature: 0.3,
            max_tokens: 200
        });

        const response = completion.choices[0].message.content;
        const jsonMatch = response.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const extracted = JSON.parse(jsonMatch[0]);
            const newData = {};
            
            for (const [key, value] of Object.entries(extracted)) {
                if (value && value !== "" && !state.patientData[key]) {
                    newData[key] = value;
                }
            }
            
            console.log(`✅ AI extraction:`, newData);
            return Object.keys(newData).length > 0 ? newData : null;
        }
        return null;
    } catch (error) {
        console.error('Error extracting info:', error);
        return null;
    }
}

function buildContextMessage(state) {
    let context = `Stage: ${state.stage}\n`;

    if (state.stage === 'awaiting_phone_new_patient') {
        context += `\nUser is NEW patient. Collecting details one by one.\n`;
    }

    if (state.patientData.notFoundInSystem && state.stage === 'new_patient_registration') {
        const infoCheck = checkIfHasRequiredPatientInfo(state.patientData);
        context += `\nNEW PATIENT REGISTRATION (${infoCheck.percentComplete}% complete)\n`;
        context += `Have: ${infoCheck.present.join(', ')}\n`;
        context += `Need: ${infoCheck.missing.join(', ')}\n`;
        context += `Ask for NEXT missing field.\n`;
    }

    if (state.patientData.isExisting && state.patientData.existingInfo) {
        context += `\nEXISTING PATIENT: ${state.patientData.existingInfo.name}\n`;
    }

    if (state.appointmentData?.bookingFor) {
        context += `\nAPPOINTMENT BOOKING FOR: ${state.appointmentData.bookingFor}\n`;
        if (state.appointmentData.relationship) {
            context += `Relationship: ${state.appointmentData.relationship}\n`;
        }
    }

    return context;
}

async function gatherContextualInformation(req) {
    const now = new Date();
    const hour = now.getHours();
    let timeOfDay = 'day';
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    return { timeOfDay, timestamp: now };
}

function logChatInitialization(sessionId, context) {
    console.log(`✅ Chat initialized: ${sessionId} at ${context.timeOfDay}`);
}

export const getChatAnalytics = async (req, res) => {
    const totalChats = conversationStates.size;
    res.json({ success: true, analytics: { totalSessions: totalChats } });
};

export const getConversationHistory = async (req, res) => {
    const { sessionId } = req.params;
    const state = conversationStates.get(sessionId);
    if (!state) return res.status(404).json({ success: false });
    res.json({ 
        success: true, 
        messages: state.messages, 
        patientData: state.patientData,
        appointmentData: state.appointmentData
    });
};

/**
 * Update conversation call status (called by callController webhook)
 */
export const updateConversationCallStatus = async (sessionId, statusData) => {
    try {
        const { callSid, callStatus, callDuration, timestamp } = statusData;
        
        const state = conversationStates.get(sessionId);
        
        if (!state) {
            console.warn(`No conversation state found for session: ${sessionId}`);
            return { success: false, error: 'Session not found' };
        }

        state.callStatus = callStatus;
        state.callDuration = callDuration;
        state.lastCallStatusUpdate = timestamp;

        if (callStatus === 'completed') {
            state.callCompleted = true;
            console.log(`Call completed for chatbot session ${sessionId} - Duration: ${callDuration}s`);
        } else if (callStatus === 'no-answer' || callStatus === 'no_answer') {
            state.callStatus = 'no-answer';
            console.log(`Call not answered for session ${sessionId}`);
        } else if (callStatus === 'busy') {
            state.callStatus = 'busy';
            console.log(`Line busy for session ${sessionId}`);
        } else if (callStatus === 'failed') {
            state.callStatus = 'failed';
            console.log(`Call failed for session ${sessionId}`);
        }

        conversationStates.set(sessionId, state);

        return { success: true };

    } catch (error) {
        console.error('Error updating conversation call status:', error);
        return { success: false, error: error.message };
    }
};

export default { 
    initializeChat, 
    sendMessage, 
    getConversationHistory, 
    getChatAnalytics, 
    updateConversationCallStatus 
};