import moment from "moment-timezone";
const APP_TIMEZONE = "Europe/Sofia";
import StaffSchedule from "../models/StaffSchedule.js";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import DailySchedule from "../models/DailySchedule.js";

const mergeIntervals = (intervals) => {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a.start.diff(b.start));

  const merged = [];
  let currentMerged = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const nextInterval = intervals[i];
    if (nextInterval.start.isSameOrBefore(currentMerged.end.clone().add(1, "minute"))) {
      currentMerged.end = moment.max(currentMerged.end, nextInterval.end);
    } else {
      merged.push(currentMerged);
      currentMerged = nextInterval;
    }
  }
  merged.push(currentMerged);
  return merged;
};

const generateSlotsFromFreeTime = (workStart, workEnd, mergedIntervals, serviceDuration, slotStep) => {
  const availableSlots = [];
  let freeTimeStart = moment(workStart);

  // Iterate through busy intervals to find free time slots before them
  for (const busy of mergedIntervals) {
    if (freeTimeStart.isBefore(busy.start)) {
      let tempTime = moment(freeTimeStart);
      while (tempTime.isSameOrBefore(busy.start.clone().subtract(serviceDuration, "minutes"))) {
        availableSlots.push({
          startTime: tempTime.format("HH:mm"),
          endTime: tempTime.clone().add(serviceDuration, "minutes").format("HH:mm"),
        });
        tempTime.add(slotStep, "minutes");
      }
    }
    freeTimeStart = moment.max(freeTimeStart, busy.end);
  }

  // Add slots after the last busy interval until work ends
  let tempTime = moment(freeTimeStart);
  while (tempTime.isSameOrBefore(workEnd.clone().subtract(serviceDuration, "minutes"))) {
    availableSlots.push({
      startTime: tempTime.format("HH:mm"),
      endTime: tempTime.clone().add(serviceDuration, "minutes").format("HH:mm"),
    });
    tempTime.add(slotStep, "minutes");
  }

  return availableSlots;
};

export const getAvailableSlots = async (staffId, date, serviceDuration) => {
  try {
    // Parse date strictly in app timezone; accept bare YYYY-MM-DD or ISO and anchor to the provided day.
    const requestedDate = moment
      .tz(date, ["YYYY-MM-DD", moment.ISO_8601], APP_TIMEZONE)
      .startOf("day");

    if (!requestedDate.isValid()) {
      return { slots: [], message: "Невалидна дата." };
    }

    // Validate duration to avoid infinite loops / timeouts
    if (!Number.isFinite(serviceDuration) || serviceDuration <= 0) {
      return { slots: [], message: "Невалидна продължителност на услугата." };
    }

    // Първо, намираме StaffSchedule за служителя
    const staffSchedule = await StaffSchedule.findOne({ staff: staffId });
    if (!staffSchedule) {
      return {
        slots: [],
        message: "Няма създаден основен график за този служител.",
      };
    }

    const startOfDay = requestedDate.clone().startOf("day").toDate();
    const endOfDay = requestedDate.clone().endOf("day").toDate();

    const dailySchedule = await DailySchedule.findOne({
      "workHours.date": { $gte: startOfDay, $lte: endOfDay },
    });

    if (!dailySchedule) {
      return { slots: [], message: "Няма работен график за избраната дата." };
    }

    // Ensure dailyWorkHours date is compared in app timezone (not server/UTC time)
    const dailyWorkHours = dailySchedule.workHours.find((wh) =>
      moment.tz(wh.date, APP_TIMEZONE).isSame(requestedDate, "day")
    );

    if (!dailyWorkHours || dailyWorkHours.isDayOff) {
      return { slots: [], message: "Служителят не работи на тази дата." };
    }

    const staffServices = await Service.find({
      "staffs._id": staffId,
    });

    if (!staffServices || staffServices.length === 0) {
      return { slots: [], message: "Служителят не предлага услуги." };
    }
    const minServiceDuration = staffServices.reduce(
      (min, service) => Math.min(min, service.duration),
      Infinity
    );
    // **ВАЖНО:** Проверяваме дали избраната услуга е най-кратката, ако не, използваме нейната продължителност за стъпката
    const stepCandidate = Math.min(serviceDuration, minServiceDuration);
    const slotStep =
      Number.isFinite(stepCandidate) && stepCandidate > 0
        ? stepCandidate
        : serviceDuration;

    const bookedAppointments = await Appointment.find({
      staff: staffId,
      "appointmentTime.start": {
        $gte: startOfDay,
        $lt: endOfDay,
      },
      status: { $ne: "cancelled" }, // Exclude cancelled appointments
    }).sort({ "appointmentTime.start": 1 });
    // Parse times in app timezone to ensure consistency; use fixed date in Sofia time
    const baseDate = moment
      .tz(dailyWorkHours.date, APP_TIMEZONE)
      .format("YYYY-MM-DD");
    const workStart = moment.tz(
      `${baseDate}T${dailyWorkHours.workTime.start}`,
      "YYYY-MM-DDTHH:mm",
      APP_TIMEZONE
    );
    const workEnd = moment.tz(
      `${baseDate}T${dailyWorkHours.workTime.end}`,
      "YYYY-MM-DDTHH:mm",
      APP_TIMEZONE
    );

    let availableSlots = [];
    let currentTime = moment(workStart);
    let apptIndex = 0;

    // Списък на всички заети интервали (запазени часове и почивки)
    const busyIntervals = [];

    // Добавяме запазените часове
    // IMPORTANT: Convert DB dates (UTC) to app timezone
    for (const appt of bookedAppointments) {
      busyIntervals.push({
        start: moment(appt.appointmentTime.start).tz(APP_TIMEZONE),
        end: moment(appt.appointmentTime.end).tz(APP_TIMEZONE),
      });
    }

    // Добавяме почивките (use baseDate to avoid timezone drift)
    for (const breakTime of dailyWorkHours.breaks) {
      busyIntervals.push({
        start: moment.tz(
          `${baseDate}T${breakTime.start}`,
          "YYYY-MM-DDTHH:mm",
          APP_TIMEZONE
        ),
        end: moment.tz(
          `${baseDate}T${breakTime.end}`,
          "YYYY-MM-DDTHH:mm",
          APP_TIMEZONE
        ),
      });
    }

    const mergedIntervals = mergeIntervals(busyIntervals);
    
    availableSlots = generateSlotsFromFreeTime(
      workStart, 
      workEnd, 
      mergedIntervals, 
      serviceDuration, 
      slotStep
    );

    return { slots: availableSlots, message: "Намерени свободни часове." };
  } catch (error) {
    console.error(error);
    return { slots: [], message: "Грешка при извличане на свободни часове." };
  }
};
