// routes/chatbot.routes.js
import express from "express";
import chatbot from "../chatbot/chatbot.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { message, userId, businessId, locationId } = req.body;
    if (!message || !businessId) {
      return res.status(400).json({
        message:
          "Message and businessId are required. Expected JSON: { message, businessId, userId?, locationId? }",
      });
    }

    // Sanitize input
    const trimmedMessage = String(message).trim();
    if (!trimmedMessage) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const response = await chatbot.processMessage(
      trimmedMessage,
      userId || "guest",
      businessId,
      locationId || null
    );
    res.status(200).json({ response });
  } catch (error) {
    console.error("Chatbot route error:", error);
    res.status(500).json({ message: "Chatbot internal error" });
  }
});

router.get("/status", (req, res) => {
  res.status(200).json({
    initialized: true,
    engine: "gemini-2.5-flash",
  });
});

export default router;
