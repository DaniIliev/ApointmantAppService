import express from "express";
import { getPerformanceData } from "../controllers/performanceController.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

router.get("/", authMiddleware, getPerformanceData);

export default router;
