import User from "../models/User.js";
import Business from "../models/Business.js";
import { sendPlanExpirationWarning } from "../utils/EmailService.js";
import { createSubscriptionExpiringAlert } from "../utils/alertService.js";

/**
 * Checks for subscriptions expiring in 7 days and sends email warnings to all users in those businesses.
 * Should be run daily via a cron job or scheduler.
 */
export async function checkExpiringSubscriptions() {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    // Find businesses with subscriptions expiring in 7 days (between 7 and 8 days from now)
    const expiringBusinesses = await Business.find({
      subscriptionStatus: "active",
      plan: {
        $in: [
          "Starter_Monthly",
          "Professional_Monthly",
          "Enterprise_Monthly",
          "Starter_Annual",
          "Professional_Annual",
          "Enterprise_Annual",
        ],
      },
      // Find subscriptions expiring within the 7-day window
      $expr: {
        $and: [
          { $gte: ["$subscriptionCurrentPeriodEnd", sevenDaysFromNow] },
          { $lt: ["$subscriptionCurrentPeriodEnd", eightDaysFromNow] },
        ],
      },
    });

    console.log(
      `Found ${expiringBusinesses.length} businesses with subscriptions expiring in 7 days`
    );

    for (const business of expiringBusinesses) {
      // Get all users associated with this business
      const users = await User.find({
        businessId: business._id,
        role: { $in: ["business", "staff"] },
      }).select("email firstName lastName");

      console.log(
        `Notifying ${users.length} users for business: ${business.businessName}`
      );

      // Create in-app alert for all users in the business
      await createSubscriptionExpiringAlert(
        business._id,
        business.plan,
        business.subscriptionCurrentPeriodEnd
      );

      // Send email to each user
      for (const user of users) {
        if (user.email) {
          await sendPlanExpirationWarning(
            user.email,
            user.firstName || "Потребител",
            user.lastName || "",
            business.plan,
            business.subscriptionCurrentPeriodEnd,
            business.businessName
          );
        }
      }
    }

    console.log("Subscription expiration check completed successfully");
  } catch (error) {
    console.error("Error checking expiring subscriptions:", error);
  }
}

/**
 * Sets up a daily interval to check for expiring subscriptions.
 * Runs every 24 hours at midnight.
 */
export function startSubscriptionExpirationJob() {
  // Run immediately on startup
  checkExpiringSubscriptions();

  // Schedule to run daily at midnight (00:00)
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    checkExpiringSubscriptions();
    setInterval(checkExpiringSubscriptions, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(
    "Subscription expiration check job started. Next run at midnight."
  );
}
