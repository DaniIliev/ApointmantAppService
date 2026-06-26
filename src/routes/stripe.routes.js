// src/routes/stripe.routes.js

import express from "express";
import { requireRole } from "../middlewares/auth.js";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  getCheckoutInvoiceLink,
  cancelSubscription,
  listInvoices,
} from "../controllers/stripe.controller.js";
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
  createCheckoutSession,
);

router.post(
  "/customer-portal",
  authMiddleware,
  requireRole("business"),
  createCustomerPortalSession,
);

router.get(
  "/checkout-invoice",
  authMiddleware,
  requireRole("business"),
  getCheckoutInvoiceLink,
);

router.post(
  "/cancel-subscription",
  authMiddleware,
  requireRole("business"),
  cancelSubscription,
);

router.get(
  "/invoices",
  authMiddleware,
  requireRole("business"),
  listInvoices,
);

export default router;

