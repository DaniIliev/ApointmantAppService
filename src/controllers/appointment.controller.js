import Appointment from "../models/Appointment.js";
import Business from "../models/Business.js";
import Service from "../models/Service.js";
import Alert from "../models/Alert.js";
import User from "../models/User.js";
import {
  sendConfirmationEmail,
  sendAppointmentConfirmationToNewUser,
  sendAppointmentConfirmationToExistingUser,
  sendAppointmentCancelledEmail,
  sendPaymentCapturedEmail,
  sendPaymentRefundedEmail,
} from "../utils/EmailService.js";
import { getAvailableSlots } from "../utils/AppointmentUtilities.js";
import moment from "moment-timezone";
import { requireStripe } from "../config/stripe.js";

const APP_TIMEZONE = "Europe/Sofia";
import { io } from "../index.js";
import bcrypt from "bcryptjs";

// Helper function to generate a random password
const generateTemporaryPassword = () => {
  const length = 12;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

const serializeAppointment = (appointment) => {
  const start = appointment.appointmentTime?.start;
  const end = appointment.appointmentTime?.end;
  const isWorkBlock = appointment.kind === "work_block";
  const fallbackDuration =
    start && end ? moment(end).diff(moment(start), "minutes") : undefined;
  const serviceName = isWorkBlock
    ? appointment.clientName ||
      appointment.title ||
      appointment.notes ||
      "Работен ангажимент"
    : appointment.service?.name ||
      appointment.title ||
      appointment.notes ||
      "Appointment";
  return {
    _id: appointment._id,
    businessName: appointment.business?.businessName,
    businessId: appointment.business?._id,
    serviceName,
    servicePrice: isWorkBlock ? undefined : appointment.service?.price,
    serviceDuration: isWorkBlock
      ? fallbackDuration
      : (appointment.service?.duration ?? fallbackDuration),
    clientName: appointment.clientName || appointment.title || "",
    clientPhone: appointment.clientPhone || "",
    email: appointment.email || "",
    appointmentTime: {
      start,
      end,
    },
    status: appointment.status,
    kind: appointment.kind || "appointment",
    title: appointment.title || "",
    notes: appointment.notes,
    service_id: appointment.service?._id || appointment.service || null,
    staff: appointment.staff,
    paymentStatus: appointment.paymentStatus,
    stripePaymentIntentId: appointment.stripePaymentIntentId,
    stripePaymentMethodId: appointment.stripePaymentMethodId,
    stripePaymentAmount: appointment.stripePaymentAmount,
    location: appointment.locationId,
  };
};

export const getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const locationId = req.headers["x-location-id"];

    const filter = {};
    if (locationId) filter.locationId = locationId;

    if (userRole === "personal") {
      filter.client = userId;
    } else if (userRole === "business" || userRole === "staff") {
      // For business owner or staff, we show their assigned appointments
      filter.staff = userId;
    } else {
      return res.status(403).json({
        errorCode: "INVALID_USER_ROLE",
        message: "Invalid user role.",
      });
    }

    const appointments = await Appointment.find(filter).populate(
      "business service client",
    );

    const transformedAppointments = appointments.map((appointment) =>
      serializeAppointment(appointment),
    );
    transformedAppointments.sort((a, b) => {
      const startTimeA = new Date(a.appointmentTime.start).getTime();
      const startTimeB = new Date(b.appointmentTime.start).getTime();
      return startTimeA - startTimeB;
    });

    res.json(transformedAppointments);
  } catch (error) {
    res.status(500).json({
      errorCode: "SERVER_ERROR",
      message: "Server error.",
      error,
    });
  }
};

