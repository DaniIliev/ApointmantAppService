import express from "express";
import {
  getDashboardData,
  createAppointment,
  listBusinessAppointments,
  updateAppointmentStatus,
  getFreeSlots,
  getClosestAvailableSlot,
} from "../controllers/appointment.controller.js";
import authMiddleware from "../middlewares/auth.js";
const router = express.Router();

router.get("/dashboard", authMiddleware, getDashboardData);
router.post("/", authMiddleware, createAppointment);
router.get("/business/:businessId", authMiddleware, listBusinessAppointments);
router.put("/:id/status", authMiddleware, updateAppointmentStatus);
router.get("/availability", getFreeSlots);
router.get("/closest-slot", authMiddleware, getClosestAvailableSlot);

export default router;
