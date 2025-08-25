import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createBusiness,
  getBusinesses,
  getBusinessById,
} from "../controllers/business.controller.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Business
 *   description: Фирми
 */

/**
 * @swagger
 * /business:
 *   get:
 *     summary: Списък с всички фирми
 *     tags: [Business]
 *     responses:
 *       200: { description: OK }
 */
router.get("/", getBusinesses);

/**
 * @swagger
 * /business/{id}:
 *   get:
 *     summary: Взима бизнес по id
 *     tags: [Business]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: OK }
 */
router.get("/:id", getBusinessById);

/**
 * @swagger
 * /business:
 *   post:
 *     summary: Създава нов бизнес (само бизнес акаунт)
 *     tags: [Business]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *     responses:
 *       201: { description: Създаден }
 */
router.post("/", authRequired, requireRole("business"), createBusiness);

export default router;
