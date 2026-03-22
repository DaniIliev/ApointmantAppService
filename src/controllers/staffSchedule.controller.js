// staffScheduleController.js

import StaffSchedule from "../models/StaffSchedule.js";
import User from "../models/User.js";
import DailySchedule from "../models/DailySchedule.js";

// Помощна функция за създаване на дневен график по подразбиране
const createDefaultDailySchedule = async (
  startDate,
  endDate,
  workTime,
  isDayOff, // Очаква масив от стрингове с малки букви (e.g., ["saturday", "sunday"])
  break1,
  break2,
  break3
) => {
  const workHours = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const breaks = [];

  // Correctly format breaks to match the schema
  if (break1 && break1.start && break1.end) {
    breaks.push({ start: break1.start, end: break1.end });
  }
  if (break2 && break2.start && break2.end) {
    breaks.push({ start: break2.start, end: break2.end });
  }
  if (break3 && break3.start && break3.end) {
    breaks.push({ start: break3.start, end: break3.end });
  }

  // Обхожда всички дни в периода
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay(); // 0 for Sunday, 1 for Monday
    // Името на деня се превръща в малка буква за сравнение
    const dayName = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][dayOfWeek];

    // Проверява дали денят е включен в масива с почивни дни
    const isThisDayOff = isDayOff.includes(dayName);

    workHours.push({
      day: dayName,
      date: new Date(d),
      // isDayOff се запазва тук
      isDayOff: isThisDayOff,
      workTime: isThisDayOff
        ? null
        : { start: workTime.start, end: workTime.end },
      breaks: isThisDayOff ? [] : breaks,
    });
  }
  const dailySchedule = new DailySchedule({ workHours });
  return await dailySchedule.save();
};

// -------------------------------------------------------------------

