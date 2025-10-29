import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import planRoutes from "./routes/plans.js";
import callRoutes from "./routes/calls.js";
import chatbotRoutes from "./routes/chatbot.js";

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json()); // parse application/json
app.use(express.urlencoded({ extended: true }));

connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/chatbot", chatbotRoutes);

app.get("/", (req, res) => {
    res.send("API is running...");
});

// Health check endpoint - includes FHIR status
app.get("/health", async (req, res) => {
    try {
        const fhirConnected = await connectDB();
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            fhir: {
                connected: fhirConnected,
                baseUrl: process.env.FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4'
            }
        });
    } catch (error) {
        res.status(503).json({
            status: "error",
            timestamp: new Date().toISOString(),
            error: error.message,
            fhir: {
                connected: false,
                baseUrl: process.env.FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4'
            }
        });
    }
});

export default app;