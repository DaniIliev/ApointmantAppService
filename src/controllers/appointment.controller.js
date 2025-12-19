import Appointment from "../models/Appointment.js";
import Business from "../models/Business.js";
import Service from "../models/Service.js";
import Alert from "../models/Alert.js";
import { sendConfirmationEmail } from "../utils/EmailService.js";
import { getAvailableSlots } from "../utils/AppointmentUtilities.js";
import moment from "moment";
import { io } from "../index.js";

export const getDashboardData = async (req, res) => {
  try {
    let appointments;
    const userId = req.user.id;
    const userRole = req.user.role;
    if (userRole === "personal") {
      appointments = await Appointment.find({ client: userId }).populate(
        "business service"
      );
    } else if (userRole === "business") {
      const business = await Business.findOne({ owner: userId });
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      appointments = await Appointment.find({
        business: business._id,
      }).populate("service client");
    } else if (userRole === "staff") {
      appointments = await Appointment.find({ staff: userId }).populate(
        "business service client"
      );
    } else {
      return res.status(403).json({ message: "Invalid user role" });
    }

    const transformedAppointments = appointments.map((appointment) => {
      return {
        _id: appointment._id,
        businessId: appointment.business._id,
        serviceName: appointment.service.name,
        servicePrice: appointment.service.price,
        serviceDuration: appointment.service.duration,
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone,
        email: appointment.email,
        appointmentTime: {
          start: appointment.appointmentTime.start,
          end: appointment.appointmentTime.end,
        },
        status: appointment.status,
        service_id: appointment.service._id,
        staff_id: appointment.staff,
        staff: {
          _id: appointment.staff,
        },
      };
    });
    transformedAppointments.sort((a, b) => {
      const startTimeA = new Date(a.appointmentTime.start).getTime();
      const startTimeB = new Date(b.appointmentTime.start).getTime();
      return startTimeA - startTimeB;
    });

    res.json(transformedAppointments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

export const createAppointment = async (req, res, next) => {
  try {
    const {
      business,
      service,
      dateTime,
      clientName,
      clientPhone,
      email,
      staff,
    } = req.body;
    const biz = await Business.findById(business);
    if (!biz) return res.status(404).json({ message: "Бизнес не е намерен" });

    const srv = await Service.findById(service);
    if (!srv || String(srv.business) !== String(biz._id)) {
      return res
        .status(400)
        .json({ message: "Невалидна услуга за този бизнес" });
    }

    if (!srv.staffs.filter((s) => s._id == staff)) {
      return res.status(400).json({
        message: "Избраният служител не може да извърши тази услуга.",
      });
    }

    const availability = await getAvailableSlots(staff, dateTime, srv.duration);
    const requestedSlot = moment(dateTime).format("HH:mm");
    const isSlotAvailable = availability.slots.some(
      (slot) => slot.startTime === requestedSlot
    );

    if (!isSlotAvailable) {
      return res
        .status(400)
        .json({ message: "Избраният час е зает или невалиден." });
    }

    // ПРОМЯНА: Изчисляваме началния и крайния час като Date обекти
    const startDateTime = moment(dateTime).toDate();
    const endDateTime = moment(dateTime).add(srv.duration, "minutes").toDate();

    const appointment = await Appointment.create({
      business,
      service,
      appointmentTime: {
        start: startDateTime,
        end: endDateTime,
      },
      client: req.user?.id ?? undefined,
      clientName,
      clientPhone,
      email,
      staff,
    });

    const newAlert = await Alert.create({
      staff: staff,
      businessId: business,
      appointment: appointment._id,
      message: `Нова заявка от ${clientName} за услуга "${srv.name}"`,
      type: "appointment",
    });

    io.to(staff).emit("newAppointment", {
      appointment: {
        _id: appointment._id,
        clientName: appointment.clientName,
        serviceName: srv.name,
        appointmentTime: {
          start: appointment.appointmentTime.start,
          end: appointment.appointmentTime.end,
        },
      },
      message: "Имате нова заявка за записване на час.",
      _id: newAlert._id,
    });

    res.status(201).json(appointment);
  } catch (e) {
    next(e);
  }
};

export const listBusinessAppointments = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const biz = await Business.findById(businessId);
    if (!biz) return res.status(404).json({ message: "Business не е намерен" });
    if (String(biz.owner) !== req.user.id)
      return res.status(403).json({ message: "Не сте собственик" });

    const items = await Appointment.find({ business: businessId })
      .populate("service", "name durationMinutes price")
      .populate("client", "email role")
      .sort({ appointmentTime: 1 })
      .lean();

    res.json(items);
  } catch (e) {
    next(e);
  }
};

export const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const appt = await Appointment.findById(id).populate("business service");
    if (!appt)
      return res.status(404).json({ message: "Appointment не е намерен" });

    if (String(appt.business.owner) !== req.user.id) {
      return res.status(403).json({ message: "Не сте собственик" });
    }

    appt.status = status;
    await appt.save();
    if (status === "confirmed" && appt.email) {
      await sendConfirmationEmail(
        appt.email,
        appt.clientName,
        appt.service.name,
        appt.appointmentTime.start,
        appt.appointmentTime.end,
        appt.business.name
      );
    }
    res.json(appt);
  } catch (e) {
    next(e);
  }
};

