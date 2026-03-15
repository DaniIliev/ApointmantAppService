import Alert from "../models/Alert.js";
import User from "../models/User.js";
import Business from "../models/Business.js";
import { io } from "../index.js";

/**
 * Create an alert for all users in a business when a subscription is purchased
 */
export async function createSubscriptionPurchasedAlert(businessId, planName) {
  try {
    const business = await Business.findById(businessId);
    if (!business) return;

    const users = await User.find({
      businessId: businessId,
      role: { $in: ["business", "staff"] },
    });

    const message = `Новият план ${planName} е активиран за ${business.businessName}!`;

    const alerts = await Promise.all(
      users.map((user) =>
        Alert.create({
          staff: user._id,
          businessId: businessId,
          type: "subscription_purchased",
          message: message,
          isRead: false,
        })
      )
    );
    // Emit socket event to all users in the business
    users.forEach((user) => {
      io.to(String(user._id)).emit("newAlert", {
        type: "subscription_purchased",
        message: message,
        businessName: business.businessName,
        planName: planName,
      });
    });

    console.log(
      `Created ${alerts.length} alerts for subscription purchase: ${planName}`
    );
    return alerts;
  } catch (error) {
    console.error("Error creating subscription purchased alerts:", error);
  }
}

/**
 * Create an alert for all users in a business when their subscription is expiring in 7 days
 */
export async function createSubscriptionExpiringAlert(
  businessId,
  planName,
  expirationDate
) {
  try {
    const business = await Business.findById(businessId);
    if (!business) return;

    const users = await User.find({
      businessId: businessId,
      role: { $in: ["business", "staff"] },
    });

    const formattedDate = new Date(expirationDate).toLocaleDateString("bg-BG");
    const message = `Вашият план ${planName} изтича на ${formattedDate}. Моля, обновете абонамента си.`;

    const alerts = await Promise.all(
      users.map((user) =>
        Alert.create({
          staff: user._id,
          businessId: businessId,
          type: "subscription_expiring",
          message: message,
          isRead: false,
        })
      )
    );

    // Emit socket event to all users in the business
    users.forEach((user) => {
      io.to(String(user._id)).emit("newAlert", {
        type: "subscription_expiring",
        message: message,
        businessName: business.businessName,
        planName: planName,
        expirationDate: expirationDate,
      });
    });
    return alerts;
  } catch (error) {
    console.error("Error creating subscription expiring alerts:", error);
  }
}
