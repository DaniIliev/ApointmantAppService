import User from "../models/User.js";
import Business from "../models/Business.js";
import { sendPlanExpirationWarning } from "../utils/EmailService.js";
import { createSubscriptionExpiringAlert } from "../utils/alertService.js";
import { getLanguageFromBusiness } from "../utils/LanguageHelper.js";
import cron from "node-cron";

/**
 * Checks for subscriptions expiring in a specific range of days and sends warnings.
 */
async function notifyExpiringSubscriptions(startDays, endDays, label) {
  const now = new Date();
  const startWindow = new Date(now.getTime() + startDays * 24 * 60 * 60 * 1000);
  const endWindow = new Date(now.getTime() + endDays * 24 * 60 * 60 * 1000);

console.log(`[SubscriptionJob] Checking ${label}: ${startWindow.toLocaleString('bg-BG')} to ${endWindow.toLocaleString('bg-BG')}`);

  try {
    // We search the User collection because subscriptionCurrentPeriodEnd is stored there
    // specifically for the 'business' owner.
    const expiringUsers = await User.find({
      role: "business",
      subscriptionStatus: { $in: ["active", "past_due", "canceled"] },
      subscriptionPlan: { $ne: "none" },
      subscriptionCurrentPeriodEnd: {
        $gte: startWindow,
        $lt: endWindow,
      },
    });

    console.log(`[SubscriptionJob] ${label}: Found ${expiringUsers.length} expiring owners.`);

    for (const owner of expiringUsers) {
      if (!owner.businessId) continue;

      const business = await Business.findById(owner.businessId);
      if (!business) continue;

      const language = await getLanguageFromBusiness(business._id);

      // Get all users associated with this business (including staff)
      const users = await User.find({
        businessId: business._id,
        role: { $in: ["business", "staff"] },
      }).select("email firstName lastName");

      console.log(`[SubscriptionJob] Notifying ${users.length} users for business: ${business.businessName} (${label})`);

      await createSubscriptionExpiringAlert(
        business._id,
        owner.subscriptionPlan,
        owner.subscriptionCurrentPeriodEnd
      );

      for (const user of users) {
        if (user.email) {
          await sendPlanExpirationWarning(
            user.email,
            user.firstName || "Потребител",
            user.lastName || "",
            owner.subscriptionPlan,
            owner.subscriptionCurrentPeriodEnd,
            business.businessName,
            language
          );
        }
      }
    }
  } catch (error) {
    console.error(`[SubscriptionJob] Error in ${label}:`, error);
  }
}

/**
 * Main function to check for upcoming expirations.
 */
export async function checkExpiringSubscriptions() {
  console.log(`[SubscriptionJob] Starting expiration checks at ${new Date().toISOString()}`);
  
  // 1-day warning: anything expiring in the next 24 hours
  await notifyExpiringSubscriptions(0, 1, "Expires within 24h");
  
  // 7-day warning: anything expiring between 6 and 7 days from now
  await notifyExpiringSubscriptions(6, 7, "Expires in 7 days");
}

/**
 * Resets status to "none" for users and businesses whose subscription has expired.
 */
export async function resetExpiredSubscriptions() {
  try {
    const now = new Date();
    
    // 1. Find all business owners whose subscription has expired
    const expiredOwners = await User.find({
      role: "business",
      subscriptionCurrentPeriodEnd: { $lt: now },
      subscriptionStatus: { $ne: "none" }
    });

    console.log(`[SubscriptionJob] Found ${expiredOwners.length} owners with expired subscriptions.`);

    let resetUsersCount = 0;
    let resetBusinessesCount = 0;

    for (const owner of expiredOwners) {
      // Reset the owner
      owner.subscriptionPlan = "none";
      owner.subscriptionStatus = "none";
      owner.subscriptionBusinessId = null;
      owner.subscriptionActivatedAt = null;
      owner.subscriptionCurrentPeriodEnd = null;
      await owner.save();
      resetUsersCount++;

      if (owner.businessId) {
        // Reset the business
        await Business.findByIdAndUpdate(owner.businessId, {
          plan: "none",
          subscriptionStatus: "none",
          stripeSubscriptionId: null,
          // If Business model had planExpiresAt, reset it too
          planExpiresAt: null
        });
        resetBusinessesCount++;

        // Reset all staff and other users in the business
        const staffUpdate = await User.updateMany(
          { businessId: owner.businessId, _id: { $ne: owner._id } },
          {
            $set: {
              subscriptionPlan: "none",
              subscriptionStatus: "none",
              subscriptionBusinessId: null,
              subscriptionActivatedAt: null,
              subscriptionCurrentPeriodEnd: null
            }
          }
        );
        resetUsersCount += staffUpdate.modifiedCount;
      }
    }

    console.log(`[SubscriptionJob] Successfully reset ${resetUsersCount} users and ${resetBusinessesCount} businesses.`);
    return { users: resetUsersCount, businesses: resetBusinessesCount };
  } catch (error) {
    console.error("[SubscriptionJob] Error in resetExpiredSubscriptions:", error);
  }
}

/**
 * Combined function to run all subscription-related checks.
 * Can be called manually.
 */
export async function runFullSubscriptionCheck() {
  await resetExpiredSubscriptions();
  await checkExpiringSubscriptions();
  console.log("[SubscriptionJob] Full check completed.");
}

/**
 * Starts the daily cron job.
 */
export function startSubscriptionExpirationJob() {
  // Schedule to run daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("[Cron] Running daily subscription checks...");
    await runFullSubscriptionCheck();
  });

  console.log("[SubscriptionJob] Cron job scheduled: daily at midnight.");
  
  // Optional: run once on startup
  runFullSubscriptionCheck();
}
