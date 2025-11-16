import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Business from "../models/Business.js";
import {
  inviteStaffEmail,
  sendEmailChangeNotification,
} from "../utils/EmailService.js";
import {
  syncBusinessSubscriptionToUser,
  clearUserSubscription,
} from "../utils/subscriptionSync.js";

export const listBusinessStaff = async (req, res, next) => {
  try {
    const business = await Business.findById(req.user.businessId);

    if (!business) {
      return res.status(404).json({ message: "Бизнесът не е намерен." });
    }
    const staffMembers = await User.find({
      businessId: business._id,
      role: { $in: ["business", "staff"] },
    }).select("firstName lastName email phone role _id");

    res.json(staffMembers);
  } catch (e) {
    next(e);
  }
};

export const inviteStaff = async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone } = req.body;
    const ownerId = req.user.id; // Взимаме ID-то на собственика от `req.user` след middleware-а

    // 1. Проверка дали потребителят е собственик на бизнес
    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res.status(403).json({
        message: "Само собственици на бизнес могат да канят служители.",
      });
    }

    // 2. Проверка дали има съществуващ потребител с този имейл
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Потребител с този имейл вече съществува." });
    }

    // 3. Генериране на временна парола
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // 4. Създаване на нов потребител със роля 'staff'
    const newStaff = await User.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phone,
      role: "staff",
      businessId: business._id,
    });

    if (business.plan && business.plan !== "none") {
      await syncBusinessSubscriptionToUser(newStaff._id, business._id, {
        setActivatedAt: false,
      });
    }

    await inviteStaffEmail(
      firstName,
      lastName,
      email,
      tempPassword,
      business.businessName
    );

    res.status(201).json({
      message:
        "Служителят е поканен успешно. Изпратен е имейл с временна парола.",
      staff: {
        _id: newStaff._id,
        email: newStaff.email,
        firstName: newStaff.firstName,
        lastName: newStaff.lastName,
        phone: newStaff.phone,
        role: newStaff.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffByIds = async (req, res, next) => {
  try {
    const { staffIds } = req.body;

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Невалиден списък със служители." });
    }

    const staff = await User.find({ _id: { $in: staffIds } }).select(
      "firstName lastName email role"
    );

    res.status(200).json(staff);
  } catch (e) {
    next(e);
  }
};

export const removeStaff = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const { id: staffId } = req.params;

    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res
        .status(403)
        .json({ message: "Само собственици могат да премахват служители." });
    }

    const staff = await User.findById(staffId);
    if (!staff || String(staff.businessId) !== String(business._id)) {
      return res
        .status(404)
        .json({ message: "Служителят не е намерен за този бизнес." });
    }

    // Delete the staff account completely
    await User.findByIdAndDelete(staffId);

    res.json({
      message: "Служителят е премахнат и акаунтът е изтрит успешно.",
    });
  } catch (e) {
    next(e);
  }
};

export const updateStaffEmail = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const { id: staffId } = req.params;
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({ message: "Новият имейл е задължителен." });
    }

    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res
        .status(403)
        .json({
          message: "Само собственици могат да променят имейли на служители.",
        });
    }

    const staff = await User.findById(staffId);
    if (!staff || String(staff.businessId) !== String(business._id)) {
      return res
        .status(404)
        .json({ message: "Служителят не е намерен за този бизнес." });
    }

    // Check if new email already exists
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Потребител с този имейл вече съществува." });
    }

    const oldEmail = staff.email;
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Create new staff account with new email
    const newStaff = await User.create({
      email: newEmail,
      passwordHash,
      firstName: staff.firstName,
      lastName: staff.lastName,
      phone: staff.phone,
      role: staff.role,
      businessId: staff.businessId,
    });

    // Copy subscription data if exists
    if (staff.subscriptionPlan && staff.subscriptionPlan !== "none") {
      await syncBusinessSubscriptionToUser(newStaff._id, business._id, {
        setActivatedAt: false,
      });
    }

    // Delete old account
    await User.findByIdAndDelete(staffId);

    // Send notifications to both emails
    await sendEmailChangeNotification(
      oldEmail,
      newEmail,
      staff.firstName,
      staff.lastName,
      tempPassword,
      business.businessName
    );

    res.status(200).json({
      message:
        "Имейлът е променен успешно. Изпратени са имейли на стария и новия адрес.",
      staff: {
        _id: newStaff._id,
        email: newStaff.email,
        firstName: newStaff.firstName,
        lastName: newStaff.lastName,
        phone: newStaff.phone,
        role: newStaff.role,
      },
    });
  } catch (e) {
    next(e);
  }
};
