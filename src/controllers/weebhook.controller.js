import { getStripe, requireStripe } from "../config/stripe.js";
import Business from "../models/Business.js";
import User from "../models/User.js";
import {
  getSubscriptionPeriodEnd,
  syncBusinessSubscriptionToAllUsers,
} from "../utils/subscriptionSync.js";
import { createSubscriptionPurchasedAlert } from "../utils/alertService.js";

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  const stripe = getStripe();
  if (!stripe) {
    console.log(
      "❌ [SUBSCRIPTION WEBHOOK] Stripe not configured: missing STRIPE_SECRET_KEY"
    );
    return res.status(500).json({
      errorCode: "STRIPE_NOT_CONFIGURED",
      message: "Stripe not configured: missing STRIPE_SECRET_KEY.",
    });
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log(`✅ [SUBSCRIPTION WEBHOOK] Event verified: ${event.type}`);
  } catch (err) {
    console.error(
      `❌ [SUBSCRIPTION WEBHOOK] Signature verification failed: ${err.message}`
    );
    return res.status(400).json({
      errorCode: "WEBHOOK_SIGNATURE_FAILED",
      message: "Webhook signature verification failed.",
      details: err.message,
    });
  }

  const data = event.data.object;
  const eventType = event.type;

  try {
    console.log(`📋 [SUBSCRIPTION WEBHOOK] Processing event type: ${eventType}`);

    switch (eventType) {
      /**
       * 1. Checkout completed successfully.
       * This is the initial purchase of a subscription.
       */
      case "checkout.session.completed": {
        const session = data;
        const businessId = session.metadata?.businessId;
        console.log(`🛒 [SUBSCRIPTION] Checkout completed for business: ${businessId}`);

        if (session.payment_status === "paid" && businessId && session.subscription) {
          // Determine current period end to sync permissions
          const currentPeriodEnd = await getSubscriptionPeriodEnd(session.subscription);

          const updatedBusiness = await Business.findByIdAndUpdate(
            businessId,
            {
              plan: session.metadata.planName,
              subscriptionStatus: "active",
              stripeSubscriptionId: session.subscription,
              stripeCustomerId: session.customer,
              planExpiresAt: currentPeriodEnd || null,
            },
            { new: true }
          );

          // Mirror subscription status to all users associated with this business
          await syncBusinessSubscriptionToAllUsers(updatedBusiness._id, {
            setActivatedAt: true,
            currentPeriodEnd: currentPeriodEnd || null,
          });

          // Create a notification for the business owner/staff
          await createSubscriptionPurchasedAlert(updatedBusiness._id, session.metadata.planName);

          console.log(`✅ New subscription for Business ${businessId}: ${session.metadata.planName}`);
        }
        break;
      }

      /**
       * 2. Subscription updated.
       * Fired on every renewal, upgrade, downgrade, or status change (e.g., past_due).
       */
      case "customer.subscription.updated": {
        const subscription = data;
        const status = subscription.status;

        const updatedBusiness = await Business.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          { subscriptionStatus: status },
          { new: true }
        );

        if (updatedBusiness?._id) {
          const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null;

          // Update Business model expiration as well
          await Business.findByIdAndUpdate(updatedBusiness._id, {
            planExpiresAt: currentPeriodEnd,
          });

          await syncBusinessSubscriptionToAllUsers(updatedBusiness._id, {
            setActivatedAt: false,
            currentPeriodEnd,
          });
        }

        console.log(`✅ Subscription ${subscription.id} updated to status: ${status}`);
        break;
      }

      /**
       * 3. Subscription deleted.
       * Fired when a subscription is fully cancelled or expires after non-payment.
       */
      case "customer.subscription.deleted": {
        const deletedSubscription = data;
        const downgraded = await Business.findOneAndUpdate(
          { stripeSubscriptionId: deletedSubscription.id },
          {
            plan: "none",
            subscriptionStatus: "none",
            stripeSubscriptionId: null,
          }
        );

        if (downgraded?._id) {
          await syncBusinessSubscriptionToAllUsers(downgraded._id, {
            setActivatedAt: false,
            currentPeriodEnd: null,
          });
        }
        console.log(`🛑 Subscription deleted for Business: Downgraded to Free.`);
        break;
      }

      /**
       * 4. Recurring payment failed.
       * Fired when a monthly/annual payment fails.
       */
      case "invoice.payment_failed": {
        console.log(`⚠️ Payment failed for customer ${data.customer}.`);
        // Note: Stripe will automatically retry based on settings, 
        // eventually moving the subscription to 'past_due' or 'canceled'.
        break;
      }

      default:
        // Other events are ignored as they are not critical for our local state sync
        // console.log(`ℹ️ Unhandled event type: ${eventType}`);
        break;
    }

    // Acknowledge receipt of the event
    res.json({ received: true });
  } catch (error) {
    console.error("❌ Error processing webhook event:", error);
    res.status(500).json({
      errorCode: "WEBHOOK_PROCESSING_FAILED",
      message: "Webhook failed to process event.",
    });
  }
};
