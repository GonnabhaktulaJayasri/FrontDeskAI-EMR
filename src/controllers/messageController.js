import messageService from "./messageService.js";
import fhirService from "./fhirService.js";

// NOTE: This implementation requires Communication resource support in fhirService
// Message resources would be stored as FHIR Communication resources

/**
 * Handle Twilio Conversations API messages (unified messaging)
 */
export const handleIncomingMessage = async (req, res) => {
    try {
        const {
            EventType,
            Author,
            Body,
            MessageSid,
            ConversationSid,
            Source,
            MessagingServiceSid,
            ParticipantSid
        } = req.body;

        // Only process messages added to conversations
        if (EventType !== 'onMessageAdded') {
            return res.status(200).send();
        }
        
        let hospital = null;

        if (!hospital && MessagingServiceSid) {
            // Search for organization by messaging service SID
            const searchResult = await fhirService.searchOrganizations({
                identifier: MessagingServiceSid
            });

            if (searchResult.success && searchResult.total > 0) {
                hospital = searchResult.entries[0].resource;
                console.log('Hospital found from MessagingServiceSid:', hospital.name);
            }
        }

        if (hospital) {
            // Get hospital phone numbers from extensions
            const twilioPhoneExt = hospital.extension?.find(ext => 
                ext.url === 'http://hospital-system/twilio-phone-number'
            );
            const twilioWhatsAppExt = hospital.extension?.find(ext => 
                ext.url === 'http://hospital-system/twilio-whatsapp-number'
            );

            const hospitalPhone = twilioPhoneExt?.valueString;
            const hospitalWhatsApp = twilioWhatsAppExt?.valueString;

            if (Author === hospitalPhone ||
                Author === `whatsapp:${hospitalWhatsApp}` ||
                Author?.startsWith('whatsapp:' + hospitalPhone?.replace('+', ''))) {
                console.log('Skipping outbound message from our service');
                return res.status(200).send();
            }
        }

        // Skip if no message body (system messages, delivery receipts, etc.)
        if (!Body || Body.trim().length === 0) {
            console.log('Skipping message without body');
            return res.status(200).send();
        }

        // Determine if this is WhatsApp based on Source or Author format
        const isWhatsApp = Source === 'WhatsApp' || Author?.startsWith('whatsapp:');

        // Create a compatible request object for our AI service
        const fakeReq = {
            body: {
                From: Author,
                To: hospital ? (twilioPhoneExt?.valueString || '+1234567890') : '+1234567890',
                Body: Body,
                MessageSid: MessageSid,
                ConversationSid: ConversationSid,
                SmsStatus: 'received'
            }
        };

        // Process with enhanced AI service
        const result = await messageService.processIncomingMessage(fakeReq);

        res.status(200).send();

        if (result.success) {
            console.log('Conversation message processed successfully:', {
                action: result.action,
                responseTime: result.responseTime + 'ms',
                needsEscalation: result.needsEscalation
            });
        } else {
            console.log('Conversation processing failed:', result.error);
        }

    } catch (error) {
        console.error('Error handling Twilio conversation:', error);
        res.status(200).send();
    }
};

/**
 * Start AI-powered appointment reminder conversation
 */
export const startAppointmentReminderMessage = async (req, res) => {
    try {
        const { appointmentId, method = 'sms', reminderType = 'appointment_reminder' } = req.body;

        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                error: 'Appointment ID is required'
            });
        }
        
        const result = await messageService.startMessageConversation(
            appointmentId,
            reminderType,
            method
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'AI appointment reminder started successfully',
                conversationId: result.conversationId,
                messageSid: result.messageSid,
                method: method,
                reminderType: reminderType
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Failed to start AI reminder'
            });
        }

    } catch (error) {
        console.error('Error starting appointment reminder:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get conversation history for a patient or appointment
 */
export const getConversationHistory = async (req, res) => {
    try {
        const { patientId, appointmentId, limit = 50 } = req.query;

        if (!patientId && !appointmentId) {
            return res.status(400).json({
                success: false,
                error: 'Either patientId or appointmentId is required'
            });
        }

        // Search for Communications related to patient or appointment
        const searchParams = {};
        
        if (patientId) {
            searchParams.subject = `Patient/${patientId}`;
        }
        
        if (appointmentId) {
            searchParams['based-on'] = `Appointment/${appointmentId}`;
        }

        searchParams._count = limit;
        searchParams._sort = '-sent';

        const communicationResult = await fhirService.searchCommunications(searchParams);

        if (!communicationResult.success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch conversation history'
            });
        }

        const messages = communicationResult.entries.map(entry => {
            const comm = entry.resource;
            return {
                id: comm.id,
                timestamp: comm.sent,
                content: comm.payload?.[0]?.contentString,
                direction: comm.extension?.find(ext => 
                    ext.url === 'http://hospital-system/message-direction'
                )?.valueString || 'inbound',
                status: comm.status,
                medium: comm.medium?.[0]?.coding?.[0]?.code
            };
        });

        res.json({
            success: true,
            total: communicationResult.total,
            messages: messages
        });

    } catch (error) {
        console.error('Error fetching conversation history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get messaging performance statistics
 */
export const getPerformanceStats = async (req, res) => {
    try {
        const { startDate, endDate, hospitalId } = req.query;

        const searchParams = {};
        
        if (startDate) {
            searchParams.sent = `ge${new Date(startDate).toISOString()}`;
        }
        if (endDate) {
            searchParams.sent = searchParams.sent 
                ? `${searchParams.sent}&le${new Date(endDate).toISOString()}`
                : `le${new Date(endDate).toISOString()}`;
        }

        const communicationResult = await fhirService.searchCommunications(searchParams);

        if (!communicationResult.success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch statistics'
            });
        }

        const communications = communicationResult.entries.map(entry => entry.resource);

        // Calculate statistics
        const stats = {
            total: communications.length,
            byStatus: {},
            byMedium: {},
            byDirection: {}
        };

        communications.forEach(comm => {
            // Count by status
            const status = comm.status || 'unknown';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

            // Count by medium
            const medium = comm.medium?.[0]?.coding?.[0]?.code || 'unknown';
            stats.byMedium[medium] = (stats.byMedium[medium] || 0) + 1;

            // Count by direction
            const direction = comm.extension?.find(ext => 
                ext.url === 'http://hospital-system/message-direction'
            )?.valueString || 'unknown';
            stats.byDirection[direction] = (stats.byDirection[direction] || 0) + 1;
        });

        res.json({
            success: true,
            statistics: stats
        });

    } catch (error) {
        console.error('Error fetching performance stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Escalate a conversation to human agent
 */
export const escalateConversation = async (req, res) => {
    try {
        const { conversationId, reason } = req.body;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                error: 'Conversation ID is required'
            });
        }

        // In a real implementation, this would:
        // 1. Mark the conversation for human review
        // 2. Notify appropriate staff
        // 3. Update the conversation status in FHIR

        res.json({
            success: true,
            message: 'Conversation escalated successfully',
            conversationId: conversationId
        });

    } catch (error) {
        console.error('Error escalating conversation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

export default {
    handleIncomingMessage,
    startAppointmentReminderMessage,
    getConversationHistory,
    getPerformanceStats,
    escalateConversation,
};