// staffScheduleController.js

import StaffSchedule from "../models/StaffSchedule.js";
import User from "../models/User.js";
import DailySchedule from "../models/DailySchedule.js";

// Помощна функция за създаване на дневен график по подразбиране
const createDefaultDailySchedule = async (
  startDate,
  endDate,
  workTime,
  isDayOff,
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

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay(); // 0 for Sunday, 1 for Monday
    const dayName = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][dayOfWeek];
    const isThisDayOff = isDayOff.includes(dayName);

    workHours.push({
      day: dayName,
      date: new Date(d),
      isDayOff: isThisDayOff,
      // **FIXED:** Use a single 'workTime' object to match the schema.
      workTime: isThisDayOff
        ? null
        : { start: workTime.start, end: workTime.end },
      breaks: isThisDayOff ? [] : breaks,
    });
  }
  const dailySchedule = new DailySchedule({ workHours });
  return await dailySchedule.save();
};

// GET /api/staff-schedules
export const getSchedules = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const schedules = await StaffSchedule.find({ staff: userId }).sort({
      startDate: -1,
    });
    res.status(200).json(schedules);
  } catch (e) {
    next(e);
  }
};

// GET /api/staff-schedules/:id/details
export const getDailySchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const schedule = await StaffSchedule.findById(id).populate("dailySchedule");
    if (!schedule) {
      return res.status(404).json({ message: "Графикът не е намерен." });
    }
    // Проверка дали графикът принадлежи на текущия потребител
    if (schedule.staff.toString() !== userId) {
      return res.status(403).json({ message: "Нямаш достъп до този график." });
    }
    res.status(200).json(schedule.dailySchedule.workHours);
  } catch (e) {
    next(e);
  }
};

// POST /api/staff-schedules
export const createSchedule = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, workTime, isDayOff, break1, break2, break3 } =
      req.body;

    const staffUser = await User.findById(userId);
    // Проверка дали потребителят е служител или собственик на бизнес
    if (
      !staffUser ||
      (staffUser.role !== "staff" && staffUser.role !== "business")
    ) {
      return res.status(403).json({
        message:
          "Само служители и собственици на бизнес могат да управляват график.",
      });
    }
    if (!staffUser.businessId) {
      return res
        .status(400)
        .json({ message: "Служителят не е свързан с бизнес." });
    }

    // Уверете се, че isDayOff е винаги масив
    const daysOffArray = Array.isArray(isDayOff)
      ? isDayOff
      : isDayOff
      ? [isDayOff]
      : [];

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
      staff: userId,
      business: staffUser.businessId,
      dailySchedule: dailyScheduleDoc._id,
    });
    await newSchedule.save();
    res.status(201).json(newSchedule);
  } catch (e) {
    next(e);
  }
};

// PUT /api/staff-schedules/:id
export const updateSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updatedSchedule = await StaffSchedule.findOneAndUpdate(
      { _id: id, staff: userId },
      req.body,
      { new: true }
    );
    if (!updatedSchedule) {
      return res
        .status(404)
        .json({ message: "Графикът не е намерен или нямаш достъп." });
    }
    res.status(200).json(updatedSchedule);
  } catch (e) {
    next(e);
  }
};

// PUT /api/staff-schedules/:id/details
export const updateDailySchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { workHours, isApplyToAll } = req.body;

    const schedule = await StaffSchedule.findById(id);
    if (!schedule || schedule.staff.toString() !== userId) {
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

export const applyScheduleToAllStaff = async (req, res, next) => {
  try {
    const { scheduleId } = req.body;
    const userId = req.user.id;

    const mainSchedule = await StaffSchedule.findById(scheduleId);
    if (!mainSchedule || mainSchedule.staff.toString() !== userId) {
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
      const existingSchedule = await StaffSchedule.findOne({
        staff: staff._id,
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

// DELETE /api/staff-schedules/:id
export const deleteSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const schedule = await StaffSchedule.findOneAndDelete({
      _id: id,
      staff: userId,
    });
    if (!schedule) {
      return res
        .status(404)
        .json({ message: "Графикът не е намерен или нямаш достъп." });
    }

    // Изтриване и на свързания дневен график
    await DailySchedule.findByIdAndDelete(schedule.dailySchedule);

    res.status(200).json({ message: "Графикът е изтрит успешно." });
  } catch (e) {
    next(e);
  }
};
