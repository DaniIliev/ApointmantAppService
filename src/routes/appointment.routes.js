import express from "express";
import {
  getDashboardData,
  createAppointment,
  listBusinessAppointments,
  updateAppointmentStatus,
  getFreeSlots,
} from "../controllers/appointment.controller.js";
import authMiddleware from "../middlewares/auth.js";
const router = express.Router();

router.get("/dashboard", authMiddleware, getDashboardData);
router.post("/", authMiddleware, createAppointment);
router.get("/business/:businessId", authMiddleware, listBusinessAppointments);
router.put("/:id/status", authMiddleware, updateAppointmentStatus);

// Нов маршрут за проверка на свободни часове
router.get("/availability", getFreeSlots);

export default router;
