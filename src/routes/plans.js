import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
    res.json([
        { name: "Free", features: ["1 inbound/outbound call"], price: 0 },
        { name: "Premium", features: ["Unlimited concurrent calls"], price: 99 }
    ]);
});

export default router;
