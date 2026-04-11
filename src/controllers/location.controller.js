import Location from "../models/Location.js";
import Business from "../models/Business.js";
import StaffSchedule from "../models/StaffSchedule.js";
import User from "../models/User.js";

const formatSchedule = (schedules) => {
  if (schedules.length === 0) return "Няма зададен график";

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

  return {
    monday: formatTimeRange(workTime, isDayOff?.monday),
    tuesday: formatTimeRange(workTime, isDayOff?.tuesday),
    wednesday: formatTimeRange(workTime, isDayOff?.wednesday),
    thursday: formatTimeRange(workTime, isDayOff?.thursday),
    friday: formatTimeRange(workTime, isDayOff?.friday),
    saturday: formatTimeRange(workTime, isDayOff?.saturday),
    sunday: formatTimeRange(workTime, isDayOff?.sunday),
  };
};

const findBusinessForWrite = async (req) => {
  if (req.user?.role === "business") {
    return Business.findOne({ owner: req.user.id });
  }

  if (req.user?.role === "manager" && req.user?.businessId) {
    return Business.findById(req.user.businessId);
  }

  return null;
};

const canManagerEditLocation = async (req, location) => {
  if (req.user?.role !== "manager") return false;
  if (!req.user?.id) return false;

  const manager = await User.findById(req.user.id).select(
    "role businessId locationIds",
  );
  if (!manager || manager.role !== "manager") return false;

  const sameBusiness =
    String(manager.businessId || "") === String(location.businessId || "");
  const hasLocationAccess = (manager.locationIds || []).some(
    (locId) => String(locId) === String(location._id),
  );

  return sameBusiness && hasLocationAccess;
};

export const createLocation = async (req, res, next) => {
  try {
    const {
      name,
      address,
      addressLine2,
      postalCode,
      city,
      country,
      phone,
      email,
    } = req.body;
    const imageUrl = req.file ? req.file.path : req.body.imageUrl;
    console.log("req.user", req.user);
    const business = await findBusinessForWrite(req);
    if (!business) {
      return res.status(404).json({ message: "Бизнес не е намерен" });
    }

    const location = await Location.create({
      businessId: business._id,
      name,
      address,
      addressLine2,
      postalCode,
      city,
      country,
      phone,
      email,
      imageUrl,
    });

    res.status(201).json(location);
  } catch (error) {
    next(error);
  }
};

export const getLocations = async (req, res, next) => {
  try {
    const { businessId } = req.query;
    const filter = businessId ? { businessId } : {};
    const locations = await Location.find(filter).lean();

    const now = new Date();
    const locationIds = locations.map((l) => l._id);
    const schedules = await StaffSchedule.find({
      location: { $in: locationIds },
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean();

    const locationsWithSchedule = locations.map((loc) => {
      const locSchedules = schedules.filter(
        (s) => s.location.toString() === loc._id.toString(),
      );
      return {
        ...loc,
        schedule: formatSchedule(locSchedules),
      };
    });

    res.json(locationsWithSchedule);
  } catch (error) {
    next(error);
  }
};

export const getLocationById = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id).lean();
    if (!location) {
      return res.status(404).json({ message: "Локацията не е намерена" });
    }

    const now = new Date();
    const schedules = await StaffSchedule.find({
      location: location._id,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean();

    res.json({
      ...location,
      schedule: formatSchedule(schedules),
    });
  } catch (error) {
    next(error);
  }
};

export const updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Verify ownership
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ message: "Локацията не е намерена" });
    }

    const isBusinessOwner =
      req.user?.role === "business" &&
      !!(await Business.findOne({
        _id: location.businessId,
        owner: req.user.id,
      }));
    const isManagerAllowed = await canManagerEditLocation(req, location);

    if (!isBusinessOwner && !isManagerAllowed) {
      return res.status(403).json({ message: "Нямате права за тази локация" });
    }

    const updateData = { ...req.body };
    if (req.file?.path) {
      updateData.imageUrl = req.file.path;
    }

    const updatedLocation = await Location.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).lean();

    res.json(updatedLocation);
  } catch (error) {
    next(error);
  }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ message: "Локацията не е намерена" });
    }

    const isBusinessOwner =
      req.user?.role === "business" &&
      !!(await Business.findOne({
        _id: location.businessId,
        owner: req.user.id,
      }));
    const isManagerAllowed = await canManagerEditLocation(req, location);

    if (!isBusinessOwner && !isManagerAllowed) {
      return res.status(403).json({ message: "Нямате права за тази локация" });
    }

    await Location.findByIdAndDelete(id);
    res.json({ message: "Локацията е изтрита успешно" });
  } catch (error) {
    next(error);
  }
};
