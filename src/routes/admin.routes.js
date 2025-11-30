import express from "express";
import { adminGrantPlan } from "../controllers/admin.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

// Only allow admins to grant plans
router.post("/grant-plan", authMiddleware, adminGrantPlan);

export default router;