export const createWorkBlockAppointment = async (req, res, next) => {
  try {
    const {
      business,
      staff,
      dateTime,
      durationMinutes,
      title,
      notes,
      locationId,
    } = req.body;

    if (!business || !staff || !dateTime || !durationMinutes) {
      return res.status(400).json({
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Business, staff, dateTime and durationMinutes are required.",
      });
    }

    if (!req.user || !["business", "staff"].includes(req.user.role)) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Access denied.",
      });
    }

    const biz = await Business.findById(business);
    if (!biz)
      return res.status(404).json({
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found.",
      });

    if (req.user.role === "business") {
      if (String(biz.owner) !== String(req.user.id)) {
        return res.status(403).json({
          errorCode: "UNAUTHORIZED_ACTION",
          message: "You are not the owner.",
        });
      }
    } else if (String(req.user.businessId) !== String(biz._id)) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You are not an employee of this business.",
      });
    }

    const staffUser = await User.findById(staff);
    if (!staffUser || String(staffUser.businessId) !== String(biz._id)) {
      return res.status(400).json({
        errorCode: "INVALID_STAFF",
        message: "Invalid staff member.",
      });
    }

    const blockTitle = title?.trim() || "Работен ангажимент";
    const startDateTime = moment.tz(dateTime, APP_TIMEZONE).toDate();
    const endDateTime = moment
      .tz(dateTime, APP_TIMEZONE)
      .add(Number(durationMinutes), "minutes")
      .toDate();

    const appointment = await Appointment.create({
      business,
      service: undefined,
      kind: "work_block",
      title: blockTitle,
      appointmentTime: {
        start: startDateTime,
        end: endDateTime,
      },
      status: "blocked",
      paymentStatus: "not_required",
      client: undefined,
      clientName: blockTitle,
      clientPhone: "",
      email: "",
      staff,
      locationId,
      notes,
    });

    const populated = await Appointment.findById(appointment._id)
      .populate("business service client")
      .populate("staff", "firstName lastName email");

    res.status(201).json({
      message: "Work block created successfully.",
      messageCode: "WORK_BLOCK_CREATED",
      data: serializeAppointment(populated),
    });
  } catch (e) {
    next(e);
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
      locationId,
      notes,
    } = req.body;

    const biz = await Business.findById(business);
    if (!biz)
      return res.status(404).json({
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found.",
      });

    const srv = await Service.findById(service);
    if (!srv || String(srv.business) !== String(biz._id)) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE",
        message: "Invalid service for this business.",
      });
    }

    if (!srv.staffMembers.some((id) => String(id) === String(staff))) {
      return res.status(400).json({
        errorCode: "INVALID_STAFF_FOR_SERVICE",
        message: "The selected staff member cannot perform this service.",
      });
    }

    // Extract date from dateTime for availability check
    const appointmentDateOnly = moment
      .tz(dateTime, APP_TIMEZONE)
      .format("YYYY-MM-DD");
    const finalLocationId = locationId || srv.locationId;

    const availability = await getAvailableSlots(
      staff,
      appointmentDateOnly,
      srv.duration,
      finalLocationId,
      service,
    );
    console.log("Availability:", availability);
    const requestedSlot = moment.tz(dateTime, APP_TIMEZONE).format("HH:mm");
    const isSlotAvailable = availability.slots.some(
      (slot) => slot.startTime === requestedSlot,
    );

    if (!isSlotAvailable) {
      return res.status(400).json({
        errorCode: "SLOT_UNAVAILABLE",
        message: "The selected slot is busy or invalid.",
      });
    }

    // Calculate appointment time in app timezone (Sofia) - will be stored as UTC in DB
    const startDateTime = moment.tz(dateTime, APP_TIMEZONE).toDate();
    const endDateTime = moment
      .tz(dateTime, APP_TIMEZONE)
      .add(srv.duration, "minutes")
      .toDate();
    console.log("Appointment time (UTC):", startDateTime, "-", endDateTime);

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
      locationId: finalLocationId,
      notes,
    });

    const newAlert = await Alert.create({
      staff: staff,
      businessId: business,
      appointment: appointment._id,
      message: `Нова заявка от ${clientName} за услуга "${srv.name}"`,
      type: "appointment",
    });

    // Check if user with this email exists
    const existingUser = await User.findOne({ email });
    const dashboardLink = `${process.env.CLIENT_URL}/dashboard`;

    if (!existingUser) {
      // Create new user account for the client
      const tempPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const newUser = await User.create({
        email,
        passwordHash,
        role: "personal",
        firstName: clientName.split(" ")[0] || clientName,
        lastName: clientName.split(" ").slice(1).join(" ") || "",
        phone: clientPhone,
        mustChangePassword: true,
      });

      // Update the appointment with the new user's ID
      appointment.client = newUser._id;
      await appointment.save();

      // Send email with new account credentials
      await sendAppointmentConfirmationToNewUser(
        email,
        clientName,
        email,
        tempPassword,
        srv.name,
        startDateTime,
        endDateTime,
        biz.businessName,
        dashboardLink,
      );
    } else {
      // Send email with appointment details and cancel link
      await sendAppointmentConfirmationToExistingUser(
        email,
        clientName,
        srv.name,
        startDateTime,
        endDateTime,
        biz.businessName,
        dashboardLink,
        appointment._id,
      );
    }
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

    res.status(201).json({
      message: "Appointment created successfully.",
      messageCode: "APPOINTMENT_CREATED",
      data: appointment,
    });
  } catch (e) {
    next(e);
  }
};

