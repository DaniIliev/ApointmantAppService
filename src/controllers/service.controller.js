import Service from "../models/Service.js";
import Business from "../models/Business.js";

export const createService = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { name, durationMinutes, price } = req.body;

    const business = await Business.findById(businessId);
    if (!business)
      return res.status(404).json({ message: "Business не е намерен" });
    if (String(business.owner) !== req.user.id)
      return res.status(403).json({ message: "Не сте собственик" });

    const service = await Service.create({
      business: businessId,
      name,
      durationMinutes,
      price,
    });
    res.status(201).json(service);
  } catch (e) {
    next(e);
  }
};

export const listServices = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const services = await Service.find({ business: businessId }).lean();
    res.json(services);
  } catch (e) {
    next(e);
  }
};
