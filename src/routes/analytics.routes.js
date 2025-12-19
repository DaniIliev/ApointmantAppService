import express from "express";
import authMiddleware from "../middlewares/auth.js";
import { getAnalytics } from "../controllers/analytics.controller.js";

const router = express.Router();

router.get("/", authMiddleware, getAnalytics);

export default router;
