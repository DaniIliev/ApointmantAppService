import Business from "../models/Business.js";
import StaffSchedule from "../models/StaffSchedule.js";
import { generateQrDataUrl } from "../utils/qrcode.js";

const extractBusinessData = (body) => {
  return {
    // General Information
    category: body.category,
    businessName: body.businessName, // The required 'name' from previous logic is now 'businessName'
    aboutUs: body.aboutUs,
    openingHours: body.openingHours, // Contact Details
    phone: body.phone,
    email: body.email,
    aboutUs: body.aboutUs,
    website: body.website, // Address
    address: body.address, // Street and Number
    addressLine2: body.addressLine2,
    postalCode: body.postalCode,
    city: body.city,
    country: body.country, // Image URL (assuming it is sent in the body for simplicity,
    // but a proper file upload middleware is recommended for production)
    businessImageUrl: body.imagePreview,
  };
};

export const createBusiness = async (req, res, next) => {
  try {
    const data = extractBusinessData(req.body);
    if (!data.businessName) {
      return res.status(400).json({ message: "Име на бизнеса е задължително" });
    }

    const business = await Business.create({
      owner: req.user.id,
      ...data, // Spread all new fields
    }); // Generate QR Code

    // const link = `${process.env.CLIENT_URL}/book/${business._id}`;
    const link = `https://appointdi.netlify.app/book/${business._id}`;

    // https://appointdi.netlify.app
    const qrCodeUrl = await generateQrDataUrl(link);
    business.qrCodeUrl = qrCodeUrl;
    await business.save();

    res.status(201).json(business);
  } catch (e) {
    next(e);
  }
};

export const updateBusiness = async (req, res, next) => {
  try {
    const businessId = req.params.id;
    let data = extractBusinessData(req.body);
    if (req.file) {
      const newImageUrl = req.file.secure_url || req.file.path;
      data = {
        ...data,
        businessImageUrl: newImageUrl,
      };
    }
    const business = await Business.findOneAndUpdate(
      { _id: businessId, owner: req.user.id },
      { $set: data },
      { new: true, runValidators: true }
    ).lean();

    if (!business) {
      return res
        .status(404)
        .json({ message: "Business не е намерен или не е ваш" });
    }

    res.json(business);
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
    const businessId = req.params.id;

    console.log("Fetching business with ID:", businessId);
    const business = await Business.findById(businessId).lean();

    if (!business) {
      return res.status(404).json({ message: "Business не е намерен" });
    }
    const now = new Date();

    const schedules = await StaffSchedule.find({
      business: businessId,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean();
    let formattedHours = null;

    if (schedules.length > 0) {
      const representativeSchedule = schedules[0];
      const workTime = representativeSchedule.workTime;
      const isDayOff = representativeSchedule.isDayOff;

      const formatTimeRange = (timeRange, isOff) => {
        if (isOff) return "Почивен Ден";
        if (timeRange && timeRange.start && timeRange.end) {
          return `${timeRange.start}-${timeRange.end}`;
        }
        return "Не е зададено";
      };

      formattedHours = {
        monday: formatTimeRange(workTime, isDayOff.monday),
        tuesday: formatTimeRange(workTime, isDayOff.tuesday),
        wednesday: formatTimeRange(workTime, isDayOff.wednesday),
        thursday: formatTimeRange(workTime, isDayOff.thursday),
        friday: formatTimeRange(workTime, isDayOff.friday),
        saturday: formatTimeRange(workTime, isDayOff.saturday),
        sunday: formatTimeRange(workTime, isDayOff.sunday),
      };
    } else {
      formattedHours = "Няма зададен график";
    }
    res.json({
      ...business,
      schedule: formattedHours,
    });
  } catch (e) {
    next(e);
  }
};
