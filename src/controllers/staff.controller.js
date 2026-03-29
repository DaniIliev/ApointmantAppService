import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Business from "../models/Business.js";
import {
  inviteStaffEmail,
  sendEmailChangeNotification,
} from "../utils/EmailService.js";
import {
  syncBusinessSubscriptionToUser,
} from "../utils/subscriptionSync.js";
import StaffSchedule from "../models/StaffSchedule.js";
import DailySchedule from "../models/DailySchedule.js";
import Service from "../models/Service.js";

export const listBusinessStaff = async (req, res, next) => {
  try {
    const { businessId, locationId } = req.query;
    const headerLocationId = req.headers["x-location-id"];
    const effectiveLocationId = locationId || headerLocationId;

    if (!businessId) {
      return res
        .status(400)
        .json({ message: "businessId е задължителен в заявката." });
    }
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: "Бизнесът не е намерен." });
    }

    const filter = {
      businessId: business._id,
    };
    if (effectiveLocationId) {
      filter.$or = [
        { role: "business" },
        { role: "staff", locationIds: { $in: [effectiveLocationId] } }
      ];
    } else {
      filter.role = { $in: ["business", "staff"] };
    }

    // Filter staff who have assigned services if requested
    const { onlyWithServices } = req.query;
    if (onlyWithServices === "true") {
      const serviceFilter = { business: business._id };
      if (effectiveLocationId) {
        serviceFilter.locationId = effectiveLocationId;
      }
      const services = await Service.find(serviceFilter).select("staffMembers");
      
      const assignedStaffIds = new Set();
      services.forEach(service => {
        if (service.staffMembers && Array.isArray(service.staffMembers)) {
          service.staffMembers.forEach(id => {
            if (id && mongoose.Types.ObjectId.isValid(id)) {
              assignedStaffIds.add(id.toString());
            }
          });
        }
      });
      
      filter._id = { $in: Array.from(assignedStaffIds) };
    }

    const staffMembers = await User.find(filter).select(
      "firstName lastName email phone role _id profilePictureUrl locationIds"
    );
    res.json(staffMembers);
  } catch (e) {
    next(e);
  }
};

export const inviteStaff = async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone, locationId } = req.body;
    const ownerId = req.user.id;

    // 1. Проверка дали потребителят е собственик на бизнес
    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res.status(403).json({
        message: "Само собственици на бизнес могат да канят служители.",
      });
    }

    // 2. Проверка дали има съществуващ потребител с този имейл
    const normalizedEmail = email.trim().toLowerCase();
    let existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return await handleExistingStaffUser(existingUser, business, locationId, res);
    }

    // 3. Генериране на временна парола
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // 4. Опит за създаване (с обработка на Race Condition)
    try {
      const newStaff = await User.create({
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        phone,
        role: "staff",
        businessId: business._id,
        locationIds: locationId ? [locationId] : [],
        mustChangePassword: true,
      });

      if (business.plan && business.plan !== "none") {
        await syncBusinessSubscriptionToUser(newStaff._id, business._id, {
          setActivatedAt: false,
        });
      }

      // Автоматично клониране на графика на локацията към новия служител
      if (locationId) {
        await cloneLocationScheduleToStaff(
          newStaff._id,
          locationId,
          business._id
        );
      }

      await inviteStaffEmail(
        firstName,
        lastName,
        normalizedEmail,
        tempPassword,
        business.businessName
      );

        return res.status(201).json({
          message:
            "Служителят е поканен успешно. Изпратен е имейл с временна парола.",
          staff: {
            _id: newStaff._id,
            email: newStaff.email,
            firstName: newStaff.firstName,
            lastName: newStaff.lastName,
            phone: newStaff.phone,
            role: newStaff.role,
            locationIds: newStaff.locationIds,
          },
        });
      } catch (error) {
        if (error.code === 11000) {
          // Race Condition: Потребител е създаден между findOne и create
          existingUser = await User.findOne({ email: normalizedEmail });
          if (existingUser) {
            return await handleExistingStaffUser(
              existingUser,
              business,
              locationId,
              res
            );
          }
        }
        throw error;
      }
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

