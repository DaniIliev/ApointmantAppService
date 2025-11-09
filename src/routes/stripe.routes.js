// src/routes/stripe.routes.js

import express from "express";
import { requireRole } from "../middlewares/auth.js";
import { createCheckoutSession } from "../controllers/stripe.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

/**
 * POST /api/stripe/checkout-session
 * Инициира процеса на плащане за абонамент.
 * Изисква: Автентикация и роля 'business'.
 * Вход: { planName: string, billingCycle: 'monthly' | 'yearly' }
 */
router.post(
  "/checkout-session",
  authMiddleware,
  requireRole("business"),
  createCheckoutSession
);

// Тук можете да добавите руут и за анулиране на абонамент
// router.post("/cancel-subscription", authRequired, requireRole("business"), cancelSubscription);

export default router;
