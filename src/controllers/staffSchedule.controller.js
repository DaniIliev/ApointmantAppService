import StaffSchedule from "../models/StaffSchedule.js";
import User from "../models/User.js";
import DailySchedule from "../models/DailySchedule.js";
import mongoose from "mongoose";
import Location from "../models/Location.js";

const isTimeValid = (timeStr) => {
  if (!timeStr) return false;
  return /^\d{2}:\d{2}/.test(timeStr);
};

const validateLocationHours = async (locationId, userWeeklyWorkingHours) => {
  const location = await Location.findById(locationId);
  if (!location) {
     return { isValid: false, message: "Локацията не е намерена." };
  }

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  for (const day of days) {
    const userDay = userWeeklyWorkingHours?.[day];
    
    if (userDay && !userDay.isDayOff) {
      const uWorkTime = userDay.workTime;
      if (!uWorkTime || !isTimeValid(uWorkTime.start) || !isTimeValid(uWorkTime.end)) {
         return { isValid: false, message: `Невалиден формат за работните часове в ден ${day}.` };
      }

      const locDay = location.weeklyWorkingHours?.[day];
      if (locDay?.isDayOff) {
        return { isValid: false, message: `Локацията не работи в ден ${day}. Не можете да зададете работен график за този ден.` };
      }
      
      if (!locDay || !locDay.workTime || !locDay.workTime.start || !locDay.workTime.end) {
         return { isValid: false, message: `Локацията няма дефинирано работно време в ден ${day}.` };
      }

      if (uWorkTime.start < locDay.workTime.start || uWorkTime.end > locDay.workTime.end) {
         return { isValid: false, message: `Графикът в ден ${day} (${uWorkTime.start}-${uWorkTime.end}) излиза извън работното време на локацията (${locDay.workTime.start}-${locDay.workTime.end}).` };
      }
    }
  }
  return { isValid: true };
};

const validateScheduleConflicts = async (staffId, startDate, endDate, userWeeklyWorkingHours, excludeScheduleId = null) => {
  if (!staffId) return { isValid: true };

  const filter = {
    staff: staffId,
    startDate: { $lte: new Date(endDate) },
    endDate: { $gte: new Date(startDate) }
  };
  if (excludeScheduleId) filter._id = { $ne: excludeScheduleId };

  const overlappingSchedules = await StaffSchedule.find(filter).populate("dailySchedule");

  const timesOverlap = (start1, end1, start2, end2) => start1 < end2 && end1 > start2;

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  for (const existing of overlappingSchedules) {
    if (!existing.dailySchedule || !existing.dailySchedule.workHours) continue;

    for (const day of days) {
      const userDay = userWeeklyWorkingHours?.[day];
      if (!userDay || userDay.isDayOff) continue;

      // Find the work details for this day of the week in the existing daily schedule
      // Since a template is usually consistent, we look for the first occurrence of this day name
      const existingDay = existing.dailySchedule.workHours.find(item => item.day === day);
      
      if (existingDay && !existingDay.isDayOff) {
        if (timesOverlap(userDay.workTime.start, userDay.workTime.end, existingDay.workTime.start, existingDay.workTime.end)) {
          return { isValid: false, message: `Има конфликт с друг график на този служител в ден ${day} (припокриващи се часове).` };
        }
      }
    }
  }
  return { isValid: true };
};

const createDefaultDailySchedule = async (
  startDate,
  endDate,
  weeklyWorkingHours,
  breaks = [],
) => {
  const workHours = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Ensure breaks is an array and filter out empty ones
  const activeBreaks = Array.isArray(breaks) 
    ? breaks.filter(b => b.start && b.end) 
    : [];

  // Sort breaks to ensure consistency
  activeBreaks.sort((a, b) => a.start.localeCompare(b.start));

  // Обхожда всички дни в периода
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay(); // 0 for Sunday, 1 for Monday
    const dayName = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][dayOfWeek];

    const isThisDayOff = weeklyWorkingHours?.[dayName]?.isDayOff ?? true;
    const wTime = weeklyWorkingHours?.[dayName]?.workTime ?? {
      start: null,
      end: null,
    };

    workHours.push({
      day: dayName,
      date: new Date(d),
      isDayOff: isThisDayOff,
      workTime: isThisDayOff ? null : { start: wTime.start, end: wTime.end },
      breaks: isThisDayOff ? [] : activeBreaks,
    });
  }
  const dailySchedule = new DailySchedule({ workHours });
  return await dailySchedule.save();
};

// -------------------------------------------------------------------

