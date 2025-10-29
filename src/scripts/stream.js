import { WebSocketServer } from "ws";
import { callAssistant } from "../services/callAssistant.js";

export default function setupStream(server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
        if (req.url.startsWith("/api/calls/stream")) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                console.log('WebSocket connection established from Twilio');
                // The assistant will handle all events including 'start', 'media', etc.
                callAssistant(ws, req);
            });
        }
    });
}

