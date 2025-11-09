import mongoose from "mongoose";

const businessSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    aboutUs: {
      type: String,
      maxlength: 500,
    },
    openingHours: {
      type: String,
    },

    phone: {
      type: String,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
    },
    addressLine2: {
      type: String,
    },
    postalCode: {
      type: String,
    },
    city: {
      type: String,
    },
    country: {
      type: String,
    },

    businessImageUrl: {
      type: String,
    },
    qrCodeUrl: {
      type: String,
    },
    //this are for stripe
    plan: {
      type: String,
      enum: ["Free", "Starter", "Professional", "Enterprise"],
      default: "Free", // Всички започват от Free или Trial
    },
    subscriptionStatus: {
      type: String,
      enum: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
      ],
      default: "trialing", // Или "active" ако започват директно от платен
    },
    stripeCustomerId: {
      type: String,
      required: false, // ID на клиента в Stripe
    },
    stripeSubscriptionId: {
      type: String,
      required: false, // ID на активния абонамент в Stripe
    },
  },

  { timestamps: true }
);

// Индексиране за по-бързо търсене, ако е необходимо
businessSchema.index({ owner: 1, businessName: 1 });

export default mongoose.model("Business", businessSchema);