// --- GET /api/staff-schedules ---
export const getSchedules = async (req, res, next) => {
  try {
    const { staffId } = req.query;
    // Query parameter takes precedence over header, allowing bypass with ?locationId=null
    const locationId =
      req.query.locationId !== undefined
        ? req.query.locationId
        : req.headers["x-location-id"];
    const userId = req.user?.id || req.user?._id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ message: "Невалидна аутентикация." });
    }
    const filter = {};

    // Always filter by the user's business
    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res
        .status(400)
        .json({ message: "Потребителят не е свързан с бизнес." });
    }
    // Ensure we have a valid ObjectId for business
    const bizIdStr =
      requestUser.businessId?.toString() || requestUser._id?.toString();
    filter.business = new mongoose.Types.ObjectId(bizIdStr);

    // Safety check for locationId/staffId to avoid filtering by "undefined", "null" or empty strings
    const isExplicitExclude =
      locationId === "null" || locationId === "none" || locationId === "all";
    const effectiveLocationId =
      locationId &&
      !isExplicitExclude &&
      String(locationId) !== "undefined" &&
      String(locationId) !== ""
        ? locationId
        : null;
    const effectiveStaffId =
      staffId && String(staffId) !== "undefined" && String(staffId) !== ""
        ? staffId
        : null;

    if (userRole === "business" || userRole === "manager") {
      if (effectiveLocationId) filter.location = effectiveLocationId;
      if (effectiveStaffId) {
        filter.staff =
          effectiveStaffId === "null" || effectiveStaffId === null
            ? null
            : effectiveStaffId;
      }
    } else {
      filter.staff = userId;
      if (effectiveLocationId) filter.location = effectiveLocationId;
    }

    const schedules = await StaffSchedule.find(filter)
      .populate("staff", "firstName lastName email")
      .sort({
        startDate: -1,
      });
    res.status(200).json(schedules);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- GET /api/staff-schedules/:id/details ---
export const getDailySchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;

    const schedule = await StaffSchedule.findById(id).populate("dailySchedule");
    if (!schedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    // Ownership check: must be the staff member OR the business owner
    // For now, let's allow if staff matches OR if it's a business owner (simplified)
    if (
      schedule.staff &&
      schedule.staff.toString() !== userId &&
      req.user.role !== "business"
    ) {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    // Връща workHours, които трябва да съдържат и isDayOff
    res.status(200).json(schedule.dailySchedule.workHours);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- GET /api/staff-schedules/details/by-staff/:staffId ---
export const getDailyScheduleByStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { locationId } = req.query;
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Невалидна аутентикация." });
    }

    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res
        .status(400)
        .json({ message: "Потребителят не е свързан с бизнес." });
    }

    const filter = {
      business: new mongoose.Types.ObjectId(requestUser.businessId),
      staff: new mongoose.Types.ObjectId(staffId),
    };

    if (locationId) {
      filter.location = locationId;
    }

    const schedules = await StaffSchedule.find(filter)
      .select("_id startDate dailySchedule")
      .populate("dailySchedule")
      .sort({ startDate: -1 });

    const byDate = new Map();

    for (const schedule of schedules) {
      const workHours = schedule?.dailySchedule?.workHours || [];

      for (const dayItem of workHours) {
        const dateKey = new Date(dayItem.date).toISOString().split("T")[0];

        if (!byDate.has(dateKey)) {
          byDate.set(dateKey, {
            ...dayItem.toObject(),
            scheduleId: schedule._id,
          });
          continue;
        }

        const existing = byDate.get(dateKey);
        if (existing?.isDayOff && !dayItem?.isDayOff) {
          byDate.set(dateKey, {
            ...dayItem.toObject(),
            scheduleId: schedule._id,
          });
        }
      }
    }

    const merged = Array.from(byDate.values()).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    res.status(200).json(merged);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- POST /api/staff-schedules ---