export const listBusinessAppointments = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { locationId } = req.query;
    const biz = await Business.findById(businessId);
    if (!biz)
      return res.status(404).json({
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found.",
      });
    if (String(biz.owner) !== req.user.id)
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You are not the owner.",
      });

    const filter = { business: businessId };
    if (locationId) filter.locationId = locationId;

    const items = await Appointment.find(filter)
      .populate("service", "name durationMinutes price")
      .populate("client", "email role")
      .populate("locationId")
      .sort({ appointmentTime: 1 })
      .lean();

    res.json(items.map((item) => serializeAppointment(item)));
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
      return res.status(404).json({
        errorCode: "APPOINTMENT_NOT_FOUND",
        message: "Appointment not found.",
      });

    // if (String(appt.business.owner) !== req.user.id) {
    //   return res.status(403).json({ message: "Не сте собственик" });
    // }

    // Check if appointment is cancelled
    if (appt.status === "cancelled") {
      return res.status(400).json({
        errorCode: "CANNOT_CHANGE_CANCELLED_APPOINTMENT",
        message: "Cannot change the status of a cancelled appointment.",
      });
    }

    appt.status = status;
    // Stripe capture/refund logic
    const stripe = requireStripe();
    if (stripe && appt.stripePaymentIntentId) {
      if (status === "confirmed") {
        // Capture authorized funds when appointment is approved
        if (
          appt.paymentStatus === "authorized" ||
          appt.paymentStatus === "pending"
        ) {
          const pi = await stripe.paymentIntents.capture(
            appt.stripePaymentIntentId,
            {},
            { stripeAccount: appt.business.stripeConnectAccountId },
          );
          appt.paymentStatus = "captured";
          appt.stripePaymentMethodId = pi.payment_method;
          appt.stripePaymentAmount = pi.amount_received;
          // Notify client payment captured
          if (appt.email) {
            await sendPaymentCapturedEmail(
              appt.email,
              appt.clientName,
              appt.service.name,
              appt.business.businessName,
              pi.amount_received,
              pi.currency || "eur",
            );
          }
        }
      } else if (status === "cancelled") {
        if (appt.paymentStatus === "authorized") {
          // Void the authorization to release held funds
          await stripe.paymentIntents.cancel(
            appt.stripePaymentIntentId,
            {},
            { stripeAccount: appt.business.stripeConnectAccountId },
          );
          appt.paymentStatus = "cancelled";
        } else if (appt.paymentStatus === "captured") {
          // Refund captured funds
          const refund = await stripe.refunds.create(
            { payment_intent: appt.stripePaymentIntentId },
            { stripeAccount: appt.business.stripeConnectAccountId },
          );
          appt.paymentStatus = "refunded";
          // Notify client refund issued
          if (appt.email) {
            await sendPaymentRefundedEmail(
              appt.email,
              appt.clientName,
              appt.service.name,
              appt.business.businessName,
              refund.amount ||
                appt.stripePaymentAmount ||
                Math.round(appt.service.price * 100),
              refund.currency || "eur",
            );
          }
        }
      }
    }

    await appt.save();

    if (status === "confirmed" && appt.email) {
      await sendConfirmationEmail(
        appt.email,
        appt.clientName,
        appt.service.name,
        appt.appointmentTime.start,
        appt.appointmentTime.end,
        appt.business.businessName,
        `${process.env.CLIENT_URL}/dashboard`,
        null,
        appt._id,
      );
    }

    if (status === "cancelled" && appt.email) {
      await sendAppointmentCancelledEmail(
        appt.email,
        appt.clientName,
        appt.service.name,
        appt.appointmentTime.start,
        appt.appointmentTime.end,
        appt.business.businessName,
        `${process.env.CLIENT_URL}/dashboard`,
      );
    }

    res.json({
      message: "Appointment status updated successfully.",
      messageCode: "APPOINTMENT_STATUS_UPDATED",
      data: appt,
    });
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
      return res.status(404).json({
        errorCode: "APPOINTMENT_NOT_FOUND",
        message: "Appointment not found.",
      });
    }

    // Check ownership
    if (String(appt.business.owner) !== req.user.id) {
      return res.status(403).json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You are not the owner.",
      });
    }

    // Get service info (use new service if provided, otherwise use existing)
    const srv = serviceId
      ? await Service.findById(serviceId)
      : await Service.findById(appt.service._id);
    if (!srv) {
      return res.status(404).json({
        errorCode: "SERVICE_NOT_FOUND",
        message: "Service not found.",
      });
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
      const finalLocationId = newLocation || appt.locationId || srv.locationId;

      const availability = await getAvailableSlots(
        newStaff,
        newDateTime,
        srv.duration,
        finalLocationId,
        srv._id,
      );
      const requestedSlot = moment(newDateTime).format("HH:mm");
      const isSlotAvailable = availability.slots.some(
        (slot) => slot.startTime === requestedSlot,
      );

      if (!isSlotAvailable) {
        return res.json({
          errorCode: "SLOT_UNAVAILABLE",
          message: "The selected slot is busy or invalid.",
        });
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

    res.json({
      message: "Appointment updated successfully.",
      messageCode: "APPOINTMENT_UPDATED",
      data: appt,
    });
  } catch (e) {
    next(e);
  }
};

