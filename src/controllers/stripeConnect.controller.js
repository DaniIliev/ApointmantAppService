import { requireStripe } from "../config/stripe.js";
import Business from "../models/Business.js";
import {
  sendPaymentAuthorizationEmail,
  sendPaymentCapturedEmail,
} from "../utils/EmailService.js";

/**
 * Създава или връща Stripe Connect Account Link за onboarding
 * Използва се когато бизнесът иска да приеме плащания с карта
 */
export const createConnectAccountLink = async (req, res, next) => {
  try {
    const stripe = requireStripe();
    const userId = req.user.id;
    const { returnUrl, refreshUrl } = req.body;

    // Намираме бизнеса на текущия потребител
    const business = await Business.findOne({ owner: userId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    let accountId = business.stripeConnectAccountId;

    // Ако няма Connect Account, създаваме нов
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express", // Express е най-подходящ за платформи
        country: "BG", // България - промени според нуждите
        email: business.email || req.user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual", // Или 'company' в зависимост от случая
        business_profile: {
          name: business.businessName,
          url: business.website || undefined,
        },
      });

      accountId = account.id;

      // Записваме Account ID в базата данни
      business.stripeConnectAccountId = accountId;
      await business.save();
    }

    // Създаваме Account Link за onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url:
        refreshUrl || `${process.env.FRONTEND_URL}/settings/payments`,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/settings/payments`,
      type: "account_onboarding",
    });

    res.json({
      url: accountLink.url,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error("Error creating Connect account link:", error);
    next(error);
  }
};

/**
 * Проверява статуса на Stripe Connect акаунта
 * Връща дали бизнесът е готов да приема плащания
 */
export const getConnectAccountStatus = async (req, res, next) => {
  try {
    const stripe = requireStripe();
    const userId = req.user.id;

    const business = await Business.findOne({ owner: userId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Ако няма Connect Account, значи не е конфигуриран
    if (!business.stripeConnectAccountId) {
      return res.json({
        configured: false,
        ready: false,
        details_submitted: false,
        charges_enabled: false,
        message: "Stripe Connect account not yet created",
      });
    }

    // Извличаме информация за акаунта от Stripe
    const account = await stripe.accounts.retrieve(
      business.stripeConnectAccountId
    );

    const ready = account.charges_enabled && account.details_submitted;

    res.json({
      configured: true,
      ready: ready,
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      requirements: account.requirements,
      accountId: account.id,
    });
  } catch (error) {
    console.error("Error checking Connect account status:", error);
    next(error);
  }
};

/**
 * Създава Checkout Session за плащане
 * Използва Direct Charges модела на Stripe Connect
 */
export const createCheckoutSession = async (req, res, next) => {
  try {
    const stripe = requireStripe();
    const { serviceId, appointmentData, successUrl, cancelUrl } = req.body;

    // Намираме услугата и бизнеса
    const Service = (await import("../models/Service.js")).default;
    const service = await Service.findById(serviceId).populate("business");

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    const business = service.business;

    if (!business.stripeConnectAccountId) {
      return res.status(400).json({
        message: "Business has not configured Stripe Connect",
      });
    }

    // Проверяваме дали акаунтът е готов за плащания
    const account = await stripe.accounts.retrieve(
      business.stripeConnectAccountId
    );

    if (!account.charges_enabled) {
      return res.status(400).json({
        message: "Business Stripe account is not ready to accept payments",
      });
    }

    // Изчисляваме таксата на платформата (например 10% или фиксирана сума)
    const platformFeePercent = parseFloat(
      process.env.PLATFORM_FEE_PERCENT || "10"
    );
    const applicationFeeAmount = Math.round(
      (service.price * platformFeePercent) / 100
    );

    // Създаваме Checkout Session
    // ВАЖНО: Плащането се прави ДИРЕКТНО на Connected Account (не през platform)
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: service.name,
                description: service.description || undefined,
                images: service.imageUrl ? [service.imageUrl] : undefined,
              },
              unit_amount: Math.round(service.price * 100), // Stripe работи в стотинки
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          capture_method: "manual", // authorize now, capture after approval
          application_fee_amount: applicationFeeAmount, // Platform fee
          metadata: {
            serviceId: serviceId,
            businessId: business._id.toString(),
            appointmentData: JSON.stringify(appointmentData || {}),
            appointmentId: appointmentData?.appointmentId || "",
          },
        },
        success_url:
          successUrl ||
          `${process.env.FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/booking/cancel`,
        metadata: {
          serviceId: serviceId,
          businessId: business._id.toString(),
          appointmentId: appointmentData?.appointmentId || "",
        },
      },
      {
        stripeAccount: business.stripeConnectAccountId, // Плащането е ОТ/КЪМ Connected Account
      }
    );

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    next(error);
  }
};

/**
 * Dashboard Link - позволява на бизнеса да види своя Stripe Dashboard
 */
export const createDashboardLink = async (req, res, next) => {
  try {
    const stripe = requireStripe();
    const userId = req.user.id;

    const business = await Business.findOne({ owner: userId });
    if (!business || !business.stripeConnectAccountId) {
      return res.status(404).json({
        message: "Stripe Connect account not found",
      });
    }

    const loginLink = await stripe.accounts.createLoginLink(
      business.stripeConnectAccountId
    );

    res.json({
      url: loginLink.url,
    });
  } catch (error) {
    console.error("Error creating dashboard link:", error);
    next(error);
  }
};

/**
 * v2 Webhook handler за Stripe Connect events
 * Обработва v2.core събития като account.updated, payment_intent.succeeded и т.н.
 */
export const handleConnectWebhook = async (req, res, next) => {
  try {
    const stripe = requireStripe();
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    console.log("Handling Stripe Connect v2 webhook event");
    if (!webhookSecret) {
      console.error("Stripe Connect webhook secret not configured");
      return res.status(400).send("Webhook secret not configured");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // v2 събитията имат префикс "v2.core."
    switch (event.type) {
      case "v2.core.account.updated":
        const account = event.data.object;
        await handleAccountUpdated(account);
        break;

      case "v2.core.payment_intent.amount_capturable_updated":
        await handlePaymentAuthorized(event.data.object);
        break;

      case "v2.core.payment_intent.succeeded":
        const paymentIntent = event.data.object;
        await handlePaymentSucceeded(paymentIntent);
        break;

      case "v2.core.checkout.session.completed":
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;

      // Ignored events
      case "v2.core.account.created":
      case "v2.core.account.closed":
      case "v2.core.account_person.created":
      case "v2.core.account_person.updated":
      case "v2.core.account_person.deleted":
      case "v2.core.charge.succeeded":
      case "v2.core.charge.updated":
      case "v2.core.payment_intent.created":
        // Informational events - no action needed
        break;

      default:
        console.log(`Unhandled v2 event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Error handling webhook:", error);
    next(error);
  }
};

