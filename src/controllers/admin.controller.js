import Business from "../models/Business.js";
import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import SystemLog from "../models/SystemLog.js";
import Location from "../models/Location.js";
import { syncBusinessSubscriptionToAllUsers } from "../utils/syncBusinessSubscriptionToAllUsers.js";

// Admin endpoint to grant a plan to a business without Stripe
export const adminGrantPlan = async (req, res, next) => {
  try {
    const { businessId, plan, duration } = req.body;
    if (!businessId || !plan) {
      return res.status(400)
        .json({ 
          errorCode: "MISSING_REQUIRED_FIELDS",
          message: "businessId and plan are required." 
        });
    }
    // Validate plan
    const validPlans = [
      "none",
      "Starter_Monthly",
      "Professional_Monthly",
      "Enterprise_Monthly",
      "Starter_Annual",
      "Professional_Annual",
      "Enterprise_Annual",
    ];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ 
        errorCode: "INVALID_PLAN",
        message: "Invalid plan." 
      });
    }
    // Find and update business
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ 
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found." 
      });
    }
    business.plan = plan;
    business.subscriptionStatus = plan === "none" ? "none" : "active";
    // Optionally, set a custom expiration date based on duration
    if (duration && Number.isInteger(duration) && duration > 0) {
      const now = new Date();
      let months = parseInt(duration, 10);
      let expiresAt = new Date(now.setMonth(now.getMonth() + months));
      business.planExpiresAt = expiresAt;
    } else {
      business.planExpiresAt = undefined;
    }
    await business.save();
    // Sync all users in this business
    await syncBusinessSubscriptionToAllUsers(
      business._id,
      plan,
      business.planExpiresAt
    );
    res.json({ 
      message: "Plan granted successfully.", 
      messageCode: "PLAN_GRANTED",
      data: business 
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/admin/dashboard-stats
export const adminGetDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalBusinesses = await Business.countDocuments();
    const totalAppointments = await Appointment.countDocuments();

    // Active plans count
    const planCounts = await Business.aggregate([
      { $group: { _id: "$plan", count: { $sum: 1 } } }
    ]);
    
    const activePlans = {
      none: 0,
      Starter_Monthly: 0,
      Professional_Monthly: 0,
      Enterprise_Monthly: 0,
      Starter_Annual: 0,
      Professional_Annual: 0,
      Enterprise_Annual: 0,
    };

    planCounts.forEach((p) => {
      const planName = p._id || "none";
      if (planName in activePlans) {
        activePlans[planName] = p.count;
      } else {
        activePlans.none += p.count;
      }
    });

    // Average response time & error counts over last 24h
    const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const responseTimeStats = await SystemLog.aggregate([
      {
        $match: {
          level: "metric",
          category: "api_performance",
          timestamp: { $gte: past24h },
          "metadata.durationMs": { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: "$metadata.durationMs" },
          totalRequests: { $sum: 1 }
        }
      }
    ]);

    const avgResponseTime = responseTimeStats.length > 0 ? Math.round(responseTimeStats[0].avgDuration) : 0;
    const totalRequests24h = responseTimeStats.length > 0 ? responseTimeStats[0].totalRequests : 0;

    const errorCount24h = await SystemLog.countDocuments({
      level: "error",
      timestamp: { $gte: past24h }
    });

    const errorRate = totalRequests24h > 0 ? Math.round((errorCount24h / (totalRequests24h + errorCount24h)) * 100) : 0;

    // Time-series metrics (bucketed by 2-hour blocks for the last 24h = 12 data points)
    const hourlyData = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(Date.now() - (i + 1) * 2 * 60 * 60 * 1000);
      const end = new Date(Date.now() - i * 2 * 60 * 60 * 1000);

      const reqCount = await SystemLog.countDocuments({
        level: "metric",
        timestamp: { $gte: start, $lt: end }
      });

      const errCount = await SystemLog.countDocuments({
        level: "error",
        timestamp: { $gte: start, $lt: end }
      });

      const avgRes = await SystemLog.aggregate([
        {
          $match: {
            level: "metric",
            timestamp: { $gte: start, $lt: end },
            "metadata.durationMs": { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avg: { $avg: "$metadata.durationMs" }
          }
        }
      ]);

      const hourLabel = `${start.getHours()}:00`;
      hourlyData.push({
        time: hourLabel,
        requests: reqCount + errCount,
        errors: errCount,
        responseTime: avgRes.length > 0 ? Math.round(avgRes[0].avg) : 0
      });
    }

    // Plans taken this month (current calendar month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const plansThisMonth = await Business.countDocuments({
      createdAt: { $gte: startOfMonth },
      plan: { $ne: "none" }
    });

    const activeSubscribers = await Business.countDocuments({
      plan: { $ne: "none" },
      subscriptionStatus: "active"
    });

    res.json({
      totalUsers,
      totalBusinesses,
      totalAppointments,
      activePlans,
      avgResponseTime,
      errorRate,
      errorCount24h,
      totalRequests24h,
      plansThisMonth,
      activeSubscribers,
      hourlyData
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/admin/logs
export const adminGetLogs = async (req, res, next) => {
  try {
    const { level, category, search, page = 1, limit = 50 } = req.query;

    const query = {};

    if (level && level !== "all") {
      query.level = level;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { message: { $regex: search, $options: "i" } },
        { "metadata.url": { $regex: search, $options: "i" } },
        { "metadata.stack": { $regex: search, $options: "i" } }
      ];
    }

    const skipIndex = (parseInt(page) - 1) * parseInt(limit);

    const logs = await SystemLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skipIndex);

    const totalLogs = await SystemLog.countDocuments(query);

    res.json({
      logs,
      totalLogs,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalLogs / parseInt(limit))
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/admin/businesses
export const adminGetBusinesses = async (req, res, next) => {
  try {
    const businesses = await Business.find({})
      .populate("owner", "firstName lastName email")
      .sort({ createdAt: -1 });

    const results = [];
    for (const b of businesses) {
      const locationsCount = await Location.countDocuments({ businessId: b._id });
      const staffCount = await User.countDocuments({ businessId: b._id, role: "staff" });
      const appointmentsCount = await Appointment.countDocuments({ businessId: b._id });

      results.push({
        _id: b._id,
        businessName: b.businessName || "Pending Setup",
        ownerEmail: b.owner?.email || "N/A",
        ownerName: b.owner ? `${b.owner.firstName || ""} ${b.owner.lastName || ""}`.trim() : "N/A",
        plan: b.plan || "none",
        subscriptionStatus: b.subscriptionStatus || "none",
        planExpiresAt: b.planExpiresAt,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        locationsCount,
        staffCount,
        appointmentsCount
      });
    }

    res.json(results);
  } catch (e) {
    next(e);
  }
};