// НОВ ЕНДПОЙНТ: Връща свободните часове за конкретен служител и дата
export const getFreeSlots = async (req, res, next) => {
  try {
    const { staffId, date, serviceId, locationId } = req.query;

    if (!staffId || !date || !serviceId) {
      return res.json({
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Missing required parameters.",
      });
    }

    // Availability must never be cached; edge/CDN caches can return stale slots.
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        errorCode: "SERVICE_NOT_FOUND",
        message: "Service not found.",
      });
    }
    const serviceDuration = service.duration;

    const finalLocationId = locationId || service.locationId;

    const { slots, message } = await getAvailableSlots(
      staffId,
      date,
      serviceDuration,
      finalLocationId,
      serviceId,
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
    const { staffId, serviceId, date, locationId } = req.query;
    if (!staffId || !serviceId) {
      return res.status(400).json({
        errorCode: "MISSING_REQUIRED_FIELDS",
        message: "Missing required parameters.",
      });
    }

    // Availability must never be cached; edge caches were serving stale data.
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        errorCode: "SERVICE_NOT_FOUND",
        message: "Service not found.",
      });
    }
    const serviceDuration = service.duration;

    // Log server timezone context for debugging
    console.log(
      "Current server time (Sofia):",
      moment.tz(APP_TIMEZONE).format("YYYY-MM-DD HH:mm:ss Z"),
    );

    let closestSlot = null;
    const daysToSearch = 50; // Search for the next 50 days
    let foundDateObject = null; // Ще съхранява moment обект
    const now = moment.tz(APP_TIMEZONE); // Get current Sofia time once

    // Optional: start search from provided date instead of today
    // Accept formats: YYYY-MM-DD, DD.MM.YYYY
    const startFromMoment = date
      ? moment.tz(
          moment(date, ["YYYY-MM-DD", "DD.MM.YYYY"]).format("YYYY-MM-DD"),
          APP_TIMEZONE,
        )
      : moment.tz(APP_TIMEZONE).startOf("day");

    for (let i = 0; i < daysToSearch; i++) {
      // Always start from midnight in the app timezone to avoid drift across environments
      const searchDateMoment = startFromMoment
        .clone()
        .startOf("day")
        .add(i, "days");
      const searchDate = searchDateMoment.format("YYYY-MM-DD"); // Формат за търсене в бекенда
      console.log("test");
      const finalLocationId = locationId || service.locationId;
      const { slots } = await getAvailableSlots(
        staffId,
        searchDate,
        serviceDuration,
        finalLocationId,
        serviceId,
      );

      // Filter today's slots to only future times (in Sofia timezone)
      const availableToday =
        i === 0 && !date
          ? slots.filter((slot) => {
              // Critical: construct full datetime in Sofia timezone for accurate comparison
              const slotDateTime = moment.tz(
                `${searchDate}T${slot.startTime}`,
                "YYYY-MM-DDTHH:mm",
                APP_TIMEZONE,
              );
              const isAfterNow = slotDateTime.isAfter(now);
              console.log(
                `Slot ${slot.startTime}: isAfter(now=${now.format(
                  "HH:mm",
                )}) = ${isAfterNow}`,
              );
              return isAfterNow;
            })
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
        errorCode: "NO_SLOTS_FOUND",
        message: "No available slots found in the next 50 days.",
      });
    }
  } catch (e) {
    next(e);
  }
};

