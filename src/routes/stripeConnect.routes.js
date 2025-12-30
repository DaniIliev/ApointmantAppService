import express from "express";
import {
  createConnectAccountLink,
  getConnectAccountStatus,
  createCheckoutSession,
  createDashboardLink,
} from "../controllers/stripeConnect.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

// Създава или връща onboarding link за Stripe Connect
router.post("/connect/link", authMiddleware, createConnectAccountLink);

// Проверява статуса на Connect акаунта
router.get("/connect/status", authMiddleware, getConnectAccountStatus);

// Създава dashboard link за достъп до Stripe Dashboard
router.post("/connect/dashboard", authMiddleware, createDashboardLink);

// Създава checkout session за плащане
router.post("/checkout/session", createCheckoutSession);

// ЗАБЕЛЕЖКА: Webhook е в отделен файл (stripeConnectWebhook.routes.js)
// защото трябва raw body middleware преди express.json()

export default router;
