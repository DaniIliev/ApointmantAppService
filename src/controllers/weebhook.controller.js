// src/controllers/webhook.controller.js

import stripe from "../config/stripe.js";
import Business from "../models/Business.js";

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log("Event ", event);
  } catch (err) {
    console.log(`❌ Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data = event.data.object;
  console.log("data", data);
  const eventType = event.type;
  console.log(`Received Stripe Event: ${eventType}`);

  try {
    switch (eventType) {
      case "checkout.session.completed":
        const session = data;
        const businessId = session.metadata.businessId;

        if (
          session.payment_status === "paid" &&
          businessId &&
          session.subscription
        ) {
          await Business.findByIdAndUpdate(businessId, {
            plan: session.metadata.planName,
            subscriptionStatus: "active",
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer,
          });
          console.log(
            `✅ New subscription for Business ${businessId}: ${session.metadata.planName}`
          );
        }
        break;

      case "customer.subscription.updated":
        const subscription = data;
        const status = subscription.status;

        await Business.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          { subscriptionStatus: status }
        );

        console.log(
          `🔄 Subscription ${subscription.id} updated to status: ${status}`
        );
        break;

      case "customer.subscription.deleted":
        // Абонаментът е окончателно прекратен
        const deletedSubscription = data;
        await Business.findOneAndUpdate(
          { stripeSubscriptionId: deletedSubscription.id },
          {
            plan: "Free",
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null, // Премахване на ID-то
          }
        );
        console.log(
          `🛑 Subscription deleted for Business: Downgraded to Free.`
        );
        break;

      case "invoice.payment_failed":
        // Плащането за месечната/годишната такса се е провалило
        console.log(`⚠️ Payment failed for customer ${data.customer}.`);
        break;

      // ----------------------------------------------------
      // ДОБАВЕНИ СЪБИТИЯ ЗА ИГНОРИРАНЕ (Без да се логва 'Unhandled')
      // ----------------------------------------------------
      case "product.created":
      case "price.created":
      case "charge.succeeded":
      case "payment_intent.succeeded":
      case "payment_intent.created":
      case "charge.updated":
      case "customer.created":
      case "customer.updated":
      case "payment_method.attached": // 🆕 Добавено
      case "plan.created": // 🆕 Добавено
      case "invoice.created": // 🆕 Добавено
      case "invoice.finalized": // 🆕 Добавено
      case "invoice.paid": // 🆕 Добавено
      case "invoice.payment_succeeded": // 🆕 Добавено
        // Тези събития са информативни и не изискват действие за абонаментната логика.
        // Просто връщаме 200 OK
        break;

      // ВАЖНО: Вече обработваме "customer.subscription.created" като част от логиката за
      // customer.subscription.updated, затова го премахваме от default:
      case "customer.subscription.created":
        // Това е еквивалентно на checkout.session.completed, но се случва и при API създаване.
        // Може да се обработи тук или да се остави да се обработи от 'updated',
        // но засега го добавяме към break, тъй като 'checkout.session.completed' е основният тригер.
        break;
      // ----------------------------------------------------

      default:
        // Запазваме default за всяко събитие, което може да не сме предвидили.
        console.log(`ℹ️ Unhandled event type: ${eventType}`);
    }

    // 3. Изпращане на успешен отговор към Stripe
    res.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook event:", error);
    res.status(500).json({ error: "Webhook failed to process event." });
  }
};
