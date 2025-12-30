import express from "express";
import {
  getDashboardData,
  createAppointment,
  listBusinessAppointments,
  updateAppointmentStatus,
  updateAppointment,
  getFreeSlots,
  getClosestAvailableSlot,
  getAppointmentById,
  deleteAppointment,
} from "../controllers/appointment.controller.js";
import authMiddleware from "../middlewares/auth.js";
const router = express.Router();

router.get("/dashboard", authMiddleware, getDashboardData);
router.post("/", createAppointment);
router.get("/business/:businessId", authMiddleware, listBusinessAppointments);
router.get("/availability", getFreeSlots);
router.get("/closest-slot", getClosestAvailableSlot);
router.get("/:id", getAppointmentById);
router.put("/:id/status", authMiddleware, updateAppointmentStatus);
router.put("/:id", authMiddleware, updateAppointment);
router.delete("/:id", authMiddleware, deleteAppointment);

export default router;
