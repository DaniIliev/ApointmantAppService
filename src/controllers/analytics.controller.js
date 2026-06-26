import mongoose from "mongoose";
import moment from "moment-timezone";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Location from "../models/Location.js";

const getTimeRange = (period, from, to, timeZone = "Europe/Sofia") => {
  const localTime = moment().tz(timeZone);
  let startDate;
  let endDate;
  switch (period) {
    case "last7days":
    case "week":
      startDate = localTime.clone().subtract(7, "days").startOf("day").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
    case "all":
      startDate = null;
      endDate = null;
      break;
    case "last30days":
      startDate = localTime.clone().subtract(30, "days").startOf("day").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
    case "thismonth":
      startDate = localTime.clone().startOf("month").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
    case "custom":
      startDate = from ? moment(from).tz(timeZone).startOf("day").toDate() : localTime.clone().subtract(30, "days").startOf("day").toDate();
      endDate = to ? moment(to).tz(timeZone).endOf("day").toDate() : localTime.clone().endOf("day").toDate();
      break;
    default:
      startDate = localTime.clone().subtract(30, "days").startOf("day").toDate();
      endDate = localTime.clone().endOf("day").toDate();
  }
  return { startDate, endDate };
};

const getAppointmentsAnalytics = async (baseMatch, dimension, groupBy) => {
  if (dimension === "time_series") {
    let _idExpr;
    if (groupBy === "day") {
      _idExpr = { $dateToString: { format: "%Y-%m-%d", date: "$appointmentTime.start" } };
    } else if (groupBy === "week") {
      _idExpr = { $dateToString: { format: "%G-%V", date: "$appointmentTime.start" } };
    } else {
      _idExpr = { $dateToString: { format: "%Y-%m", date: "$appointmentTime.start" } };
    }

    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: _idExpr,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          upcoming: { $sum: { $cond: [{ $in: ["$status", ["pending", "confirmed"]] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({
      name: r._id,
      total: r.total,
      completed: r.completed,
      cancelled: r.cancelled,
      upcoming: r.upcoming,
    }));
  }

  if (dimension === "by_service") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$service",
          name: { $first: "$serviceDetails.name" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);
    return rows.map((r) => ({ name: r.name, value: r.count }));
  }

  if (dimension === "by_status") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$status", value: { $sum: 1 } } },
      { $sort: { value: -1 } },
    ]);
    return rows.map((r) => ({ name: r._id, value: r.value }));
  }

  if (dimension === "by_staff") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: User.collection.name,
          localField: "staff",
          foreignField: "_id",
          as: "staffDetails",
        },
      },
      { $unwind: { path: "$staffDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$staff",
          name: {
            $first: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$staffDetails.firstName", "-"] },
                    " ",
                    { $ifNull: ["$staffDetails.lastName", "-"] },
                  ],
                },
              },
            },
          },
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          upcoming: { $sum: { $cond: [{ $in: ["$status", ["pending", "confirmed"]] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]);
    return rows.map((r) => ({
      name: r.name || "Unknown",
      total: r.count,
      completed: r.completed,
      cancelled: r.cancelled,
      upcoming: r.upcoming,
    }));
  }

  if (dimension === "by_category") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$serviceDetails.category",
          value: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
    ]);
    return rows.map((r) => ({ name: r._id || "Uncategorized", value: r.value }));
  }

  if (dimension === "by_location") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Location.collection.name,
          localField: "locationId",
          foreignField: "_id",
          as: "locationDetails",
        },
      },
      { $unwind: { path: "$locationDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$locationId",
          name: { $first: "$locationDetails.name" },
          value: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
    ]);
    return rows.map((r) => ({ name: r.name || "Default / Unassigned", value: r.value }));
  }

  return [];
};

