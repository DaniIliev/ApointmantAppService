import { getStripe, requireStripe } from "../config/stripe.js";
import Business from "../models/Business.js";

const FIRST_TIME_PROMO_CODE = process.env.STRIPE_FIRST_TIME_PROMO_CODE;
const FRONDEND_REDIRECT_URL = process.env.CLIENT_URL || "http://localhost:3000";

const PLAN_PRICE_MAP = {
  Starter_Monthly:
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || "price_1StarterMonthlyEUR",
  Professional_Monthly:
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "price_1ProMonthlyEUR",
  Enterprise_Monthly:
    process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID ||
    "price_1EnterpriseMonthlyEUR",
  Starter_Annual:
    process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || "price_1StarterAnnualEUR",
  Professional_Annual:
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID || "price_1ProAnnualEUR",
  Enterprise_Annual:
    process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID ||
    "price_1EnterpriseAnnualEUR",
};

export const createCheckoutSession = async (req, res) => {
  const { planName, businessId } = req.body;
  console.log(
    `Attempting checkout for Plan: ${planName}, Business: ${businessId}`
  );

  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({
      error:
        "Stripe is not configured on the server. Missing STRIPE_SECRET_KEY.",
    });
  }

  if (!planName || !businessId) {
    return res.status(400).json({ error: "Липсва planName или businessId." });
  }

  const priceId = PLAN_PRICE_MAP[planName];

  if (!priceId) {
    return res.status(400).json({ error: "Невалидно име на план." });
  }
  if (
    priceId.startsWith("price_1") &&
    !process.env.STRIPE_PRO_MONTHLY_PRICE_ID
  ) {
    console.warn(
      `⚠️ ВНИМАНИЕ: Използва се placeholder Price ID (${priceId}) за план: ${planName}. Уверете се, че сте задали променливите на средата за продукция.`
    );
  }

  try {
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Бизнесът не е намерен." });
    }

    const isFirstTimeSubscriber = !business.stripeCustomerId;
    let customerId = business.stripeCustomerId;
    let promotionCode;

    if (isFirstTimeSubscriber) {
      console.log(
        `ℹ️ First-time subscriber detected for Business: ${businessId}. Applying 50% discount.`
      );
      const customer = await stripe.customers.create({
        email: business.email,
        metadata: { businessId: businessId },
      });
      customerId = customer.id;
      promotionCode = isFirstTimeSubscriber ? FIRST_TIME_PROMO_CODE : null;

      await Business.findByIdAndUpdate(businessId, {
        stripeCustomerId: customerId,
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: customerId,

      ...(isFirstTimeSubscriber && {
        discounts: [{ promotion_code: promotionCode }],
      }),

      // 7. Метаданни
      metadata: {
        businessId: businessId,
        planName: planName,
        isFirstPurchase: isFirstTimeSubscriber ? "true" : "false",
      },

      success_url: `${FRONDEND_REDIRECT_URL}/dashboard`,
      cancel_url: `${FRONDEND_REDIRECT_URL}/for-bussiness`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Грешка при създаване на Stripe Checkout сесия:", error);
    res.status(500).json({ error: "Неуспешно създаване на сесия за плащане." });
  }
};
