import User from "../models/User.js";
import { sendForgotPasswordOtpEmail } from "../utils/EmailService.js";
import jwt from "jsonwebtoken";
// POST /api/auth/forgot-password (OTP version)
export const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.otpCode = otp;
    user.otpExpiresAt = expires;
    await user.save();

    // Send OTP via email (reuse inviteStaffEmail for simplicity)
    await sendForgotPasswordOtpEmail(user.email, user.firstName || "User", otp);

    res.json({ message: "OTP sent to email" });
  } catch (e) {
    next(e);
  }
};

// POST /api/auth/otp-login
export const otpLogin = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP required" });
    const user = await User.findOne({ email });
    if (!user || !user.otpCode || !user.otpExpiresAt) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }
    if (user.otpCode !== otp || user.otpExpiresAt < new Date()) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }
    // Clear OTP and require password change
    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    user.mustChangePassword = true;
    await user.save();
    // Issue JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        businessId: user.businessId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (e) {
    next(e);
  }
};
