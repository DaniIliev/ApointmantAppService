// utils/AppointmentUtilities.js

import moment from "moment";
import StaffSchedule from "../models/StaffSchedule.js";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import DailySchedule from "../models/DailySchedule.js";

export const getAvailableSlots = async (staffId, date, serviceDuration) => {
  try {
    // Use local time to avoid timezone shifts between environments
    const requestedDate = moment(date).startOf("day");

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
    // След това, намираме DailySchedule, свързан с датата
    // console.log("requestedDate", requestedDate);
    // const dailySchedule = await DailySchedule.findOne({
    //   "workHours.date": requestedDate.toDate(),
    // });
    const startOfDay = requestedDate.clone().startOf("day").toDate();
    const endOfDay = requestedDate.clone().endOf("day").toDate();

    const dailySchedule = await DailySchedule.findOne({
      "workHours.date": { $gte: startOfDay, $lte: endOfDay },
    });

    if (!dailySchedule) {
      return { slots: [], message: "Няма работен график за избраната дата." };
    }

    const dailyWorkHours = dailySchedule.workHours.find((wh) =>
      moment(wh.date).isSame(requestedDate, "day")
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
    const slotStep = Number.isFinite(stepCandidate) && stepCandidate > 0 ? stepCandidate : serviceDuration;

    const bookedAppointments = await Appointment.find({
      staff: staffId,
      "appointmentTime.start": {
        $gte: startOfDay,
        $lt: endOfDay,
      },
      status: { $ne: "cancelled" }, // Exclude cancelled appointments
    }).sort({ "appointmentTime.start": 1 });

    const workStart = moment(
      `${moment(dailyWorkHours.date).format("YYYY-MM-DD")}T${
        dailyWorkHours.workTime.start
      }`
    );
    const workEnd = moment(
      `${moment(dailyWorkHours.date).format("YYYY-MM-DD")}T${
        dailyWorkHours.workTime.end
      }`
    );

    let availableSlots = [];
    let currentTime = moment(workStart);
    let apptIndex = 0;

    // Списък на всички заети интервали (запазени часове и почивки)
    const busyIntervals = [];

    // Добавяме запазените часове
    for (const appt of bookedAppointments) {
      busyIntervals.push({
        start: moment(appt.appointmentTime.start),
        end: moment(appt.appointmentTime.end),
      });
    }

    // Добавяме почивките
    for (const breakTime of dailyWorkHours.breaks) {
      busyIntervals.push({
        start: moment(
          `${moment(dailyWorkHours.date).format("YYYY-MM-DD")}T${
            breakTime.start
          }`
        ),
        end: moment(
          `${moment(dailyWorkHours.date).format("YYYY-MM-DD")}T${breakTime.end}`
        ),
      });
    }

    // Сортираме интервалите по начален час
    busyIntervals.sort((a, b) => a.start.diff(b.start));

    // Обединяваме припокриващи се или съседни интервали
    const mergedIntervals = [];
    if (busyIntervals.length > 0) {
      let currentMerged = busyIntervals[0];
      for (let i = 1; i < busyIntervals.length; i++) {
        const nextInterval = busyIntervals[i];
        // Проверяваме дали следващият интервал се припокрива или е съседен (в рамките на 1 минута)
        if (
          nextInterval.start.isSameOrBefore(
            currentMerged.end.clone().add(1, "minute")
          )
        ) {
          currentMerged.end = moment.max(currentMerged.end, nextInterval.end);
        } else {
          mergedIntervals.push(currentMerged);
          currentMerged = nextInterval;
        }
      }
      mergedIntervals.push(currentMerged);
    }

    // Генерираме свободните часове на базата на обединените интервали
    let freeTimeStart = moment(workStart);
    let slotEnd;
    console.log("merged intervals", mergedIntervals);
    for (const busy of mergedIntervals) {
      if (freeTimeStart.isBefore(busy.start)) {
        // Имаме свободен интервал между freeTimeStart и busy.start
        let tempTime = moment(freeTimeStart);
        while (
          tempTime.isSameOrBefore(
            busy.start.clone().subtract(serviceDuration, "minutes")
          )
        ) {
          availableSlots.push({
            startTime: tempTime.format("HH:mm"),
            endTime: tempTime
              .clone()
              .add(serviceDuration, "minutes")
              .format("HH:mm"),
          });
          tempTime.add(slotStep, "minutes");
        }
      }
      freeTimeStart = moment.max(freeTimeStart, busy.end);
    }

    // Добавяме свободните часове след последния зает интервал
    let tempTime = moment(freeTimeStart);
    while (
      tempTime.isSameOrBefore(
        workEnd.clone().subtract(serviceDuration, "minutes")
      )
    ) {
      availableSlots.push({
        startTime: tempTime.format("HH:mm"),
        endTime: tempTime
          .clone()
          .add(serviceDuration, "minutes")
          .format("HH:mm"),
      });
      tempTime.add(slotStep, "minutes");
    }

    return { slots: availableSlots, message: "Намерени свободни часове." };
  } catch (error) {
    console.error(error);
    return { slots: [], message: "Грешка при извличане на свободни часове." };
  }
};
