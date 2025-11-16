import stripe from "../config/stripe.js";
import Business from "../models/Business.js";
import User from "../models/User.js";

export async function getSubscriptionPeriodEnd(stripeSubscriptionId) {
  if (!stripeSubscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (sub?.current_period_end) {
      return new Date(sub.current_period_end * 1000);
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function syncBusinessSubscriptionToAllUsers(
  businessId,
  options = {}
) {
  const { setActivatedAt = false, currentPeriodEnd = null } = options;
  const business = await Business.findById(businessId);
  if (!business) return { matched: 0, modified: 0 };

  const update = {
    subscriptionPlan: business.plan,
    subscriptionStatus: business.subscriptionStatus,
    subscriptionBusinessId: business._id,
  };
  if (setActivatedAt) {
    update.subscriptionActivatedAt = new Date();
  }
  if (currentPeriodEnd) {
    update.subscriptionCurrentPeriodEnd = currentPeriodEnd;
  } else if (business.stripeSubscriptionId) {
    const end = await getSubscriptionPeriodEnd(business.stripeSubscriptionId);
    if (end) update.subscriptionCurrentPeriodEnd = end;
  }

  const result = await User.updateMany(
    { businessId: business._id, role: { $in: ["business", "staff"] } },
    { $set: update }
  );
  return result;
}

export async function syncBusinessSubscriptionToUser(
  userId,
  businessId,
  options = {}
) {
  const { setActivatedAt = false, currentPeriodEnd = null } = options;
  const business = await Business.findById(businessId);
  if (!business) return null;

  const update = {
    subscriptionPlan: business.plan,
    subscriptionStatus: business.subscriptionStatus,
    subscriptionBusinessId: business._id,
  };
  if (setActivatedAt) {
    update.subscriptionActivatedAt = new Date();
  }
  if (currentPeriodEnd) {
    update.subscriptionCurrentPeriodEnd = currentPeriodEnd;
  } else if (business.stripeSubscriptionId) {
    const end = await getSubscriptionPeriodEnd(business.stripeSubscriptionId);
    if (end) update.subscriptionCurrentPeriodEnd = end;
  }

  return User.findByIdAndUpdate(userId, update, { new: true });
}

export async function clearUserSubscription(userId) {
  return User.findByIdAndUpdate(
    userId,
    {
      subscriptionPlan: "none",
      subscriptionStatus: "none",
      subscriptionBusinessId: null,
      subscriptionActivatedAt: null,
      subscriptionCurrentPeriodEnd: null,
    },
    { new: true }
  );
}
