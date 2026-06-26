import express from "express";
import {
  adminGrantPlan,
  adminGetDashboardStats,
  adminGetLogs,
  adminGetBusinesses,
} from "../controllers/admin.controller.js";
import authMiddleware, { requireRole } from "../middlewares/auth.js";

const router = express.Router();

// Secure all routes with both JWT authentication and admin role enforcement
router.post("/grant-plan", authMiddleware, requireRole("admin"), adminGrantPlan);
router.get("/dashboard-stats", authMiddleware, requireRole("admin"), adminGetDashboardStats);
router.get("/logs", authMiddleware, requireRole("admin"), adminGetLogs);
router.get("/businesses", authMiddleware, requireRole("admin"), adminGetBusinesses);

export default router;
