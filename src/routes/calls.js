import express from "express";
import { inboundCall, outboundCall, callLogs, endCall, outboundTwiml, handleCallStatus, transferCall } from "../controllers/callController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/inbound", inboundCall);
router.post("/outbound", authMiddleware, outboundCall);
router.post("/outbound-twiml", outboundTwiml);
router.post("/end", endCall);
router.post("/status", handleCallStatus);
router.post("/transfer", authMiddleware, transferCall);
router.get("/logs", authMiddleware, callLogs);

export default router;