// --- GET /api/staff-schedules ---
export const getSchedules = async (req, res, next) => {
  try {
    const { locationId, staffId } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const filter = {};
    
    // Always filter by the user's business
    const requestUser = await User.findById(userId);
    if (!requestUser || !requestUser.businessId) {
      return res.status(400).json({ message: "User is not associated with a business." });
    }
    filter.business = requestUser.businessId;
    
    // If user is a business owner, they might want to see all schedules for a location
    if (userRole === "business") {
      if (locationId) filter.location = locationId;
      if (staffId) filter.staff = (staffId === "null" || staffId === null) ? null : staffId;
    } else {
      // Staff members only see their own schedules
      filter.staff = userId;
      if (locationId) filter.location = locationId;
    }

    const schedules = await StaffSchedule.find(filter).sort({
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
    const userId = req.user.id;

    const schedule = await StaffSchedule.findById(id).populate("dailySchedule");
    if (!schedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }
    
    // Ownership check: must be the staff member OR the business owner
    // For now, let's allow if staff matches OR if it's a business owner (simplified)
    if (schedule.staff && schedule.staff.toString() !== userId && req.user.role !== "business") {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }
    
    // Връща workHours, които трябва да съдържат и isDayOff
    res.status(200).json(schedule.dailySchedule.workHours);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- POST /api/staff-schedules ---
export const createSchedule = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      startDate, 
      endDate, 
      workTime, 
      isDayOff, 
      break1, 
      break2, 
      break3,
      locationId,
      staffId // Optional
    } = req.body;

    if (!locationId) {
      return res.status(400).json({ message: "locationId е задължителен." });
    }

    const requestUser = await User.findById(userId);
    if (!requestUser || (requestUser.role !== "staff" && requestUser.role !== "business")) {
      return res.status(403).json({
        message: "Само служители и собственици на бизнес могат да управляват график.",
      });
    }

    if (!requestUser.businessId) {
      return res.status(400).json({ message: "Потребителят не е свързан с бизнес." });
    }

    // ✅ ФИКС: Логика за трансформация на isDayOff от обект в масив от стрингове (за DailySchedule)
    const daysOffObject =
      Array.isArray(isDayOff) && isDayOff.length > 0
        ? isDayOff[0]
        : isDayOff || {};

    // Трансформираме обекта в масив от стрингове (имена на почивните дни с малки букви)
    const daysOffArray = Object.keys(daysOffObject).filter(
      (day) => daysOffObject[day] === true
    );

    const dailyScheduleDoc = await createDefaultDailySchedule(
      startDate,
      endDate,
      workTime,
      daysOffArray,
      break1,
      break2,
      break3
    );

    const newSchedule = new StaffSchedule({
      startDate,
      endDate,
      workTime,
      isDayOff,
      break1,
      break2,
      break3,
      staff: staffId || (requestUser.role === "staff" ? userId : null),
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
    const userId = req.user.id;
    const userRole = req.user.role;
    const updateData = req.body;

    const currentSchedule = await StaffSchedule.findById(id);
    if (!currentSchedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    // Permission check: staff member themselves or business owner
    if (currentSchedule.staff && currentSchedule.staff.toString() !== userId && userRole !== "business") {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    // 2. Обновяване на StaffSchedule
    const updatedSchedule = await StaffSchedule.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    // 3. Актуализиране на DailySchedule, ако има промени в правилата
    const fieldsToTriggerDailyUpdate = [
      "startDate",
      "endDate",
      "workTime",
      "isDayOff",
      "break1",
      "break2",
      "break3",
    ];

    const shouldUpdateDailySchedule = fieldsToTriggerDailyUpdate.some((field) =>
      updateData.hasOwnProperty(field)
    );

    if (shouldUpdateDailySchedule) {
      const isDayOffNew = updateData.isDayOff || updatedSchedule.isDayOff;
      const daysOffObject =
        Array.isArray(isDayOffNew) && isDayOffNew.length > 0
          ? isDayOffNew[0]
          : isDayOffNew || {};
      const daysOffArray = Object.keys(daysOffObject).filter(
        (day) => daysOffObject[day] === true
      );

      await DailySchedule.findByIdAndDelete(currentSchedule.dailySchedule);

      const newDailyScheduleDoc = await createDefaultDailySchedule(
        updateData.startDate || updatedSchedule.startDate,
        updateData.endDate || updatedSchedule.endDate,
        updateData.workTime || updatedSchedule.workTime,
        daysOffArray,
        updateData.break1 || updatedSchedule.break1,
        updateData.break2 || updatedSchedule.break2,
        updateData.break3 || updatedSchedule.break3
      );

      await StaffSchedule.updateOne(
        { _id: updatedSchedule._id },
        { dailySchedule: newDailyScheduleDoc._id }
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
    const userId = req.user.id;
    const { workHours } = req.body;

    const schedule = await StaffSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    if (schedule.staff && schedule.staff.toString() !== userId && req.user.role !== "business") {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    const dailySchedule = await DailySchedule.findById(schedule.dailySchedule);
    if (!dailySchedule) {
      return res
        .status(404)
        .json({ message: "Детайлният график не е намерен." });
    }
    dailySchedule.workHours = workHours;
    await dailySchedule.save();
    res.status(200).json(dailySchedule);
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- POST /api/staff-schedules/apply-to-all ---
export const applyScheduleToAllStaff = async (req, res, next) => {
  try {
    const { scheduleId } = req.body;
    const userId = req.user.id;

    const mainSchedule = await StaffSchedule.findById(scheduleId);
    if (!mainSchedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    if (mainSchedule.staff && mainSchedule.staff.toString() !== userId && req.user.role !== "business") {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }

    const businessId = mainSchedule.business;
    const staffUsers = await User.find({
      businessId: businessId,
      role: { $in: ["business", "staff"] },
    });

    const dailySchedule = await DailySchedule.findById(
      mainSchedule.dailySchedule
    );
    if (!dailySchedule) {
      return res
        .status(404)
        .json({ message: "Детайлният график не е намерен." });
    }

    for (const staff of staffUsers) {
      // Пропускаме оригиналния потребител, който вече има графика
      if (mainSchedule.staff && staff._id.toString() === mainSchedule.staff.toString()) continue;

      const existingSchedule = await StaffSchedule.findOne({
        staff: staff._id,
        location: mainSchedule.location
      });

      if (existingSchedule) {
        const staffDailySchedule = await DailySchedule.findById(
          existingSchedule.dailySchedule
        );
        if (staffDailySchedule) {
          staffDailySchedule.workHours = dailySchedule.workHours;
          await staffDailySchedule.save();
        }
      } else {
        const newDailySchedule = new DailySchedule({
          workHours: dailySchedule.workHours,
        });
        await newDailySchedule.save();

        const newStaffSchedule = new StaffSchedule({
          startDate: mainSchedule.startDate,
          endDate: mainSchedule.endDate,
          workTime: mainSchedule.workTime,
          isDayOff: mainSchedule.isDayOff,
          break1: mainSchedule.break1,
          break2: mainSchedule.break2,
          break3: mainSchedule.break3,
          staff: staff._id,
          location: mainSchedule.location,
          business: businessId,
          dailySchedule: newDailySchedule._id,
        });
        await newStaffSchedule.save();
      }
    }

    res
      .status(200)
      .json({ message: "Графикът беше успешно приложен за всички служители." });
  } catch (e) {
    next(e);
  }
};

// -------------------------------------------------------------------

// --- DELETE /api/staff-schedules/:id ---
export const deleteSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const currentSchedule = await StaffSchedule.findById(id);
    if (!currentSchedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }

    if (currentSchedule.staff && currentSchedule.staff.toString() !== userId && req.user.role !== "business") {
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
