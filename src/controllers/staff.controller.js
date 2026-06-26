import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Business from "../models/Business.js";
import {
  inviteStaffEmail,
  sendEmailChangeNotification,
} from "../utils/EmailService.js";
import { syncBusinessSubscriptionToUser } from "../utils/subscriptionSync.js";
import StaffSchedule from "../models/StaffSchedule.js";
import DailySchedule from "../models/DailySchedule.js";
import Service from "../models/Service.js";
import { addUserToBusinessChannels, ensureAdminSupportChannel } from "../utils/chatSetup.js";

export const listBusinessStaff = async (req, res, next) => {
  try {
    const { businessId, locationId, ignoreLocation } = req.query;
    const headerLocationId = req.headers["x-location-id"];
    const effectiveLocationId = ignoreLocation === "true" ? null : (locationId || headerLocationId);

    if (!businessId) {
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "businessId is required in the request." 
      });
    }
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ 
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found." 
      });
    }

    const filter = {
      businessId: business._id,
    };
    
    const isValidLocation = effectiveLocationId && mongoose.Types.ObjectId.isValid(effectiveLocationId);

    if (isValidLocation) {
      filter.$or = [
        { role: "business" },
        { role: "manager", locationIds: { $in: [effectiveLocationId] } },
        { role: "staff", locationIds: { $in: [effectiveLocationId] } },
      ];
    } else {
      filter.role = { $in: ["business", "manager", "staff"] };
    }

    // Filter staff who have assigned services if requested
    const { onlyWithServices } = req.query;
    if (onlyWithServices === "true") {
      const serviceFilter = { business: business._id };
      if (effectiveLocationId) {
        serviceFilter.locationIds = { $in: [effectiveLocationId] };
      }
      const services = await Service.find(serviceFilter).select("staffMembers");

      const assignedStaffIds = new Set();
      services.forEach((service) => {
        if (service.staffMembers && Array.isArray(service.staffMembers)) {
          service.staffMembers.forEach((id) => {
            if (id && mongoose.Types.ObjectId.isValid(id)) {
              assignedStaffIds.add(id.toString());
            }
          });
        }
      });

      filter._id = { $in: Array.from(assignedStaffIds) };
    }

    const staffMembers = await User.find(filter).select(
      "firstName lastName email phone role _id profilePictureUrl locationIds rating ratingCount",
    );
    res.json(staffMembers);
  } catch (e) {
    next(e);
  }
};

export const inviteStaff = async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone, locationId, locationIds, role } =
      req.body;
    const ownerId = req.user.id;
    const normalizedLocationIds = normalizeLocationIds({
      locationId,
      locationIds,
    });

    // 1. Проверка дали потребителят е собственик на бизнес
    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Only business owners can invite staff.",
      });
    }

    // 2. Проверка дали има съществуващ потребител с този имейл
    const normalizedEmail = email.trim().toLowerCase();
    let existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return await handleExistingStaffUser(
        existingUser,
        business,
        normalizedLocationIds,
        res,
      );
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
        role: role,
        businessId: business._id,
        locationIds: normalizedLocationIds,
        mustChangePassword: true,
      });

      if (business.plan && business.plan !== "none") {
        await syncBusinessSubscriptionToUser(newStaff._id, business._id, {
          setActivatedAt: false,
        });
      }

      // Автоматично клониране на графика на локацията към новия служител
      for (const locId of normalizedLocationIds) {
        await cloneLocationScheduleToStaff(newStaff._id, locId, business._id);
      }

      await inviteStaffEmail(
        firstName,
        lastName,
        normalizedEmail,
        tempPassword,
        business.businessName,
      );

      return res.status(201).json({
        messageCode: "STAFF_INVITED",
        message: "Staff member invited successfully. An email with a temporary password has been sent.",
        data: {
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
            normalizedLocationIds,
            res,
          );
        }
      }
      throw error;
    }

    // Add new staff to business chat channels (non-blocking)
    addUserToBusinessChannels(newStaff._id, business._id, normalizedLocationIds).catch(err =>
      console.error("Chat channel add-member error:", err)
    );
    ensureAdminSupportChannel(newStaff._id).catch(err =>
      console.error("Admin support channel error:", err)
    );
  } catch (error) {
    next(error);
  }
};

