import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Business from "../models/Business.js";
import { generateQrDataUrl } from "../utils/qrcode.js";
import mongoose from "mongoose";
import { ensureAdminSupportChannel, ensureBusinessChannel } from "../utils/chatSetup.js";
import { getLanguageFromHeaders } from "../utils/LanguageHelper.js";

export const register = async (req, res, next) => {
  try {
    const { email, password, role, phone, firstName, lastName } = req.body;
    if (!email || !password)
      return res
        .json({ 
          errorCode: "MISSING_REQUIRED_FIELDS",
          message: "email, password, and role are required." 
        });
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ 
        errorCode: "EMAIL_ALREADY_EXISTS",
        message: "Email already exists." 
      });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      passwordHash,
      role,
      phone,
      firstName,
      lastName,
    });

    let business = null;

    if (role === "business") {
      const { businessName, phone: businessPhone } = req.body;
      const effectiveName = (businessName && businessName.trim()) || undefined; // undefined lets schema default apply

      business = await Business.create({
        owner: user.id,
        businessName: effectiveName, // may be undefined -> default "Pending Setup"
        phone: businessPhone,
      });

      const link = `${process.env.CLIENT_URL}/business/${business.id}`;
      const qrCodeUrl = await generateQrDataUrl(link);
      business.qrCodeUrl = qrCodeUrl;
      await business.save();

      user.businessId = business._id;
      await user.save();

      // Auto-create business channel
      try {
        const language = getLanguageFromHeaders(req.headers);
        await ensureBusinessChannel(business._id, user._id);
        await ensureAdminSupportChannel(user._id, language);
      } catch (chatErr) {
        console.error("Chat channel auto-creation error:", chatErr);
      }
    }
    const userResponse = {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      businessId: user.businessId,
    };

    if (business) {
      return res.status(201).json({
        message: "Registration successful.",
        messageCode: "REGISTRATION_SUCCESSFUL",
        data: {
          user: userResponse,
          business: business.toJSON(),
          requiresBusinessSetup: business.businessName === "Pending Setup",
        }
      });
    }

    res.status(201).json({
      message: "Registration successful.",
      messageCode: "REGISTRATION_SUCCESSFUL",
      data: { user: userResponse }
    });
  } catch (e) {
    next(e);
  }
};
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ 
      errorCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials." 
    });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ 
      errorCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials." 
    });

    const token = jwt.sign(
      { id: user._id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    let locations = [];
    if (user.role === "business" && user.businessId) {
      const Location = mongoose.model("Location");
      locations = await Location.find({ businessId: user.businessId }).lean();
    } else if (user.role === "staff" && user.locationIds) {
      const Location = mongoose.model("Location");
      locations = await Location.find({
        _id: { $in: user.locationIds },
      }).lean();
    }

    // Auto-create admin support channel on login (non-blocking)
    const language = getLanguageFromHeaders(req.headers);
    ensureAdminSupportChannel(user._id, language).catch((err) =>
      console.error("Auto admin_support channel error:", err)
    );

    res.json({
      message: "Login successful.",
      messageCode: "LOGIN_SUCCESSFUL",
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          businessId: user.businessId,
          mustChangePassword: user.mustChangePassword,
          locations,
        },
      }
    });
  } catch (e) {
    next(e);
  }
};