export const updateStaff = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const { id: staffId } = req.params;
    const { firstName, lastName, email, phone, role, locationIds } = req.body;

    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res.status(403).json({
        message: "Само собственици могат да редактират служители.",
      });
    }

    const staff = await User.findById(staffId);
    if (!staff || String(staff.businessId) !== String(business._id)) {
      return res
        .status(404)
        .json({ message: "Служителят не е намерен за този бизнес." });
    }

    // Identify newly added locations to clone schedules
    const oldLocationIds = staff.locationIds || [];
    const newLocationIds = (locationIds || []).filter(
      (id) => !oldLocationIds.includes(String(id))
    );

    // Update fields
    if (firstName) staff.firstName = firstName;
    if (lastName) staff.lastName = lastName;
    if (phone) staff.phone = phone;
    if (role) staff.role = role;
    if (locationIds) staff.locationIds = locationIds;

    // Handle email change separately if needed (consistent with updateStaffEmail logic if desired)
    if (email && email !== staff.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(409).json({ message: "Имейлът вече се използва." });
      }
      staff.email = email;
    }

    await staff.save();

    // Clone schedules for new locations
    for (const locId of newLocationIds) {
      await cloneLocationScheduleToStaff(staff._id, locId, business._id);
    }

    res.json({
      _id: staff._id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      locationIds: staff.locationIds,
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
      return res.status(403).json({
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
      mustChangePassword: true,
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

/**
 * Помощна функция за обработка на вече съществуващ потребител (логика за добавяне към локация)
 */
async function handleExistingStaffUser(user, business, locationId, res) {
  const isOwner = String(user._id) === String(business.owner);
  const isSameBusiness = String(user.businessId) === String(business._id);
  const isUnattached = !user.businessId;

  // Case 1: User belongs to SAME business (Owner or already Staff)
  if (isSameBusiness || isOwner) {
    const stringLocationIds = (user.locationIds || []).map((id) => id.toString());

    if (locationId && !stringLocationIds.includes(locationId.toString())) {
      user.locationIds.push(new mongoose.Types.ObjectId(locationId));
      user.markModified("locationIds");
      
      // If owner is inviting themselves, ensure they have a role that can be scheduled (or just keep as business)
      // We don't change owner's role to 'staff' because they are 'business'
      
      await user.save();

      // Автоматично клониране на графика на локацията към служителя/собственика
      await cloneLocationScheduleToStaff(user._id, locationId, business._id);

      return res.status(200).json({
        message: isOwner 
          ? "Бизнес собственикът беше добавен успешно към локацията." 
          : "Служителят беше добавен към новата локация.",
        staff: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          locationIds: user.locationIds,
        },
      });
    }
    
    return res.status(409).json({ 
      message: isOwner 
        ? "Вече сте добавени към тази локация." 
        : "Този служител вече е добавен към тази локация." 
    });
  }

  // Case 2: User exists but has NO business (Personal user)
  if (isUnattached || user.role === "personal") {
    user.businessId = business._id;
    user.role = "staff"; // Convert to staff role
    user.locationIds = locationId ? [new mongoose.Types.ObjectId(locationId)] : [];
    user.markModified("locationIds");
    await user.save();

    if (locationId) {
      await cloneLocationScheduleToStaff(user._id, locationId, business._id);
    }

    return res.status(200).json({
      message: "Потребителят беше добавен като служител към вашия бизнес.",
      staff: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        locationIds: user.locationIds,
      },
    });
  }

  // Case 3: User belongs to ANOTHER business
  return res.status(409).json({
    message: "Този имейл е свързан с друг бизнес профил и не може да бъде добавен.",
  });
}

/**
 * Клонира графика на локацията (staff: null) към новосъздадения служител
 */
async function cloneLocationScheduleToStaff(staffId, locationId, businessId) {
  try {
    // 1. Проверка дали служителят вече има график за тази локация
    const existingStaffSchedule = await StaffSchedule.findOne({
      staff: staffId,
      location: locationId,
    });
    if (existingStaffSchedule) return;

    // 2. Намиране на дефолтния график на локацията (staff: null)
    const locationSchedule = await StaffSchedule.findOne({
      staff: null,
      location: locationId,
    }).populate("dailySchedule");

    if (!locationSchedule || !locationSchedule.dailySchedule) {
      console.log(`ℹ️ Няма дефолтен график за локация ${locationId}`);
      return;
    }

    // 3. Клониране на DailySchedule (създаване на нов запис)
    const newDailySchedule = new DailySchedule({
      workHours: locationSchedule.dailySchedule.workHours,
    });
    await newDailySchedule.save();

    // 4. Създаване на нов StaffSchedule за служителя
    const newStaffSchedule = new StaffSchedule({
      startDate: locationSchedule.startDate,
      endDate: locationSchedule.endDate,
      workTime: locationSchedule.workTime,
      isDayOff: locationSchedule.isDayOff,
      break1: locationSchedule.break1,
      break2: locationSchedule.break2,
      break3: locationSchedule.break3,
      staff: staffId,
      location: locationId,
      business: businessId,
      dailySchedule: newDailySchedule._id,
    });
    await newStaffSchedule.save();
    console.log(`✅ Графикът на локацията е клониран за служител ${staffId}`);
  } catch (error) {
    console.error("❌ Грешка при клониране на графика:", error);
  }
}
