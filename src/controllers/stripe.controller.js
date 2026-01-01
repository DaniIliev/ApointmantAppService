import { getStripe, requireStripe } from "../config/stripe.js";
import Business from "../models/Business.js";

const FIRST_TIME_PROMO_CODE = process.env.STRIPE_FIRST_TIME_PROMO_CODE;
const FRONDEND_REDIRECT_URL =
  process.env.CLIENT_URL || "http://localhost:3000" || process.env.STAGING;

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
  // If placeholder price IDs are used, ensure environment variables are configured in production.

  try {
    // Validate price currency at runtime
    const priceInfo = await stripe.prices.retrieve(priceId);

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Бизнесът не е намерен." });
    }

    const isFirstTimeSubscriber = !business.stripeCustomerId;
    const customerId = business.stripeCustomerId;
    const customerEmail = business.email;

    if (isFirstTimeSubscriber) {
      // Let Stripe create the customer via customer_email to avoid defaulting to unsupported currency.
    }

    // Подготовка на опциите за сесия
    const sessionOptions = {
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ...(customerId && { customer: customerId }),
      ...(isFirstTimeSubscriber && { customer_email: customerEmail }),
      metadata: {
        businessId: businessId,
        planName: planName,
        isFirstPurchase: isFirstTimeSubscriber ? "true" : "false",
      },
      success_url: `${FRONDEND_REDIRECT_URL}/dashboard`,
      cancel_url: `${FRONDEND_REDIRECT_URL}/for-bussiness`,
    };

    // Добавяне на промо код само ако е дефиниран и потребителят е нов
    if (isFirstTimeSubscriber && FIRST_TIME_PROMO_CODE) {
      sessionOptions.discounts = [{ promotion_code: FIRST_TIME_PROMO_CODE }];
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    res.json({ url: session.url });
  } catch (error) {
    // Специално съобщение за валута
    if (error.message && error.message.includes("currency")) {
      return res.status(400).json({
        error: "Грешка с валутата на плана.",
        details:
          "Моля, уверете се, че цените в Stripe са създадени с EUR валута.",
        stripeError: error.message,
      });
    }

    res.status(500).json({
      error: "Неуспешно създаване на сесия за плащане.",
      details: error.message,
    });
  }
};
