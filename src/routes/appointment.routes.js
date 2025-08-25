import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createAppointment,
  listBusinessAppointments,
  updateAppointmentStatus,
} from "../controllers/appointment.controller.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Appointment
 *   description: Резервации
 */

/**
 * @swagger
 * /appointment:
 *   post:
 *     summary: Създава нова резервация
 *     tags: [Appointment]
 *     security: []    # може и без токен (гост), ако искаш махни security реда
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [business, service, appointmentTime]
 *             properties:
 *               business: { type: string }
 *               service: { type: string }
 *               appointmentTime: { type: string, format: date-time }
 *               clientName: { type: string }
 *               clientPhone: { type: string }
 *     responses:
 *       201: { description: Създадено }
 */
router.post("/", createAppointment);

router.get(
  "/business/:businessId",
  authRequired,
  requireRole("business"),
  listBusinessAppointments
);

/**
 * @swagger
 * /appointment/{id}/status:
 *   put:
 *     summary: Промяна на статус на резервация (само собственик)
 *     tags: [Appointment]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, cancelled, completed]
 *     responses:
 *       200: { description: OK }
 */
router.put(
  "/:id/status",
  authRequired,
  requireRole("business"),
  updateAppointmentStatus
);

export default router;