export const updateAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      dateTime,
      clientName,
      clientPhone,
      email,
      staff,
      service: serviceId,
    } = req.body;

    // Find the existing appointment
    const appt = await Appointment.findById(id).populate("business service");
    if (!appt) {
      return res.status(404).json({ message: "Appointment не е намерен" });
    }

    // Check ownership
    if (String(appt.business.owner) !== req.user.id) {
      return res.status(403).json({ message: "Не сте собственик" });
    }

    // Get service info (use new service if provided, otherwise use existing)
    const srv = serviceId
      ? await Service.findById(serviceId)
      : await Service.findById(appt.service._id);
    if (!srv) {
      return res.status(404).json({ message: "Услугата не е намерена" });
    }

    // If staff is being changed or dateTime is being changed, validate availability
    const newStaff = staff || appt.staff;
    const newDateTime = dateTime || appt.appointmentTime.start;

    // Check if the slot has changed
    const isTimeChanged =
      moment(newDateTime).format("YYYY-MM-DD HH:mm") !==
      moment(appt.appointmentTime.start).format("YYYY-MM-DD HH:mm");
    const isStaffChanged = String(newStaff) !== String(appt.staff);

    if (isTimeChanged || isStaffChanged) {
      // Validate new slot availability
      const availability = await getAvailableSlots(
        newStaff,
        newDateTime,
        srv.duration
      );
      const requestedSlot = moment(newDateTime).format("HH:mm");
      const isSlotAvailable = availability.slots.some(
        (slot) => slot.startTime === requestedSlot
      );

      if (!isSlotAvailable) {
        return res
          .status(400)
          .json({ message: "Избраният час е зает или невалиден." });
      }

      // Update appointment time
      const startDateTime = moment(newDateTime).toDate();
      const endDateTime = moment(newDateTime)
        .add(srv.duration, "minutes")
        .toDate();
      appt.appointmentTime = {
        start: startDateTime,
        end: endDateTime,
      };

      // Set status to pending when time/staff changes
      appt.status = "pending";
    }

    // Update other fields if provided
    if (clientName) appt.clientName = clientName;
    if (clientPhone) appt.clientPhone = clientPhone;
    if (email) appt.email = email;
    if (staff) appt.staff = staff;
    if (serviceId) appt.service = serviceId;

    await appt.save();

    // Notify staff if changed
    if (isStaffChanged || isTimeChanged) {
      const newAlert = await Alert.create({
        staff: newStaff,
        businessId: appt.business._id,
        appointment: appt._id,
        message: `Променена заявка от ${appt.clientName} за услуга "${srv.name}"`,
        type: "appointment",
      });

      io.to(String(newStaff)).emit("appointmentUpdated", {
        appointment: {
          _id: appt._id,
          clientName: appt.clientName,
          serviceName: srv.name,
          appointmentTime: {
            start: appt.appointmentTime.start,
            end: appt.appointmentTime.end,
          },
          status: appt.status,
        },
        message: "Заявката е променена.",
        _id: newAlert._id,
      });
    }

    res.json(appt);
  } catch (e) {
    next(e);
  }
};

// НОВ ЕНДПОЙНТ: Връща свободните часове за конкретен служител и дата
export const getFreeSlots = async (req, res, next) => {
  try {
    const { staffId, date, serviceId } = req.query;

    if (!staffId || !date || !serviceId) {
      return res
        .status(400)
        .json({ message: "Липсват задължителни параметри." });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: "Услугата не е намерена." });
    }
    const serviceDuration = service.duration;

    const { slots, message } = await getAvailableSlots(
      staffId,
      date,
      serviceDuration
    );
    if (slots.length === 0) {
      return res.status(200).json({ slots: [], message: message });
    }
    res.status(200).json({ slots, message });
  } catch (e) {
    next(e);
  }
};

export const getClosestAvailableSlot = async (req, res, next) => {
  try {
    const { staffId, serviceId } = req.query;
    if (!staffId || !serviceId) {
      return res.status(400).json({ message: "Missing required parameters." });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }
    const serviceDuration = service.duration;

    let closestSlot = null;
    let daysToSearch = 20; // Search for the next 20 days
    let foundDateObject = null; // Ще съхранява moment обект

    for (let i = 0; i < daysToSearch; i++) {
      const searchDateMoment = moment().add(i, "days");
      const searchDate = searchDateMoment.format("YYYY-MM-DD"); // Формат за търсене в бекенда
      // console.log(staffId, searchDate, serviceDuration);
      const { slots } = await getAvailableSlots(
        staffId,
        searchDate,
        serviceDuration
      );
      // console.log("slots", slots);
      const now = moment();
      const availableToday =
        i === 0
          ? slots.filter((slot) =>
              moment(`${searchDate}T${slot.startTime}`).isAfter(now)
            )
          : slots;

      if (availableToday.length > 0) {
        closestSlot = availableToday[0];
        foundDateObject = searchDateMoment;
        break;
      }
    }

    if (closestSlot && foundDateObject) {
      res.status(200).json({
        slot: {
          startTime: closestSlot.startTime,
          endTime: closestSlot.endTime,
          date: foundDateObject.format("DD.MM.YYYY"),
        },
        message: "Closest available slot found.",
      });
    } else {
      res.status(200).json({
        slot: null,
        message: "No available slots found in the next 20 days.",
      });
    }
  } catch (e) {
    next(e);
  }
};