// Helper функции за webhook обработка

async function handleAccountUpdated(account) {
  try {
    const business = await Business.findOne({
      stripeConnectAccountId: account.id,
    });

    if (business) {
      business.stripeConnectChargesEnabled = account.charges_enabled;
      business.stripeConnectDetailsSubmitted = account.details_submitted;
      await business.save();
      console.log(`Updated business ${business._id} Stripe status`);
    }
  } catch (error) {
    console.error("Error in handleAccountUpdated:", error);
  }
}

async function handlePaymentSucceeded(paymentIntent) {
  try {
    const { serviceId, appointmentData, appointmentId } =
      paymentIntent.metadata || {};

    console.log(
      `Payment succeeded for service ${serviceId}, amount: ${paymentIntent.amount}`
    );

    const Appointment = (await import("../models/Appointment.js")).default;
    const appt = appointmentId
      ? await Appointment.findById(appointmentId).populate("service business")
      : await Appointment.findOne({
          stripePaymentIntentId: paymentIntent.id,
        }).populate("service business");

    // Ако имаме съществуващ appointment - маркираме като captured
    if (appt) {
      appt.paymentStatus = "captured";
      appt.stripePaymentIntentId = paymentIntent.id;
      appt.stripePaymentMethodId = paymentIntent.payment_method;
      appt.stripePaymentAmount = paymentIntent.amount_received;
      await appt.save();
      if (appt.email) {
        await sendPaymentCapturedEmail(
          appt.email,
          appt.clientName,
          appt.service?.name || "Услуга",
          appt.business?.businessName || "Вашият бизнес",
          paymentIntent.amount_received,
          paymentIntent.currency || "eur"
        );
      }
      return;
    }

    // Ако няма съществуващ appointment, можем да го създадем от metadata (fallback)
    if (appointmentData) {
      const data = JSON.parse(appointmentData);
      const created = await Appointment.create({
        ...data,
        status: "confirmed",
        paymentStatus: "captured",
        stripePaymentIntentId: paymentIntent.id,
        stripePaymentMethodId: paymentIntent.payment_method,
        stripePaymentAmount: paymentIntent.amount_received,
      });
      console.log(`Created appointment ${created._id} after payment capture`);
    }
  } catch (error) {
    console.error("Error in handlePaymentSucceeded:", error);
  }
}

