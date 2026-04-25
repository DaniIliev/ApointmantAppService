import bcrypt from "bcryptjs";
import User from "../models/User.js";

// POST /api/auth/change-password
export const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { newPassword } = req.body;
    console.log("Change password", newPassword);
    if (!newPassword || newPassword.length < 6) {
      return res.status(400)
        .json({ 
          errorCode: "PASSWORD_TOO_SHORT",
          message: "Password must be at least 6 characters." 
        });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();
    res.json({ 
      messageCode: "PASSWORD_CHANGED",
      message: "Password changed successfully." 
    });
  } catch (e) {
    next(e);
  }
};
