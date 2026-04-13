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

export const getAvailableSlots = async (staffId, date, serviceDuration, locationId, serviceId = null) => {
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
    const query = { staff: staffId };
    if (locationId) {
      query.location = locationId;
    }
    
    let staffSchedule = await StaffSchedule.findOne(query);
    
    // Fallback: If no staff-specific schedule, check for a location-level schedule (staff: null)
    if (!staffSchedule && locationId) {
      staffSchedule = await StaffSchedule.findOne({ location: locationId, staff: null });
    }

    if (!staffSchedule) {
      return {
        slots: [],
        message: "Няма създаден основен график за този служител за избраната локация.",
      };
    }

    const startOfDay = requestedDate.clone().startOf("day").toDate();
    const endOfDay = requestedDate.clone().endOf("day").toDate();

    const dailySchedule = await DailySchedule.findById(staffSchedule.dailySchedule);

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

    // Get requested service details for group logic
    const requestedService = serviceId ? await Service.findById(serviceId) : null;
    const isGroup = requestedService?.isGroup || false;
    const capacity = requestedService?.capacity || 1;
    const baseDate = moment.tz(dailyWorkHours.date, APP_TIMEZONE).format("YYYY-MM-DD");

    const staffServices = await Service.find({
      staffMembers: staffId,
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

    if (!dailyWorkHours.workTime || !dailyWorkHours.workTime.start || !dailyWorkHours.workTime.end) {
        return { slots: [], message: "Невалидно работно време за избраната дата." };
    }


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

    if (!isGroup) {
      // Standard logic: any appointment makes the slot busy
      for (const appt of bookedAppointments) {
        busyIntervals.push({
          start: moment(appt.appointmentTime.start).tz(APP_TIMEZONE),
          end: moment(appt.appointmentTime.end).tz(APP_TIMEZONE),
        });
      }
    } else {
      // Group service logic:
      // 1. Appointments for DIFFERENT services always make the staff busy
      const otherServiceAppointments = bookedAppointments.filter(
        (appt) => String(appt.service) !== String(serviceId)
      );
      for (const appt of otherServiceAppointments) {
        busyIntervals.push({
          start: moment(appt.appointmentTime.start).tz(APP_TIMEZONE),
          end: moment(appt.appointmentTime.end).tz(APP_TIMEZONE),
        });
      }

      // 2. For the SAME group service, check if capacity is reached at each slot
      const sameServiceAppointments = bookedAppointments.filter(
        (appt) => String(appt.service) === String(serviceId)
      );

      // Group appointments by their start time
      const appointmentsByStart = sameServiceAppointments.reduce((acc, appt) => {
        const startTime = moment(appt.appointmentTime.start)
          .tz(APP_TIMEZONE)
          .format("HH:mm");
        if (!acc[startTime]) acc[startTime] = [];
        acc[startTime].push(appt);
        return acc;
      }, {});

      for (const startTime in appointmentsByStart) {
        if (appointmentsByStart[startTime].length >= capacity) {
          // If capacity is reached, mark this specific slot as busy
          const appt = appointmentsByStart[startTime][0];
          busyIntervals.push({
            start: moment(appt.appointmentTime.start).tz(APP_TIMEZONE),
            end: moment(appt.appointmentTime.end).tz(APP_TIMEZONE),
          });
        }
      }
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
