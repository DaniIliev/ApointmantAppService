import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Business from "../models/Business.js";
import { generateQrDataUrl } from "../utils/qrcode.js";
import mongoose from "mongoose";

export const register = async (req, res, next) => {
  try {
    const { email, password, role, phone, firstName, lastName } = req.body;
    if (!email || !password || !role)
      return res
        .status(400)
        .json({ message: "email, password, role са задължителни" });
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: "Email вече съществува" });

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
      if (!businessName)
        return res.status(400).json({ message: "businessName е задължително" });

      business = await Business.create({
        owner: user.id,
        businessName,
        // address,
        phone: businessPhone,
      });

      const link = `${process.env.CLIENT_URL}/book/${business.id}`;
      const qrCodeUrl = await generateQrDataUrl(link);
      business.qrCodeUrl = qrCodeUrl;
      await business.save();

      user.businessId = business._id;
      await user.save();
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
        user: userResponse,
        business: business.toJSON(),
      });
    }

    res.status(201).json({ user: userResponse });
  } catch (e) {
    next(e);
  }
};
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

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
      },
    });
  } catch (e) {
    next(e);
  }
};

export const getUserById = async (req, res, next) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
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
      profilePictureUrl: user.profilePictureUrl,
    });
  } catch (error) {
    next(e);
  }
};

export const updateUser = async (req, res, next) => {
  const { id } = req.params;
  const { firstName, lastName, phone, primaryColor, theme } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  try {
    const updateFields = {};
    if (firstName) updateFields.firstName = firstName;
    if (lastName) updateFields.lastName = lastName;
    if (phone) updateFields.phone = phone;
    if (primaryColor) updateFields.primaryColor = primaryColor;
    if (theme) updateFields.theme = theme;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      _id: updatedUser._id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
      primaryColor: updatedUser.primaryColor,
      theme: updatedUser.theme,
      profilePictureUrl: updatedUser.profilePictureUrl,
    });
  } catch (e) {
    next(e);
  }
};

export const updateProfilePicture = async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  if (!req.file || !req.file.path) {
    return res.status(400).json({ message: "No image file uploaded" });
  }

  try {
    const imageUrl = req.file.path;
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { profilePictureUrl: imageUrl },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile picture updated successfully",
      profilePictureUrl: updatedUser.profilePictureUrl,
    });
  } catch (e) {
    next(e);
  }
};
