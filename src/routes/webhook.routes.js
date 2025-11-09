// src/routes/webhook.routes.js

import express from "express";
import { handleStripeWebhook } from "../controllers/weebhook.controller.js";

const router = express.Router();

/**
 * POST /api/v1/webhook
 * Stripe Webhook Listener.
 * ⚠️ Този руут трябва да използва express.raw({ type: 'application/json' })
 * в app.js, а не express.json().
 */
router.post("/", handleStripeWebhook);

export default router;