const getRevenueAnalytics = async (baseMatch, dimension, groupBy) => {
  if (dimension === "time_series") {
    let _idExpr;
    if (groupBy === "day") {
      _idExpr = { $dateToString: { format: "%Y-%m-%d", date: "$appointmentTime.start" } };
    } else if (groupBy === "week") {
      _idExpr = { $dateToString: { format: "%G-%V", date: "$appointmentTime.start" } };
    } else {
      _idExpr = { $dateToString: { format: "%Y-%m", date: "$appointmentTime.start" } };
    }

    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: _idExpr,
          revenue: { $sum: "$serviceDetails.price" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ name: r._id, revenue: r.revenue }));
  }

  if (dimension === "by_service") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$service",
          name: { $first: "$serviceDetails.name" },
          revenue: { $sum: "$serviceDetails.price" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    return rows.map((r) => ({ name: r.name, value: r.revenue }));
  }

  if (dimension === "by_staff") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $lookup: {
          from: User.collection.name,
          localField: "staff",
          foreignField: "_id",
          as: "staffDetails",
        },
      },
      { $unwind: { path: "$staffDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$staff",
          name: {
            $first: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$staffDetails.firstName", "-"] },
                    " ",
                    { $ifNull: ["$staffDetails.lastName", "-"] },
                  ],
                },
              },
            },
          },
          revenue: { $sum: "$serviceDetails.price" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    return rows.map((r) => ({ name: r.name || "Unknown", value: r.revenue }));
  }

  if (dimension === "by_location") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $lookup: {
          from: Location.collection.name,
          localField: "locationId",
          foreignField: "_id",
          as: "locationDetails",
        },
      },
      { $unwind: { path: "$locationDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$locationId",
          name: { $first: "$locationDetails.name" },
          revenue: { $sum: "$serviceDetails.price" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    return rows.map((r) => ({ name: r.name || "Default / Unassigned", value: r.revenue }));
  }

  return [];
};

const getServicesAnalytics = async (baseMatch, dimension) => {
  if (dimension === "popularity") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$service",
          name: { $first: "$serviceDetails.name" },
          value: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
    ]);
    return rows.map((r) => ({ name: r.name, value: r.value }));
  }

  if (dimension === "metrics") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $lookup: {
          from: Service.collection.name,
          localField: "service",
          foreignField: "_id",
          as: "serviceDetails",
        },
      },
      { $unwind: "$serviceDetails" },
      {
        $group: {
          _id: "$service",
          name: { $first: "$serviceDetails.name" },
          duration: { $first: "$serviceDetails.duration" },
          price: { $first: "$serviceDetails.price" },
          category: { $first: "$serviceDetails.category" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { bookings: -1 } },
    ]);
    return rows.map((r) => ({
      name: r.name,
      duration: r.duration,
      price: r.price,
      category: r.category,
      bookings: r.bookings,
    }));
  }

  return [];
};

const getClientsAnalytics = async (baseMatch, dimension, groupBy) => {
  if (dimension === "stats") {
    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: "$client",
          count: { $sum: 1 },
        },
      },
    ]);
    return {
      totalactive: rows.length,
      bookings: rows.reduce((acc, r) => acc + r.count, 0),
    };
  }

  if (dimension === "time_series") {
    let _idExpr;
    if (groupBy === "day") {
      _idExpr = { $dateToString: { format: "%Y-%m-%d", date: "$appointmentTime.start" } };
    } else if (groupBy === "week") {
      _idExpr = { $dateToString: { format: "%G-%V", date: "$appointmentTime.start" } };
    } else {
      _idExpr = { $dateToString: { format: "%Y-%m", date: "$appointmentTime.start" } };
    }

    const rows = await Appointment.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { date: _idExpr, client: "$client" },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          value: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ name: r._id, value: r.value }));
  }

  return [];
};

export const getAnalytics = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(400).json({ 
        errorCode: "MISSING_BUSINESS_CONTEXT",
        message: "Missing business context." 
      });
    }

    const {
      source = "appointments", // appointments|revenue|clients|services|staff
      dimension = "time_series", // time_series|by_service|by_staff|by_status|by_category|popularity|metrics|stats
      groupBy = "day",
      period = "last30days",
      from,
      to,
      staffId,
      serviceId,
      locationId,
      status,
    } = req.query;

    const { startDate, endDate } = getTimeRange(period, from, to);
    const business = new mongoose.Types.ObjectId(businessId);
    
    const baseMatch = {
      business: { $in: [business, business.toString()] },
      ...(status ? { status } : {}),
    };
    
    if (startDate && endDate) {
      baseMatch["appointmentTime.start"] = { $gte: startDate, $lte: endDate };
    }
    if (staffId) {
      const sid = new mongoose.Types.ObjectId(staffId);
      baseMatch.staff = { $in: [sid, sid.toString()] };
    }
    if (serviceId) {
      const serId = new mongoose.Types.ObjectId(serviceId);
      baseMatch.service = { $in: [serId, serId.toString()] };
    }
    if (locationId) {
      const locId = new mongoose.Types.ObjectId(locationId);
      baseMatch.locationId = { $in: [locId, locId.toString()] };
    }

    let data = [];

    if (source === "appointments") {
      data = await getAppointmentsAnalytics(baseMatch, dimension, groupBy);
    } else if (source === "revenue") {
      data = await getRevenueAnalytics(baseMatch, dimension, groupBy);
    } else if (source === "services") {
      data = await getServicesAnalytics(baseMatch, dimension);
    } else if (source === "clients") {
      data = await getClientsAnalytics(baseMatch, dimension, groupBy);
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ 
      errorCode: "ANALYTICS_FAILED",
      message: "Failed to get analytics.", 
      error: err.message 
    });
  }
};
