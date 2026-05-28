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

    // Защита: Ако бизнесът вече има активен абонамент, прекъсваме създаването на нова checkout сесия.
    if (business.stripeSubscriptionId && business.subscriptionStatus === "active" && business.plan !== "none") {
      return res.status(400).json({
        errorCode: "ALREADY_SUBSCRIBED",
        message: "You already have an active subscription. Please use the Customer Portal to change your plan."
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

/**
 * Creates a Stripe Customer Portal session for managing subscriptions (upgrades, downgrades, cancellations).
 */
export const createCustomerPortalSession = async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({
      errorCode: "STRIPE_NOT_CONFIGURED",
      message: "Stripe is not configured on the server."
    });
  }

  const businessId = req.user.businessId;

  try {
    const business = await Business.findById(businessId);
    if (!business || !business.stripeCustomerId) {
      return res.status(404).json({
        errorCode: "CUSTOMER_NOT_FOUND",
        message: "Business or Stripe Customer not found. You must be subscribed first."
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: `${FRONDEND_REDIRECT_URL}/pricing`,
    });

    res.json({
      message: "Customer Portal session created successfully.",
      data: { url: session.url }
    });
  } catch (error) {
    console.error("Error creating customer portal session:", error);
    res.status(500).json({
      errorCode: "CUSTOMER_PORTAL_FAILED",
      message: "Failed to create customer portal session.",
      details: error.message
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

/**
 * Cancel an active subscription for a business.
 */
export const cancelSubscription = async (req, res) => {
  const stripe = getStripe();
  const businessId = req.user.businessId;

  try {
    const business = await Business.findById(businessId);
    if (!business || !business.stripeSubscriptionId) {
      return res.status(404).json({
        errorCode: "SUBSCRIPTION_NOT_FOUND",
        message: "No active subscription found for this business.",
      });
    }

    // Cancel at period end to allow usage until the end of the paid cycle
    const subscription = await stripe.subscriptions.update(
      business.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    // Update local business status
    business.subscriptionStatus = "canceled";
    await business.save();

    res.json({
      message: "Subscription will be canceled at the end of the current period.",
      subscription,
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({
      errorCode: "CANCEL_SUBSCRIPTION_FAILED",
      message: "Failed to cancel subscription.",
      details: error.message,
    });
  }
};

/**
 * List all invoices for a business from Stripe.
 */
export const listInvoices = async (req, res) => {
  const stripe = getStripe();
  const businessId = req.user.businessId;

  try {
    const business = await Business.findById(businessId);
    if (!business || !business.stripeCustomerId) {
      return res.json({ invoices: [], defaultPaymentMethod: null });
    }

    // Fetch customer to get default payment method
    let defaultPaymentMethod = null;
    try {
      // 1. Try to get from Customer's default invoice settings
      const customer = await stripe.customers.retrieve(business.stripeCustomerId, {
        expand: ["invoice_settings.default_payment_method"],
      });

      let pm = customer.invoice_settings?.default_payment_method;

      // 2. If not found, try to get from the Subscription itself
      if ((!pm || typeof pm === "string") && business.stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId, {
          expand: ["default_payment_method"],
        });
        if (subscription.default_payment_method && typeof subscription.default_payment_method !== "string") {
          pm = subscription.default_payment_method;
        }
      }

      // 3. If still not found, get the most recent payment method attached to the customer
      if (!pm || typeof pm === "string") {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: business.stripeCustomerId,
          type: "card",
          limit: 1,
        });
        if (paymentMethods.data.length > 0) {
          pm = paymentMethods.data[0];
        }
      }

      if (pm && typeof pm !== "string") {
        defaultPaymentMethod = {
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        };
      }
    } catch (custError) {
      console.error("Failed to fetch customer payment method:", custError);
    }

    const invoices = await stripe.invoices.list({
      customer: business.stripeCustomerId,
      limit: 24, // Last 2 years if monthly
    });

    // Safety sync: If planExpiresAt is missing but we have a subscription, update it
    if (!business.planExpiresAt && business.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
        business.planExpiresAt = new Date(subscription.current_period_end * 1000);
        await business.save();
      } catch (subError) {
        console.error("Failed to safety sync subscription end:", subError);
      }
    }

    res.json({
      defaultPaymentMethod,
      invoices: invoices.data.map((inv) => {
        // If the invoice-level period is just a single day/moment, 
        // try to get a more descriptive period from the first line item (usually the subscription)
        let pStart = inv.period_start;
        let pEnd = inv.period_end;

        if ((pEnd - pStart) < 86400 && inv.lines?.data?.length > 0) {
          const firstLine = inv.lines.data[0];
          if (firstLine.period) {
            pStart = firstLine.period.start;
            pEnd = firstLine.period.end;
          }
        }

        return {
          id: inv.id,
          number: inv.number,
          amount_paid: inv.amount_paid,
          currency: inv.currency,
          status: inv.status,
          created: inv.created,
          hosted_invoice_url: inv.hosted_invoice_url,
          invoice_pdf: inv.invoice_pdf,
          period_start: pStart,
          period_end: pEnd,
        };
      }),
    });
  } catch (error) {
    console.error("Error listing invoices:", error);
    res.status(500).json({
      errorCode: "LIST_INVOICES_FAILED",
      message: "Failed to fetch payment history.",
      details: error.message,
    });
  }
};