export const createSchedule = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const {
      startDate,
      endDate,
      weeklyWorkingHours,
      breaks, // Array of breaks
      break1, // Backward compatibility
      break2,
      break3,
      locationId,
      staffId, // Optional
    } = req.body;

    const resolvedBreaks = breaks || [break1, break2, break3].filter(b => b && b.start && b.end);

    if (!locationId) {
      return res.status(400).json({ message: "locationId е задължителен." });
    }

    const requestUser = await User.findById(userId);
    if (
      !requestUser ||
      !["staff", "business", "manager"].includes(requestUser.role)
    ) {
      return res.status(403).json({
        message:
          "Само служители и собственици на бизнес могат да управляват график.",
      });
    }

    if (!requestUser.businessId) {
      return res
        .status(400)
        .json({ message: "Потребителят не е свързан с бизнес." });
    }

    const targetStaffId = staffId || (requestUser.role === "staff" ? userId : null);

    // Валидация спрямо локацията
    const locValidation = await validateLocationHours(locationId, weeklyWorkingHours);
    if (!locValidation.isValid) return res.status(400).json({ message: locValidation.message });

    // Валидация за конфликти
    const conflictValidation = await validateScheduleConflicts(targetStaffId, startDate, endDate, weeklyWorkingHours);
    if (!conflictValidation.isValid) return res.status(400).json({ message: conflictValidation.message });

    const dailyScheduleDoc = await createDefaultDailySchedule(
      startDate,
      endDate,
      weeklyWorkingHours,
      resolvedBreaks,
    );

    const newSchedule = new StaffSchedule({
      startDate,
      endDate,
      staff: targetStaffId,
      location: locationId,
      business: requestUser.businessId,
      dailySchedule: dailyScheduleDoc._id,
    });
    await newSchedule.save();
    res.status(201).json(newSchedule);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- PUT /api/staff-schedules/:id ---
export const updateSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const userRole = req.user?.role;
    const updateData = req.body;

    const currentSchedule = await StaffSchedule.findById(id);
    if (!currentSchedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    // Permission check: staff member themselves or business owner
    if (
      currentSchedule.staff &&
      currentSchedule.staff.toString() !== userId &&
      userRole !== "business" &&
      !(
        userRole === "manager" &&
        String(currentSchedule.business) === String(req.user?.businessId)
      )
    ) {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    // 2. Обновяване на StaffSchedule
    const updatedSchedule = await StaffSchedule.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );

    // 3. Актуализиране на DailySchedule, ако има промени в правилата
    const fieldsToTriggerDailyUpdate = [
      "startDate",
      "endDate",
      "weeklyWorkingHours",
      "break1",
      "break2",
      "break3",
    ];

    const shouldUpdateDailySchedule = fieldsToTriggerDailyUpdate.some((field) =>
      updateData.hasOwnProperty(field),
    );

    const resolvedBreaks = updateData.breaks || [updateData.break1 || updatedSchedule.break1, updateData.break2 || updatedSchedule.break2, updateData.break3 || updatedSchedule.break3].filter(b => b && b.start && b.end);

    if (shouldUpdateDailySchedule) {
      const resolvedStartDate = updateData.startDate || updatedSchedule.startDate;
      const resolvedEndDate = updateData.endDate || updatedSchedule.endDate;
      const resolvedWeeklyWorkingHours = updateData.weeklyWorkingHours || updatedSchedule.weeklyWorkingHours;

      // Валидация спрямо локацията
      const locValidation = await validateLocationHours(updatedSchedule.location, resolvedWeeklyWorkingHours);
      if (!locValidation.isValid) {
         // Revert the updatedSchedule since we already mutated it above
         await StaffSchedule.findByIdAndUpdate(id, currentSchedule.toObject());
         return res.status(400).json({ message: locValidation.message });
      }

      // Валидация за конфликти
      const conflictValidation = await validateScheduleConflicts(updatedSchedule.staff, resolvedStartDate, resolvedEndDate, resolvedWeeklyWorkingHours, updatedSchedule._id);
      if (!conflictValidation.isValid) {
         await StaffSchedule.findByIdAndUpdate(id, currentSchedule.toObject());
         return res.status(400).json({ message: conflictValidation.message });
      }

      await DailySchedule.findByIdAndDelete(currentSchedule.dailySchedule);

      const newDailyScheduleDoc = await createDefaultDailySchedule(
        resolvedStartDate,
        resolvedEndDate,
        resolvedWeeklyWorkingHours,
        resolvedBreaks
      );

      await StaffSchedule.updateOne(
        { _id: updatedSchedule._id },
        { dailySchedule: newDailyScheduleDoc._id },
      );

      updatedSchedule.dailySchedule = newDailyScheduleDoc._id;
    }

    res.status(200).json(updatedSchedule);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- PUT /api/staff-schedules/:id/details ---
export const updateDailySchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const { workHours, workHour } = req.body;

    const schedule = await StaffSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    if (
      schedule.staff &&
      schedule.staff.toString() !== userId &&
      req.user.role !== "business"
    ) {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    const dailySchedule = await DailySchedule.findById(schedule.dailySchedule);
    if (!dailySchedule) {
      return res
        .status(404)
        .json({ message: "Детайлният график не е намерен." });
    }

    if (Array.isArray(workHours)) {
      dailySchedule.workHours = workHours;
    } else if (workHour && typeof workHour === "object") {
      const targetId = workHour._id?.toString();
      const index = dailySchedule.workHours.findIndex(
        (item) => item._id.toString() === targetId,
      );

      if (index === -1) {
        return res
          .status(404)
          .json({ message: "Денят за редакция не е намерен." });
      }

      const dayName = workHour.day || dailySchedule.workHours[index].day;
      const validationWeeklyHours = {};
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      
      days.forEach(d => {
        if (d === dayName) {
          validationWeeklyHours[d] = {
            isDayOff: workHour.isDayOff,
            workTime: workHour.workTime,
            breaks: workHour.breaks
          };
        } else {
          validationWeeklyHours[d] = { isDayOff: true };
        }
      });

      // Validate against Location Hours
      const locValidation = await validateLocationHours(schedule.location, validationWeeklyHours);
      if (!locValidation.isValid) return res.status(400).json({ message: locValidation.message });

      // Validate against Conflicts with other schedules for this staff member
      // We limit the range to this specific day to focus on the override conflict.
      const conflictDate = workHour.date || dailySchedule.workHours[index].date;
      const conflictValidation = await validateScheduleConflicts(
        schedule.staff, 
        conflictDate, 
        conflictDate, 
        validationWeeklyHours, 
        schedule._id
      );
      if (!conflictValidation.isValid) return res.status(400).json({ message: conflictValidation.message });
      // ────────────────────────────────────────────────────

      dailySchedule.workHours[index] = {
        ...dailySchedule.workHours[index].toObject(),
        ...workHour,
        date: workHour.date
          ? new Date(workHour.date)
          : dailySchedule.workHours[index].date,
      };
    } else {
      return res.status(400).json({
        message:
          "Невалиден payload. Изпрати `workHours` (масив) или `workHour` (един ден).",
      });
    }

    await dailySchedule.save();
    res.status(200).json(dailySchedule);
  } catch (e) {
    next(e);
  }
};


