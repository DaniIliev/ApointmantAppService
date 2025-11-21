import stripe, { getStripe } from "../config/stripe.js";
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

// import stripe from "../config/stripe.js";
// import Business from "../models/Business.js"; // 👈 Предполагаме, че този импорт вече работи

// // ⚠️ ВАЖНО: Трябва да създадете Price IDs във вашия Stripe акаунт
// // със съответните цени в EURO (€10/месец, €110/година, €15/месец, €165/година и т.н.).
// // Price ID-тата ТРЯБВА да бъдат заредени от променливи на средата.
// const PLAN_PRICE_MAP = {
//   // МЕСЕЧНИ ПЛАНОВЕ
//   Starter_Monthly:
//     process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || "price_1StarterMonthlyEUR",
//   Professional_Monthly:
//     process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "price_1ProMonthlyEUR",
//   Enterprise_Monthly:
//     process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID ||
//     "price_1EnterpriseMonthlyEUR",

//   // ГОДИШНИ ПЛАНОВЕ (11 месеца цена)
//   Starter_Annual:
//     process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || "price_1StarterAnnualEUR", // €110
//   Professional_Annual:
//     process.env.STRIPE_PRO_ANNUAL_PRICE_ID || "price_1ProAnnualEUR", // €165
//   Enterprise_Annual:
//     process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID ||
//     "price_1EnterpriseAnnualEUR", // €220
// };

// /**
//  * Създава нова Stripe Checkout сесия за абонамент.
//  * @param {string} planName - Името на плана с цикъла ('Starter_Monthly', 'Professional_Annual' и т.н.).
//  * @param {string} businessId - ID на бизнеса/потребителя, който се абонира.
//  */
// export const createCheckoutSession = async (req, res) => {
//   const { planName, businessId } = req.body;
//   console.log(
//     `Attempting checkout for Plan: ${planName}, Business: ${businessId}`
//   );

//   if (!planName || !businessId) {
//     return res.status(400).json({ error: "Липсва planName или businessId." });
//   }

//   // 👈 Използваме пълното име на плана, изпратено от фронтенда
//   const priceId = PLAN_PRICE_MAP[planName];

//   if (!priceId || priceId.startsWith("price_1")) {
//     // Проверка дали ID-то е дефинирано и не е placeholder
//     console.error(
//       `Грешка: Невалидно име на план или Price ID не е конфигурирано за: ${planName}`
//     );
//     return res
//       .status(500)
//       .json({ error: "Невалидно име на план или липсва Stripe Price ID." });
//   }

//   try {
//     // 1. Проверка на бизнес обекта и абонаментния статус
//     const business = await Business.findById(businessId);
//     if (!business) {
//       return res.status(404).json({ error: "Бизнесът не е намерен." });
//     }

//     // 2. Определяне дали това е ПЪРВА ПОКУПКА
//     const isFirstTimeSubscriber = !business.stripeCustomerId;
//     let customerId = business.stripeCustomerId;
//     let promotionCode;

//     if (isFirstTimeSubscriber) {
//       console.log(
//         `ℹ️ First-time subscriber detected for Business: ${businessId}. Applying 50% discount.`
//       );

//       // Създаване на нов Stripe Customer (ако още няма)
//       const customer = await stripe.customers.create({
//         email: business.email, // Приемаме, че Business моделът има 'email' поле
//         metadata: { businessId: businessId },
//       });
//       customerId = customer.id;

//       // ⚠️ Създаване на еднократен 50% промо код за първа покупка
//       const coupon = await stripe.coupons.create({
//         percent_off: 50,
//         duration: "once",
//         name: `First Time 50% Off - ${businessId}`,
//       });

//       const promo = await stripe.promotionCodes.create({
//         coupon: coupon.id,
//         max_redemptions: 1, // Може да се използва само веднъж
//         active: true,
//       });

//       promotionCode = promo.code;

//       // Временно запазване на новия Customer ID в Business модела
//       await Business.findByIdAndUpdate(businessId, {
//         stripeCustomerId: customerId,
//       });
//     }

//     // 3. Създаване на Checkout сесията
//     const session = await stripe.checkout.sessions.create({
//       mode: "subscription",
//       line_items: [
//         {
//           price: priceId, // Използваме специфичния Price ID (месечен или годишен)
//           quantity: 1,
//         },
//       ],
//       // 3. Прилагане на Customer ID
//       customer: customerId,

//       // 4. Прилагане на отстъпката за първа покупка
//       ...(isFirstTimeSubscriber && {
//         discounts: [{ promotion_code: promotionCode }],
//       }),

//       // 5. Метаданни за Webhook контролера
//       metadata: {
//         businessId: businessId,
//         planName: planName,
//         isFirstPurchase: isFirstTimeSubscriber ? "true" : "false",
//       },

//       // 6. URL-и за пренасочване
//       success_url: `${req.protocol}://${req.get(
//         "host"
//       )}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${req.protocol}://${req.get(
//         "host"
//       )}/dashboard/billing?status=canceled`,
//     });

//     // 7. Изпращане на URL-а на сесията обратно към фронтенда
//     res.json({ url: session.url });
//   } catch (error) {
//     console.error("Грешка при създаване на Stripe Checkout сесия:", error);
//     res.status(500).json({ error: "Неуспешно създаване на сесия за плащане." });
//   }
// };
