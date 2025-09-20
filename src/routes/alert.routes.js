import express from "express";
import {
  getAlerts,
  markAlertAsRead,
  deleteAlert,
} from "../controllers/alert.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

router.get("/", authMiddleware, getAlerts);

router.put("/:id/read", authMiddleware, markAlertAsRead);

router.delete("/:id", authMiddleware, deleteAlert);

export default router;
