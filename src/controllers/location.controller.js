import Location from "../models/Location.js";
import Business from "../models/Business.js";
import User from "../models/User.js";
import { ensureLocationChannel, ensureClientLocationChannel } from "../utils/chatSetup.js";

const getDefaultWeeklyWorkingHours = () => ({
  monday: { isDayOff: false, workTime: { start: null, end: null } },
  tuesday: { isDayOff: false, workTime: { start: null, end: null } },
  wednesday: { isDayOff: false, workTime: { start: null, end: null } },
  thursday: { isDayOff: false, workTime: { start: null, end: null } },
  friday: { isDayOff: false, workTime: { start: null, end: null } },
  saturday: { isDayOff: true, workTime: { start: null, end: null } },
  sunday: { isDayOff: true, workTime: { start: null, end: null } },
});

const normalizeWeeklyWorkingHours = (payload = {}) => {
  const defaults = getDefaultWeeklyWorkingHours();

  return Object.keys(defaults).reduce((acc, dayKey) => {
    const sourceDay = payload?.[dayKey] || defaults[dayKey];
    const isDayOff =
      typeof sourceDay?.isDayOff === "boolean"
        ? sourceDay.isDayOff
        : defaults[dayKey].isDayOff;

    const sourceWorkTime = sourceDay?.workTime || defaults[dayKey].workTime;
    const start = sourceWorkTime?.start ?? defaults[dayKey].workTime.start;
    const end = sourceWorkTime?.end ?? defaults[dayKey].workTime.end;

    acc[dayKey] = {
      isDayOff,
      workTime: {
        start: isDayOff ? null : start,
        end: isDayOff ? null : end,
      },
    };

    return acc;
  }, {});
};

const formatScheduleFromWeeklyHours = (weeklyWorkingHours) => {
  if (!weeklyWorkingHours) return 'Not Set';

  const formatTimeRange = (timeRange, isOff) => {
    if (isOff) return 'Day Off';
    if (timeRange && timeRange.start && timeRange.end) {
      return `${timeRange.start}-${timeRange.end}`;
    }
    return 'Not Set';
  };

  return {
    monday: formatTimeRange(
      weeklyWorkingHours.monday?.workTime,
      weeklyWorkingHours.monday?.isDayOff,
    ),
    tuesday: formatTimeRange(
      weeklyWorkingHours.tuesday?.workTime,
      weeklyWorkingHours.tuesday?.isDayOff,
    ),
    wednesday: formatTimeRange(
      weeklyWorkingHours.wednesday?.workTime,
      weeklyWorkingHours.wednesday?.isDayOff,
    ),
    thursday: formatTimeRange(
      weeklyWorkingHours.thursday?.workTime,
      weeklyWorkingHours.thursday?.isDayOff,
    ),
    friday: formatTimeRange(
      weeklyWorkingHours.friday?.workTime,
      weeklyWorkingHours.friday?.isDayOff,
    ),
    saturday: formatTimeRange(
      weeklyWorkingHours.saturday?.workTime,
      weeklyWorkingHours.saturday?.isDayOff,
    ),
    sunday: formatTimeRange(
      weeklyWorkingHours.sunday?.workTime,
      weeklyWorkingHours.sunday?.isDayOff,
    ),
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
      return res.status(404).json({ 
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found." 
      });
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
      weeklyWorkingHours: getDefaultWeeklyWorkingHours(),
    });

    // Auto-create location chat channels
    try {
      const userId = req.user.id || req.user._id;
      await ensureLocationChannel(business._id, location._id, name, userId);
      await ensureClientLocationChannel(business._id, location._id, name, userId);
    } catch (chatErr) {
      console.error("Location chat channel auto-creation error:", chatErr);
    }

    res.status(201).json({
      message: "Location created successfully.",
      messageCode: "LOCATION_CREATED",
      data: location
    });
  } catch (error) {
    next(error);
  }
};

export const getLocations = async (req, res, next) => {
  try {
    const { businessId } = req.query;
    const filter = businessId ? { businessId } : {};
    const locations = await Location.find(filter).lean();

    const locationsWithSchedule = locations.map((loc) => {
      const weeklyWorkingHours = normalizeWeeklyWorkingHours(
        loc.weeklyWorkingHours,
      );
      return {
        ...loc,
        weeklyWorkingHours,
        schedule: formatScheduleFromWeeklyHours(weeklyWorkingHours),
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
      return res.status(404).json({ 
        errorCode: "LOCATION_NOT_FOUND",
        message: "Location not found." 
      });
    }

    const weeklyWorkingHours = normalizeWeeklyWorkingHours(
      location.weeklyWorkingHours,
    );

    res.json({
      ...location,
      weeklyWorkingHours,
      schedule: formatScheduleFromWeeklyHours(weeklyWorkingHours),
    });
  } catch (error) {
    next(error);
  }
};

export const getLocationWeeklyWorkingHours = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id).lean();
    if (!location) {
      return res.status(404).json({ 
        errorCode: "LOCATION_NOT_FOUND",
        message: "Location not found." 
      });
    }

    const weeklyWorkingHours = normalizeWeeklyWorkingHours(
      location.weeklyWorkingHours,
    );

    res.json({
      locationId: location._id,
      weeklyWorkingHours,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLocationWeeklyWorkingHours = async (req, res, next) => {
  try {
    const { id } = req.params;
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ 
        errorCode: "LOCATION_NOT_FOUND",
        message: "Location not found." 
      });
    }

    const isBusinessOwner =
      req.user?.role === "business" &&
      !!(await Business.findOne({
        _id: location.businessId,
        owner: req.user.id,
      }));
    const isManagerAllowed = await canManagerEditLocation(req, location);

    if (!isBusinessOwner && !isManagerAllowed) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have permission for this location." 
      });
    }

    const weeklyWorkingHours = normalizeWeeklyWorkingHours(
      req.body?.weeklyWorkingHours,
    );

    location.weeklyWorkingHours = weeklyWorkingHours;
    await location.save();

    res.json({
      message: "Weekly working hours updated successfully.",
      messageCode: "LOCATION_HOURS_UPDATED",
      data: {
        locationId: location._id,
        weeklyWorkingHours,
        schedule: formatScheduleFromWeeklyHours(weeklyWorkingHours),
      }
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
      return res.status(404).json({ 
        errorCode: "LOCATION_NOT_FOUND",
        message: "Location not found." 
      });
    }

    const isBusinessOwner =
      req.user?.role === "business" &&
      !!(await Business.findOne({
        _id: location.businessId,
        owner: req.user.id,
      }));
    const isManagerAllowed = await canManagerEditLocation(req, location);

    if (!isBusinessOwner && !isManagerAllowed) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have permission for this location." 
      });
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

    res.json({
      message: "Location updated successfully.",
      messageCode: "LOCATION_UPDATED",
      data: updatedLocation
    });
  } catch (error) {
    next(error);
  }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ 
        errorCode: "LOCATION_NOT_FOUND",
        message: "Location not found." 
      });
    }

    const isBusinessOwner =
      req.user?.role === "business" &&
      !!(await Business.findOne({
        _id: location.businessId,
        owner: req.user.id,
      }));
    const isManagerAllowed = await canManagerEditLocation(req, location);

    if (!isBusinessOwner && !isManagerAllowed) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "You do not have permission for this location." 
      });
    }

    await Location.findByIdAndDelete(id);
    res.json({ 
      message: "Location deleted successfully.",
      messageCode: "LOCATION_DELETED"
    });
  } catch (error) {
    next(error);
  }
};
