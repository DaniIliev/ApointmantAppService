import express from "express";
import { handleConnectWebhook } from "../controllers/stripeConnect.controller.js";

const router = express.Router();

// Stripe Connect webhook - получава raw body за signature verification
router.post("/", handleConnectWebhook);

export default router;
