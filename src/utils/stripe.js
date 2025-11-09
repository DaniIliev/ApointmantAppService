export const STRIPE_CONFIG = {
  // 👈 ЗАМЕНЕТЕ С ВАШИТЕ РЕАЛНИ STRIPE PRICE ID-та
  PRICE_IDS: {
    Starter: {
      monthly: "price_Starter_Monthly_ID",
      yearly: "price_Starter_Yearly_ID",
    },
    Professional: {
      monthly: "price_Professional_Monthly_ID",
      yearly: "price_Professional_Yearly_ID",
    },
    Enterprise: {
      monthly: "price_Enterprise_Monthly_ID",
      yearly: "price_Enterprise_Yearly_ID",
    },
  },
  // 👈 ЗАМЕНЕТЕ С ВАШИЯ РЕАЛЕН STRIPE PROMOTION CODE ID
  FIRST_MONTH_DISCOUNT_ID: "promo_first_month_50_off",
};
