// routes/chatbot.routes.js
import express from "express";
import chatbot from "../chatbot/chatbot.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { message, userId, businessId } = req.body;
    if (!message || !userId || !businessId) {
      return res
        .status(400)
        .json({ message: "Message, userId, and businessId are required." });
    }

    // Единствена проверка
    if (!chatbot.initialized) {
      console.log("🤖 Chatbot not initialized, training now...");
      await chatbot.initialize();
    }

    const response = await chatbot.processMessage(message, userId, businessId);
    res.status(200).json({ response });
  } catch (error) {
    next(error);
  }
});
router.get("/status", (req, res) => {
  res.status(200).json({
    initialized: chatbot.initialized,
    docs: chatbot.classifier ? chatbot.classifier.docs.length : 0,
  });
});

export default router;
