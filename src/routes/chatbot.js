
import express from 'express';
import {
    initializeChat,
    sendMessage,
    getConversationHistory,
    updateConversationCallStatus
} from '../controllers/chatbotController.js';

const router = express.Router();

// Initialize new chat session
router.post('/initialize', initializeChat);

// Send message and get AI response
router.post('/message', sendMessage);

// Get conversation history
router.get('/conversation/:sessionId', getConversationHistory);

router.post('/call-status-webhook', updateConversationCallStatus);

export default router;