import Stripe from "stripe";

let cachedStripe = null;

export function getStripe() {
  if (cachedStripe) return cachedStripe;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return null; // allow caller to decide how to handle missing key
  }
  cachedStripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
  return cachedStripe;
}

export function requireStripe() {
  const client = getStripe();
  if (!client) {
    const loadedKeys = Object.keys(process.env).filter((k) =>
      k.toLowerCase().includes("stripe")
    );
    throw new Error(
      "Stripe secret key missing. Set STRIPE_SECRET_KEY. Present stripe-related keys: " +
        JSON.stringify(loadedKeys)
    );
  }
  return client;
}
