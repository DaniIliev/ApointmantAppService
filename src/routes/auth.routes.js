import express from "express";
import {
  register,
  login,
  getUserById,
  updateUser,
  updateProfilePicture,
} from "../controllers/auth.controller.js";
import { changePassword } from "../controllers/changePassword.controller.js";
import { sendOtp, otpLogin } from "../controllers/otp.controller.js";
import authMiddleware from "../middlewares/auth.js";
import upload from "../storage.js";
const router = express.Router();

router.post("/change-password", authMiddleware, changePassword);
router.post("/forgot-password", sendOtp);
router.post("/otp-login", otpLogin);
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

router.put(`/user/:id`, updateUser);

router.put(
  `/user/:id/picture`,
  upload.single("profilePicture"),
  updateProfilePicture
);
export default router;
