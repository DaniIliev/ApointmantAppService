import Appointment from "../models/Appointment.js";
import Business from "../models/Business.js";
import Service from "../models/Service.js";

export const createAppointment = async (req, res, next) => {
  try {
    const { business, service, appointmentTime, clientName, clientPhone } =
      req.body;

    const biz = await Business.findById(business);
    if (!biz) return res.status(404).json({ message: "Business не е намерен" });
    const srv = await Service.findById(service);
    if (!srv || String(srv.business) !== String(biz._id)) {
      return res
        .status(400)
        .json({ message: "Невалидна услуга за този бизнес" });
    }

    const appointment = await Appointment.create({
      business,
      service,
      appointmentTime,
      client: req.user?.id ?? undefined,
      clientName,
      clientPhone,
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

    const appt = await Appointment.findById(id).populate("business");
    if (!appt)
      return res.status(404).json({ message: "Appointment не е намерен" });

    if (String(appt.business.owner) !== req.user.id) {
      return res.status(403).json({ message: "Не сте собственик" });
    }

    appt.status = status;
    await appt.save();
    res.json(appt);
  } catch (e) {
    next(e);
  }
};
