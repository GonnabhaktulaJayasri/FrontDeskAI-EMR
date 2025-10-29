import http from "http";
import app from "./app.js";
import setupStream from "./scripts/stream.js";
import 'dotenv/config';
import messageAutomationService from "./services/messageAutomationService.js";

const server = http.createServer(app);

// Attach WebSocket for Twilio <-> OpenAI bridge
setupStream(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);
    // messageAutomationService.start();
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    // messageAutomationService.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    // messageAutomationService.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});