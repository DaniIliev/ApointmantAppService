import User from "../models/User.js";

// Utility to sync all users in a business to the business plan
export const syncBusinessSubscriptionToAllUsers = async (
  businessId,
  plan,
  expiresAt
) => {
  // Find all users with this businessId and role business/staff
  const users = await User.find({
    businessId,
    role: { $in: ["business", "staff"] },
  });
  for (const user of users) {
    user.subscriptionPlan = plan;
    user.subscriptionStatus = plan === "none" ? "none" : "active";
    user.subscriptionBusinessId = businessId;
    user.subscriptionActivatedAt = new Date();
    user.subscriptionCurrentPeriodEnd = expiresAt || undefined;
    await user.save();
  }
};
