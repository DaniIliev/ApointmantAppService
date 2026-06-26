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
      required: false, // Allow deferred configuration after initial account creation
      trim: true,
      default: "Pending Setup",
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

    businessImageUrl: {
      type: String,
    },
    qrCodeUrl: {
      type: String,
    },
    //this are for stripe
    plan: {
      type: String,
      enum: [
        "none",
        "Starter_Monthly",
        "Professional_Monthly",
        "Enterprise_Monthly",
        "Starter_Annual",
        "Professional_Annual",
        "Enterprise_Annual",
      ],
      default: "none",
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "past_due", "canceled", "unpaid", "incomplete", "none"],
      default: "none",
    },
    stripeCustomerId: {
      type: String,
      required: false, // ID на клиента в Stripe
    },
    stripeSubscriptionId: {
      type: String,
      required: false, // ID на активния абонамент в Stripe
    },
    planExpiresAt: {
      type: Date,
      required: false,
    },
    // Stripe Connect fields - за приемане на плащания от клиенти
    stripeConnectAccountId: {
      type: String,
      required: false, // ID на Connect акаунта в Stripe
    },
    stripeConnectChargesEnabled: {
      type: Boolean,
      default: false, // Дали акаунтът може да приема плащания
    },
    stripeConnectDetailsSubmitted: {
      type: Boolean,
      default: false, // Дали са подадени всички необходими данни
    },
    // Contact & Address Details
    phone: {
      type: String,
      trim: true,
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
    // Referral System
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: false,
    },
    referralRewardClaimed: {
      type: Boolean,
      default: false,
    },
    earnedDiscountMonths: {
      type: Number,
      default: 0,
    },
  },

  { timestamps: true }
);

// Индексиране за по-бързо търсене, ако е необходимо
businessSchema.index({ owner: 1, businessName: 1 });

export default mongoose.model("Business", businessSchema);
