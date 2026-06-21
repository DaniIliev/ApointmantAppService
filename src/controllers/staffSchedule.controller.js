import StaffSchedule from "../models/StaffSchedule.js";
import User from "../models/User.js";
import DailySchedule from "../models/DailySchedule.js";
import mongoose from "mongoose";
import Location from "../models/Location.js";
import Appointment from "../models/Appointment.js";
import { sendAppointmentCancelledEmail } from "../utils/EmailService.js";

const isTimeValid = (timeStr) => {
  if (!timeStr) return false;
  return /^\d{2}:\d{2}/.test(timeStr);
};

const validateLocationHours = async (locationId, userWeeklyWorkingHours) => {
  const location = await Location.findById(locationId);
  if (!location) {
     return { isValid: false, message: "Location not found.", errorCode: "LOCATION_NOT_FOUND" };
  }

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  for (const day of days) {
    const userDay = userWeeklyWorkingHours?.[day];
    
    if (userDay && !userDay.isDayOff) {
      const uWorkTime = userDay.workTime;
      if (!uWorkTime || !isTimeValid(uWorkTime.start) || !isTimeValid(uWorkTime.end)) {
         return { isValid: false, message: `Invalid work hours format on ${day}.`, errorCode: "INVALID_WORK_HOURS" };
      }

      const locDay = location.weeklyWorkingHours?.[day];
      if (locDay?.isDayOff) {
        return { isValid: false, message: `Location is closed on ${day}. Cannot set schedule.`, errorCode: "LOCATION_CLOSED" };
      }
      
      if (!locDay || !locDay.workTime || !locDay.workTime.start || !locDay.workTime.end) {
         return { isValid: false, message: `Location has no work hours defined on ${day}.`, errorCode: "LOCATION_HOURS_NOT_SET" };
      }

      if (uWorkTime.start < locDay.workTime.start || uWorkTime.end > locDay.workTime.end) {
         return { isValid: false, message: `Schedule on ${day} (${uWorkTime.start}-${uWorkTime.end}) is outside location hours (${locDay.workTime.start}-${locDay.workTime.end}).`, errorCode: "OUTSIDE_LOCATION_HOURS" };
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
          return { isValid: false, message: `Conflict with another schedule for this staff member on ${day} (overlapping hours).`, errorCode: "SCHEDULE_CONFLICT" };
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
      return res.status(401).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Invalid authentication." 
      });
    }
    const filter = {};

    // Always filter by the user's business
    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res
        .json({ 
          errorCode: "BUSINESS_NOT_FOUND",
          message: "User is not linked to a business." 
        });
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
      return res.status(404).json({ 
        errorCode: "SCHEDULE_NOT_FOUND",
        message: "Schedule not found." 
      });
    }

    // Ownership check: must be the staff member OR the business owner
    // For now, let's allow if staff matches OR if it's a business owner (simplified)
    if (
      schedule.staff &&
      schedule.staff.toString() !== userId &&
      req.user.role !== "business"
    ) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have access to this schedule." 
      });
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
      return res.status(401).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Invalid authentication." 
      });
    }

    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res
        .json({ 
          errorCode: "BUSINESS_NOT_FOUND",
          message: "User is not linked to a business." 
        });
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
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "locationId is required." 
      });
    }

    const requestUser = await User.findById(userId);
    if (
      !requestUser ||
      !["staff", "business", "manager"].includes(requestUser.role)
    ) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Only staff and business owners can manage schedule.",
      });
    }

    if (!requestUser.businessId) {
      return res
        .json({ 
          errorCode: "BUSINESS_NOT_FOUND",
          message: "User is not linked to a business." 
        });
    }

    const targetStaffId = staffId || (requestUser.role === "staff" ? userId : null);

    // Валидация спрямо локацията
    const locValidation = await validateLocationHours(locationId, weeklyWorkingHours);
    if (!locValidation.isValid) return res.status(400).json({ 
      errorCode: locValidation.errorCode, 
      message: locValidation.message 
    });

    // Валидация за конфликти
    const conflictValidation = await validateScheduleConflicts(targetStaffId, startDate, endDate, weeklyWorkingHours);
    if (!conflictValidation.isValid) return res.status(400).json({ 
      errorCode: conflictValidation.errorCode, 
      message: conflictValidation.message 
    });

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
    res.status(201).json({
      message: "Schedule created successfully.",
      messageCode: "SCHEDULE_CREATED",
      data: newSchedule
    });
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
      return res.status(404).json({ 
        errorCode: "SCHEDULE_NOT_FOUND",
        message: "Schedule not found." 
      });
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
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have access to this schedule." 
      });
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
         return res.status(400).json({ 
           errorCode: locValidation.errorCode, 
           message: locValidation.message 
         });
      }

      // Валидация за конфликти
      const conflictValidation = await validateScheduleConflicts(updatedSchedule.staff, resolvedStartDate, resolvedEndDate, resolvedWeeklyWorkingHours, updatedSchedule._id);
      if (!conflictValidation.isValid) {
         await StaffSchedule.findByIdAndUpdate(id, currentSchedule.toObject());
         return res.status(400).json({ 
           errorCode: conflictValidation.errorCode, 
           message: conflictValidation.message 
         });
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

    res.status(200).json({
      message: "Schedule updated successfully.",
      messageCode: "SCHEDULE_UPDATED",
      data: updatedSchedule
    });
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
      return res.status(404).json({ 
        errorCode: "SCHEDULE_NOT_FOUND",
        message: "Schedule not found." 
      });
    }

    if (
      schedule.staff &&
      schedule.staff.toString() !== userId &&
      req.user.role !== "business"
    ) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have access to this schedule." 
      });
    }

    const dailySchedule = await DailySchedule.findById(schedule.dailySchedule);
    if (!dailySchedule) {
      return res
        .json({ 
          errorCode: "DAILY_SCHEDULE_NOT_FOUND",
          message: "Detailed schedule not found." 
        });
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
          .json({ 
            errorCode: "DAY_NOT_FOUND",
            message: "Day for edit not found." 
          });
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
      if (!locValidation.isValid) return res.status(400).json({ 
        errorCode: locValidation.errorCode, 
        message: locValidation.message 
      });

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
      if (!conflictValidation.isValid) return res.status(400).json({ 
        errorCode: conflictValidation.errorCode, 
        message: conflictValidation.message 
      });
      // ────────────────────────────────────────────────────

      const oldDay = dailySchedule.workHours[index];
      let changesText = [];
      if (oldDay.isDayOff !== workHour.isDayOff) {
        changesText.push(`Day Off: ${oldDay.isDayOff} -> ${workHour.isDayOff}`);
      }
      if (
        workHour.workTime &&
        (oldDay.workTime?.start !== workHour.workTime?.start ||
          oldDay.workTime?.end !== workHour.workTime?.end)
      ) {
        changesText.push(
          `Work time: ${oldDay.workTime?.start || "N/A"}-${
            oldDay.workTime?.end || "N/A"
          } -> ${workHour.workTime?.start || "N/A"}-${
            workHour.workTime?.end || "N/A"
          }`,
        );
      }
      if (workHour.breaks !== undefined) {
        const oldBreaks = oldDay.breaks || [];
        const newBreaks = workHour.breaks || [];
        const formatBreaks = (brks) => brks.length > 0 ? brks.map(b => `${b.start || "N/A"}-${b.end || "N/A"}`).join(", ") : "None";
        if (JSON.stringify(oldBreaks) !== JSON.stringify(newBreaks)) {
           changesText.push(`Breaks: ${formatBreaks(oldBreaks)} -> ${formatBreaks(newBreaks)}`);
        }
      }
      if (changesText.length === 0) changesText.push("Updated hours details");

      const requestUser = await User.findById(userId);
      const userName = requestUser?.firstName
        ? `${requestUser.firstName} ${requestUser.lastName || ''}`.trim()
        : requestUser?.email || "Unknown User";

      const newHistoryEntry = {
        updatedAt: new Date(),
        updatedBy: userName,
        changes: changesText.join(" | "),
      };

      if (!oldDay.history) oldDay.history = [];
      oldDay.history.push(newHistoryEntry);
      
      oldDay.isDayOff = workHour.isDayOff !== undefined ? workHour.isDayOff : oldDay.isDayOff;
      oldDay.workTime = workHour.workTime || oldDay.workTime;
      oldDay.breaks = workHour.breaks || oldDay.breaks;
      if (workHour.date) oldDay.date = new Date(workHour.date);
      oldDay.lastUpdated = new Date();
    } else {
      return res.status(400).json({
        errorCode: "INVALID_PAYLOAD",
        message: "Invalid payload. Send `workHours` (array) or `workHour` (single day)."
      });
    }

    await dailySchedule.save();
    res.status(200).json({
      message: "Daily schedule updated successfully.",
      messageCode: "DAILY_SCHEDULE_UPDATED",
      data: dailySchedule
    });
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
      return res.status(404).json({ 
        errorCode: "SCHEDULE_NOT_FOUND",
        message: "Schedule not found." 
      });
    }

    // Check authorization: allow if user is staff owner OR has business/manager role
    const isStaffOwner =
      currentSchedule.staff && currentSchedule.staff.toString() === userId;
    const hasAdminRole =
      req.user.role === "business" || req.user.role === "manager";

    if (!isStaffOwner && !hasAdminRole) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have access to this schedule." 
      });
    }

    const schedule = await StaffSchedule.findByIdAndDelete(id);

    // Изтриване и на свързания дневен график
    await DailySchedule.findByIdAndDelete(schedule.dailySchedule);

    res.status(200).json({ 
      message: "Schedule deleted successfully.",
      messageCode: "SCHEDULE_DELETED"
    });
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
      return res.status(400).json({ 
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "locationId, startDate, and endDate are required." 
      });
    }

    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res.status(400).json({ 
        errorCode: "BUSINESS_NOT_FOUND",
        message: "User is not linked to a business." 
      });
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

