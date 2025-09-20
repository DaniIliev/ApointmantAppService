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

    // ... (съществуващият код за намиране на срещи)
    if (userRole === "personal") {
      appointments = await Appointment.find({ client: userId }).populate(
        "business service"
      );
    } else if (userRole === "business" || userRole === "staff") {
      const business = await Business.findOne({ owner: userId });
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      appointments = await Appointment.find({
        business: business._id,
      }).populate("service client");
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
      dateTime, // Това е началният час като низ
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

    if (!srv.staffIds.includes(staff)) {
      return res.status(400).json({
        message: "Избраният служител не може да извърши тази услуга.",
      });
    }

    // ВАЛИДАЦИЯ: Проверка за заетост на избрания час
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
      // ПРОМЯНА: Използваме appointmentTime обект
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
      appointment: appointment._id,
      message: `Нова заявка от ${clientName} за услуга "${srv.name}"`,
    });

    // **NEW LOGIC:** Send the alert ID with the Socket.IO notification
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
      alertId: newAlert._id, // Send the new alert's ID
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