export const getAppointmentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id)
      .populate("business", "businessName phone")
      .populate("locationId", "name address")
      .populate("service", "name duration price")
      .populate("staff", "firstName lastName email")
      .populate("client", "email firstName lastName phone");

    if (!appointment) {
      return res.status(404).json({
        errorCode: "APPOINTMENT_NOT_FOUND",
        message: "Appointment not found.",
      });
    }

    res.json(serializeAppointment(appointment));
  } catch (e) {
    next(e);
  }
};

export const deleteAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        errorCode: "APPOINTMENT_NOT_FOUND",
        message: "Appointment not found.",
      });
    }

    // Check authorization - only business owner, staff assigned to appointment, or admin can delete
    if (userRole === "business") {
      const business = await Business.findOne({ owner: userId });
      if (
        !business ||
        appointment.business.toString() !== business._id.toString()
      ) {
        return res.json({
          errorCode: "UNAUTHORIZED_ACTION",
          message: "Unauthorized to delete this appointment.",
        });
      }
    } else if (userRole === "staff") {
      if (appointment.staff.toString() !== userId) {
        return res.json({
          errorCode: "UNAUTHORIZED_ACTION",
          message: "Unauthorized to delete this appointment.",
        });
      }
    } else if (userRole !== "admin") {
      return res.json({
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Unauthorized to delete appointments.",
      });
    }

    await Appointment.findByIdAndDelete(id);

    res.status(200).json({
      message: "Appointment deleted successfully.",
      messageCode: "APPOINTMENT_DELETED",
    });
  } catch (e) {
    next(e);
  }
};
