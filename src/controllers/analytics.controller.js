import mongoose from "mongoose";
import moment from "moment-timezone";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import User from "../models/User.js";

const getTimeRange = (period, from, to, timeZone = "Europe/Sofia") => {
  const localTime = moment().tz(timeZone);
  let startDate;
  let endDate;
  switch (period) {
    case "last7days":
      startDate = localTime.clone().subtract(7, "days").startOf("day").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
    case "last30days":
      startDate = localTime
        .clone()
        .subtract(30, "days")
        .startOf("day")
        .toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
    case "thismonth":
      startDate = localTime.clone().startOf("month").toDate();
      endDate = localTime.clone().endOf("day").toDate();
      break;
    case "custom":
      startDate = from
        ? moment(from).tz(timeZone).startOf("day").toDate()
        : localTime.clone().subtract(30, "days").startOf("day").toDate();
      endDate = to
        ? moment(to).tz(timeZone).endOf("day").toDate()
        : localTime.clone().endOf("day").toDate();
      break;
    default:
      startDate = localTime
        .clone()
        .subtract(30, "days")
        .startOf("day")
        .toDate();
      endDate = localTime.clone().endOf("day").toDate();
  }
  return { startDate, endDate };
};

export const getAnalytics = async (req, res) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId)
      return res.status(400).json({ message: "Missing business context" });

    const {
      source = "appointments", // appointments|revenue|clients|services|staff
      dimension = "time_series", // time_series|by_service|by_staff|by_status
      groupBy = "day",
      period = "last30days",
      from,
      to,
      staffId,
      serviceId,
      status,
    } = req.query;

    const { startDate, endDate } = getTimeRange(period, from, to);
    const business = new mongoose.Types.ObjectId(businessId);

    const baseMatch = {
      business,
      ...(status ? { status } : {}),
      "appointmentTime.start": { $gte: startDate, $lte: endDate },
    };

    // ---- APPOINTMENTS ----
    if (source === "appointments") {
      if (dimension === "time_series") {
        // group by day/week/month
        let _idExpr;
        if (groupBy === "day")
          _idExpr = {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$appointmentTime.start",
            },
          };
        else if (groupBy === "week")
          _idExpr = {
            $dateToString: { format: "%G-%V", date: "$appointmentTime.start" },
          }; // ISO week
        else
          _idExpr = {
            $dateToString: { format: "%Y-%m", date: "$appointmentTime.start" },
          };

        const rows = await Appointment.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: _idExpr,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
              cancelled: {
                $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]);
        return res.json(
          rows.map((r) => ({
            name: r._id,
            total: r.total,
            completed: r.completed,
            cancelled: r.cancelled,
          }))
        );
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
        return res.json(rows.map((r) => ({ name: r.name, value: r.count })));
      }

      if (dimension === "by_status") {
        const rows = await Appointment.aggregate([
          { $match: baseMatch },
          { $group: { _id: "$status", value: { $sum: 1 } } },
          { $sort: { value: -1 } },
        ]);
        return res.json(rows.map((r) => ({ name: r._id, value: r.value })));
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
          {
            $unwind: {
              path: "$staffDetails",
              preserveNullAndEmptyArrays: true,
            },
          },
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
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
              cancelled: {
                $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
              },
            },
          },
          { $sort: { count: -1 } },
        ]);
        return res.json(
          rows.map((r) => ({
            name: r.name || "Unknown",
            total: r.count,
            completed: r.completed,
            cancelled: r.cancelled,
          }))
        );
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
        return res.json(
          rows.map((r) => ({ name: r._id || "Uncategorized", value: r.value }))
        );
      }
    }

    // ---- REVENUE ----
    if (source === "revenue") {
      if (dimension === "time_series") {
        let _idExpr;
        if (groupBy === "day")
          _idExpr = {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$appointmentTime.start",
            },
          };
        else if (groupBy === "week")
          _idExpr = {
            $dateToString: { format: "%G-%V", date: "$appointmentTime.start" },
          };
        else
          _idExpr = {
            $dateToString: { format: "%Y-%m", date: "$appointmentTime.start" },
          };

        const rows = await Appointment.aggregate([
          { $match: { ...baseMatch, status: "completed" } },
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
        return res.json(rows.map((r) => ({ name: r._id, revenue: r.revenue })));
      }

      if (dimension === "by_service") {
        const rows = await Appointment.aggregate([
          { $match: { ...baseMatch, status: "completed" } },
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
        return res.json(rows.map((r) => ({ name: r.name, value: r.revenue })));
      }

      if (dimension === "by_staff") {
        const rows = await Appointment.aggregate([
          { $match: { ...baseMatch, status: "completed" } },
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
          {
            $unwind: {
              path: "$staffDetails",
              preserveNullAndEmptyArrays: true,
            },
          },
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
        return res.json(
          rows.map((r) => ({ name: r.name || "Unknown", value: r.revenue }))
        );
      }
    }

    // ---- SERVICES ----
    if (source === "services") {
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
        return res.json(rows.map((r) => ({ name: r.name, value: r.value })));
      }

      if (dimension === "metrics") {
        // combine static service attributes with bookings during the period
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
        return res.json(
          rows.map((r) => ({
            name: r.name,
            duration: r.duration,
            price: r.price,
            category: r.category,
            bookings: r.bookings,
          }))
        );
      }
    }

    return res.json([]);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to get analytics", error: err.message });
  }
};