async function handlePaymentAuthorized(paymentIntent) {
  try {
    const appointmentId = paymentIntent.metadata?.appointmentId;
    const Appointment = (await import("../models/Appointment.js")).default;
    const appt = appointmentId
      ? await Appointment.findById(appointmentId).populate("service business")
      : await Appointment.findOne({
          stripePaymentIntentId: paymentIntent.id,
        }).populate("service business");

    if (!appt) return;

    appt.stripePaymentIntentId = paymentIntent.id;
    appt.stripePaymentMethodId = paymentIntent.payment_method;
    appt.stripePaymentAmount = paymentIntent.amount;
    appt.paymentStatus = "authorized";
    await appt.save();
    if (appt.email) {
      await sendPaymentAuthorizationEmail(
        appt.email,
        appt.clientName,
        appt.service?.name || "Услуга",
        appt.business?.businessName || "Вашият бизнес",
        paymentIntent.amount,
        paymentIntent.currency || "eur"
      );
    }
  } catch (error) {
    console.error("Error in handlePaymentAuthorized:", error);
  }
}

async function handleCheckoutCompleted(session) {
  try {
    console.log(`Checkout session completed: ${session.id}`);

    const { appointmentId, serviceId, businessId } = session.metadata || {};

    // Ако вече има appointmentId в metadata, appointment е създаден преди checkout
    // В този случай само чакаме authorization event
    if (appointmentId) {
      console.log(
        `Appointment ${appointmentId} already exists, waiting for authorization`
      );
      return;
    }

    // Ако няма appointmentId, значи трябва да създадем appointment след успешен checkout
    // Извличаме payment intent за да вземем metadata
    const stripe = requireStripe();
    const paymentIntentId = session.payment_intent;

    if (!paymentIntentId) {
      console.error("No payment intent found in session");
      return;
    }

    // Намираме бизнеса за да извлечем Connected Account
    const business = await Business.findById(businessId);
    if (!business?.stripeConnectAccountId) {
      console.error(
        `Business ${businessId} not found or no Stripe Connect account`
      );
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { stripeAccount: business.stripeConnectAccountId }
    );

    const appointmentData = paymentIntent.metadata?.appointmentData;

    if (!appointmentData) {
      console.error("No appointment data in payment intent metadata");
      return;
    }

    // Създаваме appointment с pending status и authorized payment
    const Appointment = (await import("../models/Appointment.js")).default;
    const data = JSON.parse(appointmentData);

    const appointment = await Appointment.create({
      ...data,
      business: businessId,
      service: serviceId,
      status: "pending", // Чакаме одобрение от owner/staff
      paymentStatus: "authorized", // Картата е authorized, но не е charged
      stripePaymentIntentId: paymentIntent.id,
      stripePaymentMethodId: paymentIntent.payment_method,
      stripePaymentAmount: paymentIntent.amount,
    });

    console.log(
      `Created appointment ${appointment._id} after checkout - status: pending, payment: authorized`
    );

    // Изпращаме email за успешна авторизация
    if (appointment.email) {
      const Service = (await import("../models/Service.js")).default;
      const service = await Service.findById(serviceId);

      await sendPaymentAuthorizationEmail(
        appointment.email,
        appointment.clientName,
        service?.name || "Услуга",
        business?.businessName || "Вашият бизнес",
        paymentIntent.amount,
        paymentIntent.currency || "eur"
      );
    }

    // Създаваме Alert за staff
    const Alert = (await import("../models/Alert.js")).default;
    const Service = (await import("../models/Service.js")).default;
    const service = await Service.findById(serviceId);

    await Alert.create({
      staff: appointment.staff,
      businessId: businessId,
      appointment: appointment._id,
      message: `Нова заявка от ${appointment.clientName} за услуга "${service?.name}" - плащане с карта`,
      type: "appointment",
    });

    // Socket notification
    const { io } = await import("../index.js");
    io.to(appointment.staff.toString()).emit("newAppointment", {
      appointment: {
        _id: appointment._id,
        clientName: appointment.clientName,
        serviceName: service?.name,
        appointmentTime: appointment.appointmentTime,
      },
      message: "Имате нова заявка за записване на час с плащане.",
    });
  } catch (error) {
    console.error("Error in handleCheckoutCompleted:", error);
  }
}
