import express from "express";
import {
  register,
  login,
  getUserById,
} from "../controllers/auth.controller.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Аутентикация
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Регистрация на нов потребител
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, role]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [business, client] }
 *     responses:
 *       201: { description: Успех }
 */
router.post("/register", register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Логин
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Връща JWT }
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/user/:id:
 *   post:
 *     summary: Get user by id
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Връща JWT }
 */
router.get("/user/:id", getUserById);

export default router;
