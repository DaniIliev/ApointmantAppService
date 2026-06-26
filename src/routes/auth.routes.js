import express from "express";
import {
  register,
  login,
  getUserById,
  updateUser,
  updateProfilePicture,
  updateRole,
  refreshToken,
  getMe,
} from "../controllers/auth.controller.js";
import { changePassword } from "../controllers/changePassword.controller.js";
import { sendOtp, otpLogin } from "../controllers/otp.controller.js";
import authMiddleware from "../middlewares/auth.js";
import upload from "../storage.js";
import passport from "passport";
import jwt from "jsonwebtoken";

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, businessId: user.businessId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

const handleCallback = (req, res) => {
  const token = generateToken(req.user);
  const userData = encodeURIComponent(
    JSON.stringify({
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      businessId: req.user.businessId,
    }),
  );

  // Redirect back to frontend with token and user data
  res.redirect(
    `${process.env.CLIENT_URL}/auth-callback?token=${token}&user=${userData}`,
  );
};

router.post("/change-password", authMiddleware, changePassword);
router.post("/forgot-password", sendOtp);
router.post("/otp-login", otpLogin);
router.get("/me", authMiddleware, getMe);
router.put("/update-role", authMiddleware, updateRole);
router.get("/refresh-token", authMiddleware, refreshToken);

// Social Auth Routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  handleCallback,
);

router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["public_profile"] }),
);
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { session: false }),
  handleCallback,
);

router.get("/apple", passport.authenticate("apple"));
router.post(
  "/apple/callback",
  passport.authenticate("apple", { session: false }),
  handleCallback,
);
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
  updateProfilePicture,
);

export default router;
