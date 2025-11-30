import Business from "../models/Business.js";
import { syncBusinessSubscriptionToAllUsers } from "../utils/syncBusinessSubscriptionToAllUsers.js";

// Admin endpoint to grant a plan to a business without Stripe
export const adminGrantPlan = async (req, res, next) => {
  try {
    const { businessId, plan, duration } = req.body;
    if (!businessId || !plan) {
      return res
        .status(400)
        .json({ message: "businessId и plan са задължителни." });
    }
    // Validate plan
    const validPlans = [
      "Starter_Monthly",
      "Professional_Monthly",
      "Enterprise_Monthly",
      "Starter_Annual",
      "Professional_Annual",
      "Enterprise_Annual",
    ];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ message: "Невалиден план." });
    }
    // Find and update business
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: "Бизнесът не е намерен." });
    }
    business.plan = plan;
    business.subscriptionStatus = "active";
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
    res.json({ message: "Планът е зададен успешно.", business });
  } catch (e) {
    next(e);
  }
};
