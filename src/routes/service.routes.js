import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createService,
  listServices,
} from "../controllers/service.controller.js";

const router = express.Router({ mergeParams: true });

/**
 * @swagger
 * tags:
 *   name: Service
 *   description: Услуги
 */

/**
 * @swagger
 * /service/{businessId}:
 *   get:
 *     summary: Списък услуги за бизнес
 *     tags: [Service]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get("/:businessId", listServices);

/**
 * @swagger
 * /service/{businessId}:
 *   post:
 *     summary: Добавя услуга към бизнес (само собственик)
 *     tags: [Service]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               durationMinutes: { type: number }
 *               price: { type: number }
 *     responses:
 *       201: { description: Създадено }
 */
router.post(
  "/:businessId",
  authRequired,
  requireRole("business"),
  createService
);

export default router;
