// Get all businesses as { value: businessId, description: businessName }
export const getBusinessOptions = async (req, res, next) => {
  try {
    const businesses = await Business.find().select("_id businessName").lean();
    const options = businesses.map((b) => ({
      id: b._id,
      name: b.businessName,
    }));
    res.json(options);
  } catch (e) {
    next(e);
  }
};
import Business from "../models/Business.js";
import StaffSchedule from "../models/StaffSchedule.js";
import User from "../models/User.js";
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

    const link = `${process.env.CLIENT_URL}/business/${business._id}`;

    // https://appointdi.netlify.app
    const qrCodeUrl = await generateQrDataUrl(link);
    business.qrCodeUrl = qrCodeUrl;
    await business.save();

    // Update user role and businessId
    await User.findByIdAndUpdate(req.user.id, {
      role: "business",
      businessId: business._id,
    });

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
    const business = await Business.findById(businessId).lean();

    if (!business) {
      return res.status(404).json({ message: "Business не е намерен" });
    }
    
    res.json(business);
  } catch (e) {
    next(e);
  }
};
