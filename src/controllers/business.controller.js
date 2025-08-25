import Business from "../models/Business.js";
import { generateQrDataUrl } from "../utils/qrcode.js";

export const createBusiness = async (req, res, next) => {
  try {
    const { name, address, phone } = req.body;
    if (!name) return res.status(400).json({ message: "name е задължително" });

    const business = await Business.create({
      owner: req.user.id,
      name,
      address,
      phone,
    });

    const link = `${process.env.CLIENT_URL}/book/${business._id}`;
    const qrCodeUrl = await generateQrDataUrl(link);
    business.qrCodeUrl = qrCodeUrl;
    await business.save();

    res.status(201).json(business);
  } catch (e) {
    next(e);
  }
};

export const getBusinesses = async (req, res, next) => {
  try {
    const list = await Business.find().select("-__v").lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
};

export const getBusinessById = async (req, res, next) => {
  try {
    const item = await Business.findById(req.params.id).lean();
    if (!item)
      return res.status(404).json({ message: "Business не е намерен" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};