// --- GET /api/staff-schedules/affected-appointments ---
export const getAffectedAppointments = async (req, res, next) => {
  try {
    let { staffId, scheduleId, date } = req.query;
    
    if (!staffId && scheduleId) {
      const schedule = await StaffSchedule.findById(scheduleId);
      if (schedule) staffId = schedule.staff?.toString();
    }

    if (!staffId || !date) {
      return res.status(400).json({ errorCode: "MISSING_REQUIRED_FIELDS", message: "staffId (or scheduleId) and date are required" });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await Appointment.find({
      staff: staffId,
      status: { $in: ["pending", "confirmed"] },
      "appointmentTime.start": { $gte: startOfDay, $lte: endOfDay }
    }).select("clientName clientPhone email appointmentTime title status");

    res.status(200).json(appointments);
  } catch (e) {
    next(e);
  }
};

// --- POST /api/staff-schedules/notify-day-off ---
export const notifyDayOff = async (req, res, next) => {
  try {
    const { appointmentIds, customMessage } = req.body;

    if (!appointmentIds || !Array.isArray(appointmentIds)) {
      return res.status(400).json({ errorCode: "INVALID_PAYLOAD", message: "appointmentIds array is required" });
    }

    const appointments = await Appointment.find({ _id: { $in: appointmentIds } })
      .populate("business", "name")
      .populate("service", "name");

    for (const appt of appointments) {
      if (appt.email) {
        const businessName = appt.business?.name || "Business";
        const serviceName = appt.service?.name || appt.title || "Service";
        const dashboardLink = process.env.CLIENT_URL || "http://localhost:3000";

        await sendAppointmentCancelledEmail(
          appt.email,
          appt.clientName || "Client",
          serviceName,
          appt.appointmentTime.start,
          appt.appointmentTime.end,
          businessName,
          dashboardLink,
          "bg",
          customMessage
        );
      }
      
      // Optionally update status to cancelled
      appt.status = "cancelled";
      await appt.save();
    }

    res.status(200).json({ message: "Clients notified and appointments cancelled." });
  } catch (e) {
    next(e);
  }
};