// --- DELETE /api/staff-schedules/:id ---
export const deleteSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;

    const currentSchedule = await StaffSchedule.findById(id);
    if (!currentSchedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    // Check authorization: allow if user is staff owner OR has business/manager role
    const isStaffOwner =
      currentSchedule.staff && currentSchedule.staff.toString() === userId;
    const hasAdminRole =
      req.user.role === "business" || req.user.role === "manager";

    if (!isStaffOwner && !hasAdminRole) {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    const schedule = await StaffSchedule.findByIdAndDelete(id);

    // Изтриване и на свързания дневен график
    await DailySchedule.findByIdAndDelete(schedule.dailySchedule);

    res.status(200).json({ message: "Графикът е изтрит успешно." });
  } catch (e) {
    next(e);
  }
};

// --- GET /api/staff-schedules/daily-view ---
export const getDailyView = async (req, res, next) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    const userId = req.user?.id || req.user?._id;

    if (!locationId || !startDate || !endDate) {
      return res.status(400).json({ message: "locationId, startDate и endDate са задължителни." });
    }

    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res.status(400).json({ message: "Потребителят не е свързан с бизнес." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Filter StaffSchedules for this location and business
    const schedules = await StaffSchedule.find({
      location: locationId,
      business: requestUser.businessId,
      startDate: { $lte: end },
      endDate: { $gte: start }
    })
    .populate("staff", "firstName lastName email")
    .populate("dailySchedule");

    // Grouping by staff
    const grouped = new Map();

    for (const schedule of schedules) {
      if (!schedule.dailySchedule || !schedule.dailySchedule.workHours) continue;

      const staffDoc = schedule.staff;
      const staffId = staffDoc?._id?.toString() || "not-assigned";

      if (!grouped.has(staffId)) {
        grouped.set(staffId, {
          staff: staffDoc || { _id: null, firstName: "Not", lastName: "Assigned", email: "" },
          location: locationId,
          schedules: []
        });
      }

      const filteredWorkHours = schedule.dailySchedule.workHours
        .filter(day => {
          const d = new Date(day.date);
          return d >= start && d <= end;
        })
        .map(day => ({
          ...day.toObject(),
          staffId: schedule.staff?._id || schedule.staff,
          scheduleId: schedule._id
        }));

      grouped.get(staffId).schedules.push({
        ...schedule.toObject(),
        dayleschedules: filteredWorkHours
      });
    }

    res.status(200).json(Array.from(grouped.values()));
  } catch (e) {
    next(e);
  }
};
