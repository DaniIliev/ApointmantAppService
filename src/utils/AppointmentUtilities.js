import moment from "moment-timezone";
const APP_TIMEZONE = "Europe/Sofia";
import StaffSchedule from "../models/StaffSchedule.js";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";

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

export const getAvailableSlots = async (staffId, date, serviceDuration, locationId, serviceId = null) => {
  try {
    const requestedDate = moment.tz(date, ["YYYY-MM-DD", moment.ISO_8601], APP_TIMEZONE).startOf("day");
    if (!requestedDate.isValid()) return { slots: [], message: t("Невалидна дата.") };
    if (!Number.isFinite(serviceDuration) || serviceDuration <= 0) return { slots: [], message: t("Невалидна продължителност.") };

    const startOfRequestedDay = requestedDate.clone().startOf("day").toDate();
    const endOfRequestedDay = requestedDate.clone().endOf("day").toDate();

    // 1. Fetch StaffSchedule with populated DailySchedule in one go
    const query = { 
      staff: staffId,
      startDate: { $lte: endOfRequestedDay },
      endDate: { $gte: startOfRequestedDay }
    };
    if (locationId) query.location = locationId;

    let staffSchedule = await StaffSchedule.findOne(query).populate("dailySchedule");

    // Fallback if no specific staff schedule
    if (!staffSchedule && locationId) {
      staffSchedule = await StaffSchedule.findOne({ 
        location: locationId, 
        staff: null,
        startDate: { $lte: endOfRequestedDay },
        endDate: { $gte: startOfRequestedDay }
      }).populate("dailySchedule");
    }

    if (!staffSchedule?.dailySchedule) {
      return { slots: [], message: "Няма създаден график за избраната дата." };
    }

    // 2. Extract specific day data
    const dailyWorkHours = staffSchedule.dailySchedule.workHours.find((wh) =>
      moment.tz(wh.date, APP_TIMEZONE).isSame(requestedDate, "day")
    );

    if (!dailyWorkHours || dailyWorkHours.isDayOff || !dailyWorkHours.workTime?.start || !dailyWorkHours.workTime?.end) {
      return { slots: [], message: "Служителят не работи на тази дата." };
    }

    const baseDate = moment.tz(dailyWorkHours.date, APP_TIMEZONE).format("YYYY-MM-DD");
    const workStart = moment.tz(`${baseDate}T${dailyWorkHours.workTime.start}`, "YYYY-MM-DDTHH:mm", APP_TIMEZONE);
    const workEnd = moment.tz(`${baseDate}T${dailyWorkHours.workTime.end}`, "YYYY-MM-DDTHH:mm", APP_TIMEZONE);

    // 3. Determine Slot Step
    const staffServices = await Service.find({ staffMembers: staffId });
    const minSrvDur = staffServices.length > 0 ? Math.min(...staffServices.map(s => s.duration)) : serviceDuration;
    const slotStep = Math.min(serviceDuration, minSrvDur) || 15;

    // 4. Collect Busy Intervals
    const busyIntervals = (dailyWorkHours.breaks || [])
      .filter(b => b.start && b.end)
      .map(b => ({
        start: moment.tz(`${baseDate}T${b.start}`, "YYYY-MM-DDTHH:mm", APP_TIMEZONE),
        end: moment.tz(`${baseDate}T${b.end}`, "YYYY-MM-DDTHH:mm", APP_TIMEZONE),
      }));

    const booked = await Appointment.find({
      staff: staffId,
      "appointmentTime.start": { $gte: startOfRequestedDay, $lt: endOfRequestedDay },
      status: { $ne: "cancelled" }
    }).sort({ "appointmentTime.start": 1 });

    const requestedService = serviceId ? await Service.findById(serviceId) : null;
    if (requestedService?.isGroup) {
      // Group logic
      const otherServices = booked.filter(a => String(a.service) !== String(serviceId));
      otherServices.forEach(a => busyIntervals.push({
        start: moment(a.appointmentTime.start).tz(APP_TIMEZONE),
        end: moment(a.appointmentTime.end).tz(APP_TIMEZONE),
      }));

      const sameService = booked.filter(a => String(a.service) === String(serviceId));
      const counts = sameService.reduce((acc, a) => {
        const time = moment(a.appointmentTime.start).tz(APP_TIMEZONE).format("HH:mm");
        acc[time] = (acc[time] || 0) + 1;
        return acc;
      }, {});

      for (const t in counts) {
        if (counts[t] >= requestedService.capacity) {
          const match = sameService.find(a => moment(a.appointmentTime.start).tz(APP_TIMEZONE).format("HH:mm") === t);
          busyIntervals.push({
            start: moment(match.appointmentTime.start).tz(APP_TIMEZONE),
            end: moment(match.appointmentTime.end).tz(APP_TIMEZONE),
          });
        }
      }
    } else {
      booked.forEach(a => busyIntervals.push({
        start: moment(a.appointmentTime.start).tz(APP_TIMEZONE),
        end: moment(a.appointmentTime.end).tz(APP_TIMEZONE),
      }));
    }

    // 5. Generate Slots
    const availableSlots = generateSlotsFromFreeTime(
      workStart, 
      workEnd, 
      mergeIntervals(busyIntervals), 
      serviceDuration, 
      slotStep
    );

    return { slots: availableSlots, message: "Намерени свободни часове." };
  } catch (error) {
    console.error("getAvailableSlots error:", error);
    return { slots: [], message: "Грешка при извличане на свободни часове." };
  }
};
