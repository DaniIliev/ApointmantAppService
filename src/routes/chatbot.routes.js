// routes/chatbot.routes.js
import express from "express";
import chatbot from "../chatbot/chatbot.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { message, userId, businessId } = req.body;
    if (!message || !businessId) {
      return res.status(400).json({
        message:
          "Message and businessId are required. Expected JSON: { message, businessId, userId? }",
      });
    }

    // Sanitize input
    const trimmedMessage = String(message).trim();
    if (!trimmedMessage) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    if (!chatbot.initialized) {
      console.log("🤖 Chatbot not initialized, training now...");
      await chatbot.initialize();
    }

    const response = await chatbot.processMessage(
      trimmedMessage,
      userId,
      businessId
    );
    res.status(200).json({ response });
  } catch (error) {
    console.error("Chatbot route error:", error);
    res.status(500).json({ message: "Chatbot internal error" });
  }
});
router.get("/status", (req, res) => {
  res.status(200).json({
    initialized: chatbot.initialized,
    docs: chatbot.classifier ? chatbot.classifier.docs.length : 0,
  });
});

export default router;
