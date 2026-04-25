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
      errorCode: "STRIPE_NOT_CONFIGURED",
      message: "Stripe is not configured on the server. Missing STRIPE_SECRET_KEY."
    });
  }

  if (!planName || !businessId) {
    return res.status(400).json({ 
      errorCode: "MISSING_REQUIRED_FIELDS",
      message: "planName or businessId is missing." 
    });
  }

  const priceId = PLAN_PRICE_MAP[planName];

  if (!priceId) {
    return res.status(400).json({ 
      errorCode: "INVALID_PLAN",
      message: "Invalid plan name." 
    });
  }
  // If placeholder price IDs are used, ensure environment variables are configured in production.

  try {
    // Validate price currency at runtime
    const priceInfo = await stripe.prices.retrieve(priceId);

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ 
        errorCode: "BUSINESS_NOT_FOUND",
        message: "Business not found." 
      });
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
      success_url: `${FRONDEND_REDIRECT_URL}/pricing/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONDEND_REDIRECT_URL}/pricing/payment-failed`,
    };

    // Добавяне на промо код само ако е дефиниран и потребителят е нов
    if (isFirstTimeSubscriber && FIRST_TIME_PROMO_CODE) {
      sessionOptions.discounts = [{ promotion_code: FIRST_TIME_PROMO_CODE }];
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    res.json({
      message: "Checkout session created successfully.",
      messageCode: "STRIPE_SESSION_CREATED",
      data: { url: session.url }
    });
  } catch (error) {
    // Специално съобщение за валута
    if (error.message && error.message.includes("currency")) {
      return res.status(400).json({
        errorCode: "CURRENCY_ERROR",
        message: "Currency error with the plan. Please ensure Stripe prices are in EUR.",
        details: error.message,
      });
    }

    res.status(500).json({
      errorCode: "STRIPE_SESSION_FAILED",
      message: "Failed to create checkout session.",
      details: error.message,
    });
  }
};

export const getCheckoutInvoiceLink = async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ 
      errorCode: "MISSING_REQUIRED_FIELDS",
      message: "Missing sessionId query param." 
    });
  }

  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({
      errorCode: "STRIPE_NOT_CONFIGURED",
      message: "Stripe is not configured on the server. Missing STRIPE_SECRET_KEY.",
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.latest_invoice", "invoice"],
    });

    const sessionBusinessId = session?.metadata?.businessId;
    const requesterBusinessId = req.user?.businessId;
    if (
      !sessionBusinessId ||
      !requesterBusinessId ||
      String(sessionBusinessId) !== String(requesterBusinessId)
    ) {
      return res.status(403).json({ 
        errorCode: "UNAUTHORIZED_ACTION",
        message: "Forbidden" 
      });
    }

    let invoice = session.invoice || session?.subscription?.latest_invoice;

    if (typeof invoice === "string") {
      invoice = await stripe.invoices.retrieve(invoice);
    }

    const invoiceUrl = invoice?.hosted_invoice_url || invoice?.invoice_pdf;

    if (!invoiceUrl) {
      return res.status(404).json({
        errorCode: "INVOICE_NOT_AVAILABLE",
        message: "Invoice is not available yet. Please try again in a few moments.",
      });
    }

    return res.json({ invoiceUrl });
  } catch (error) {
    return res.status(500).json({
      errorCode: "FETCH_INVOICE_FAILED",
      message: "Failed to load Stripe invoice.",
      details: error.message,
    });
  }
};