export const getUserById = async (req, res, next) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        errorCode: "INVALID_ID_FORMAT",
        message: "Invalid ID format." 
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }

    let locations = [];
    if (user.role === "business" && user.businessId) {
      const Location = mongoose.model("Location");
      locations = await Location.find({ businessId: user.businessId }).lean();
    } else if (user.role === "staff" && user.locationIds) {
      const Location = mongoose.model("Location");
      locations = await Location.find({
        _id: { $in: user.locationIds },
      }).lean();
    }

    res.status(200).json({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      businessId: user.businessId,
      primaryColor: user.primaryColor,
      theme: user.theme,
      mustChangePassword: user.mustChangePassword,
      profilePictureUrl: user.profilePictureUrl,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionBusinessId: user.subscriptionBusinessId,
      subscriptionActivatedAt: user.subscriptionActivatedAt,
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      locations,
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  const { id } = req.params;
  const { firstName, lastName, phone, primaryColor, theme, profilePictureUrl } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      errorCode: "INVALID_ID_FORMAT",
      message: "Invalid ID format." 
    });
  }

  try {
    const updateFields = {};
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;
    if (phone) updateFields.phone = phone;
    if (primaryColor) updateFields.primaryColor = primaryColor;
    if (theme) updateFields.theme = theme;
    if (profilePictureUrl !== undefined) updateFields.profilePictureUrl = profilePictureUrl;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true },
    );

    if (!updatedUser) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }

    res.status(200).json({
      message: "User updated successfully.",
      messageCode: "USER_UPDATED",
      data: {
        _id: updatedUser._id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        businessId: updatedUser.businessId,
        primaryColor: updatedUser.primaryColor,
        theme: updatedUser.theme,
        mustChangePassword: updatedUser.mustChangePassword,
        profilePictureUrl: updatedUser.profilePictureUrl,
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionStatus: updatedUser.subscriptionStatus,
        subscriptionBusinessId: updatedUser.subscriptionBusinessId,
        subscriptionActivatedAt: updatedUser.subscriptionActivatedAt,
        subscriptionCurrentPeriodEnd: updatedUser.subscriptionCurrentPeriodEnd,
      }
    });
  } catch (e) {
    next(e);
  }
};

export const updateRole = async (req, res, next) => {
  const { role } = req.body;
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }

    user.role = role;
    await user.save();

    res.json({ 
      messageCode: "ROLE_UPDATED",
      message: "Role updated successfully.", 
      data: user 
    });
  } catch (e) {
    next(e);
  }
};

export const updateProfilePicture = async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      errorCode: "INVALID_ID_FORMAT",
      message: "Invalid ID format." 
    });
  }

  if (!req.file || !req.file.path) {
    return res.status(400).json({ 
      errorCode: "NO_IMAGE_UPLOADED",
      message: "No image file uploaded." 
    });
  }

  try {
    const imageUrl = req.file.path;
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { profilePictureUrl: imageUrl },
      { new: true },
    );

    if (!updatedUser) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }

    res.status(200).json({
      messageCode: "PROFILE_PICTURE_UPDATED",
      message: "Profile picture updated successfully.",
      data: {
        profilePictureUrl: updatedUser.profilePictureUrl,
      }
    });
  } catch (e) {
    next(e);
  }
};
export const refreshToken = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    let locations = [];
    if (user.role === "business" && user.businessId) {
      const Location = mongoose.model("Location");
      locations = await Location.find({ businessId: user.businessId }).lean();
    } else if (user.role === "staff" && user.locationIds) {
      const Location = mongoose.model("Location");
      locations = await Location.find({
        _id: { $in: user.locationIds },
      }).lean();
    }

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
        locations,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Unauthorized." 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        errorCode: "USER_NOT_FOUND",
        message: "User not found." 
      });
    }

    let locations = [];
    if (user.role === "business" && user.businessId) {
      const Location = mongoose.model("Location");
      locations = await Location.find({ businessId: user.businessId }).lean();
    } else if (user.role === "staff" && user.locationIds) {
      const Location = mongoose.model("Location");
      locations = await Location.find({
        _id: { $in: user.locationIds },
      }).lean();
    }

    res.status(200).json({
      _id: user._id,
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      businessId: user.businessId,
      primaryColor: user.primaryColor,
      theme: user.theme,
      mustChangePassword: user.mustChangePassword,
      profilePictureUrl: user.profilePictureUrl,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionBusinessId: user.subscriptionBusinessId,
      subscriptionActivatedAt: user.subscriptionActivatedAt,
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      locations,
    });
  } catch (error) {
    next(error);
  }
};
