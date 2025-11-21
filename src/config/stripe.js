import Stripe from "stripe";

let cachedStripe = null;

export function getStripe() {
  if (cachedStripe) return cachedStripe;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    const loadedKeys = Object.keys(process.env).filter((k) =>
      k.toLowerCase().includes("stripe")
    );
    console.error(
      "Stripe secret key is missing. Please set STRIPE_SECRET_KEY. Present stripe-related keys:",
      loadedKeys
    );
    throw new Error("Stripe initialization failed: Missing STRIPE_SECRET_KEY");
  }
  cachedStripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
  return cachedStripe;
}

export default getStripe();