export const getStaffByIds = async (req, res, next) => {
  try {
    const { staffIds } = req.body;

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return res.status(400).json({ 
        errorCode: "INVALID_STAFF_LIST",
        message: "Invalid list of staff members." 
      });
    }

    const staff = await User.find({ _id: { $in: staffIds } }).select(
      "firstName lastName email role",
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
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Only owners can remove staff." 
      });
    }

    const staff = await User.findById(staffId);
    if (!staff || String(staff.businessId) !== String(business._id)) {
      return res.status(404).json({ 
        errorCode: "STAFF_NOT_FOUND",
        message: "Staff member not found for this business." 
      });
    }

    // Delete the staff account completely
    await User.findByIdAndDelete(staffId);

    res.json({
      message: "Staff member removed and account deleted successfully.",
      messageCode: "STAFF_REMOVED"
    });
  } catch (e) {
    next(e);
  }
};

export const updateStaff = async (req, res, next) => {
  try {
    const actorId = req.user.id;
    const actorRole = req.user.role;
    const { id: staffId } = req.params;
    const { firstName, lastName, email, phone, role, locationIds } = req.body;

    let business = null;
    if (actorRole === "business") {
      business = await Business.findOne({ owner: actorId });
    } else if (actorRole === "manager" && req.user.businessId) {
      business = await Business.findById(req.user.businessId);
    }

    if (!business) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have permission to edit staff.",
      });
    }

    const staff = await User.findById(staffId);
    if (!staff || String(staff.businessId) !== String(business._id)) {
      return res.status(404).json({ 
        errorCode: "STAFF_NOT_FOUND",
        message: "Staff member not found for this business." 
      });
    }

    let managerLocationIds = [];
    if (actorRole === "manager") {
      const manager = await User.findById(actorId).select(
        "role businessId locationIds",
      );

      if (
        !manager ||
        manager.role !== "manager" ||
        String(manager.businessId || "") !== String(business._id)
      ) {
        return res.status(403).json({ 
          errorCode: "UNAUTHORIZED_ACTION",
          message: "You do not have permission to edit this staff member." 
        });
      }

      managerLocationIds = (manager.locationIds || []).map((id) => String(id));
      const staffLocationIds = (staff.locationIds || []).map((id) =>
        String(id),
      );
      const hasSharedLocation = staffLocationIds.some((id) =>
        managerLocationIds.includes(id),
      );

      if (
        !hasSharedLocation ||
        staff.role === "business" ||
        staff.role === "admin"
      ) {
        return res.status(403).json({ 
          errorCode: "UNAUTHORIZED_ACTION",
          message: "You do not have permission to edit this staff member." 
        });
      }
    }

    // Identify newly added locations to clone schedules
    const oldLocationIds = (staff.locationIds || []).map((id) => String(id));
    const normalizedLocationIds = Array.isArray(locationIds)
      ? normalizeLocationIds({ locationIds })
      : null;
    const newLocationIds = normalizedLocationIds
      ? normalizedLocationIds.filter(
          (id) => !oldLocationIds.includes(String(id)),
        )
      : [];

    // Update fields
    if (firstName) staff.firstName = firstName;
    if (lastName) staff.lastName = lastName;
    if (phone) staff.phone = phone;
    if (role) {
      if (
        actorRole === "manager" &&
        (role === "business" || role === "admin")
      ) {
        return res.status(403).json({
          errorCode: "UNAUTHORIZED_ACTION",
          message: "Manager does not have permission to assign this role.",
        });
      }
      staff.role = role;
    }

    if (normalizedLocationIds) {
      if (
        actorRole === "manager" &&
        normalizedLocationIds.some((id) => !managerLocationIds.includes(id))
      ) {
        return res.status(403).json({
          errorCode: "UNAUTHORIZED_ACTION",
          message: "Manager can only assign their own locations.",
        });
      }
      staff.locationIds = normalizedLocationIds;
    }

    // Handle email change separately if needed (consistent with updateStaffEmail logic if desired)
    if (email && email !== staff.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(409).json({ 
          errorCode: "EMAIL_ALREADY_EXISTS",
          message: "Email is already in use." 
        });
      }
      staff.email = email;
    }

    await staff.save();

    // Clone schedules for new locations
    for (const locId of newLocationIds) {
      await cloneLocationScheduleToStaff(staff._id, locId, business._id);
    }

    res.json({
      message: "Staff member updated successfully.",
      messageCode: "STAFF_UPDATED",
      data: {
        _id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        locationIds: staff.locationIds,
      }
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
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "New email is required." 
      });
    }

    const business = await Business.findOne({ owner: ownerId });
    if (!business) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Only owners can change staff emails.",
      });
    }

    const staff = await User.findById(staffId);
    if (!staff || String(staff.businessId) !== String(business._id)) {
      return res.status(404).json({ 
        errorCode: "STAFF_NOT_FOUND",
        message: "Staff member not found for this business." 
      });
    }

    // Check if new email already exists
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(409).json({ 
        errorCode: "EMAIL_ALREADY_EXISTS",
        message: "User with this email already exists." 
      });
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
      business.businessName,
    );

    res.status(200).json({
      message: "Email changed successfully. Emails sent to old and new addresses.",
      messageCode: "EMAIL_CHANGED",
      data: {
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

export const rateStaff = async (req, res, next) => {
  try {
    const { id: staffId } = req.params;
    const rawRating = Number(req.body?.rating);

    if (!mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({ 
        errorCode: "INVALID_STAFF_ID",
        message: "Invalid staff id." 
      });
    }

    if (!Number.isFinite(rawRating) || rawRating < 1 || rawRating > 5) {
      return res.status(400).json({ 
        errorCode: "INVALID_RATING",
        message: "Rating must be a number between 1 and 5." 
      });
    }

    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ 
        errorCode: "STAFF_NOT_FOUND",
        message: "Staff member not found." 
      });
    }

    const currentTotal = Number(staff.ratingTotal || 0);
    const currentCount = Number(staff.ratingCount || 0);

    staff.ratingTotal = currentTotal + rawRating;
    staff.ratingCount = currentCount + 1;
    staff.rating = Number(rawRating.toFixed(1));

    await staff.save();

    res.json({
      message: "Rating submitted successfully.",
      messageCode: "RATING_SUBMITTED",
      data: {
        _id: staff._id,
        rating: staff.rating,
        ratingCount: staff.ratingCount,
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Помощна функция за обработка на вече съществуващ потребител (логика за добавяне към локация)
 */
async function handleExistingStaffUser(user, business, locationIds, res) {
  const incomingLocationIds = normalizeLocationIds({ locationIds });
  const isOwner = String(user._id) === String(business.owner);
  const isSameBusiness = String(user.businessId) === String(business._id);
  const isUnattached = !user.businessId;

  // Case 1: User belongs to SAME business (Owner or already Staff)
  if (isSameBusiness || isOwner) {
    const stringLocationIds = (user.locationIds || []).map((id) =>
      id.toString(),
    );
    const locationIdsToAdd = incomingLocationIds.filter(
      (locId) => !stringLocationIds.includes(locId.toString()),
    );

    if (locationIdsToAdd.length > 0) {
      locationIdsToAdd.forEach((locId) => {
        user.locationIds.push(new mongoose.Types.ObjectId(locId));
      });
      user.markModified("locationIds");

      // If owner is inviting themselves, ensure they have a role that can be scheduled (or just keep as business)
      // We don't change owner's role to 'staff' because they are 'business'

      await user.save();

      // Автоматично клониране на графика на локацията към служителя/собственика
      for (const locId of locationIdsToAdd) {
        await cloneLocationScheduleToStaff(user._id, locId, business._id);
      }

      return res.status(200).json({
        messageCode: "STAFF_ADDED_TO_LOCATION",
        message: isOwner
          ? "Business owner successfully added to location."
          : "Staff successfully added to new location.",
        data: {
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
      errorCode: isOwner ? "OWNER_ALREADY_ADDED" : "STAFF_ALREADY_ADDED",
      message: isOwner
        ? "You are already added to this location."
        : "This staff member is already assigned to this location.",
    });
  }

  // Case 2: User exists but has NO business (Personal user)
  if (isUnattached || user.role === "personal") {
    user.businessId = business._id;
    user.role = "staff"; // Convert to staff role
    user.locationIds = incomingLocationIds.map(
      (locId) => new mongoose.Types.ObjectId(locId),
    );
    user.markModified("locationIds");
    await user.save();

    for (const locId of incomingLocationIds) {
      await cloneLocationScheduleToStaff(user._id, locId, business._id);
    }

    return res.status(200).json({
      messageCode: "STAFF_ADDED_TO_BUSINESS",
      message: "User successfully added as staff to your business.",
      data: {
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
    errorCode: "EMAIL_LINKED_TO_OTHER_BUSINESS",
    message: `This email ${user.email} is linked to another business profile and cannot be added.`,
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

function normalizeLocationIds({ locationId, locationIds }) {
  const rawLocationIds = Array.isArray(locationIds)
    ? locationIds
    : locationId
      ? [locationId]
      : [];

  const uniqueLocationIds = Array.from(
    new Set(rawLocationIds.map((id) => String(id))),
  );

  return uniqueLocationIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
}
