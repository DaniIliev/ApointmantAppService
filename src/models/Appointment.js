import mongoose from "mongoose";

// Създаваме преизползваема схема за времеви интервал
const TimeRangeSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true },
});

const appointmentSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientName: String,
    clientPhone: String,
    email: String,
    appointmentTime: { type: TimeRangeSchema, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    // Payment tracking (Stripe)
    paymentStatus: {
      type: String,
      enum: [
        "not_required", // cash only
        "pending", // awaiting card checkout / authorization
        "authorized", // card authorized, awaiting capture
        "captured", // captured successfully
        "refunded", // refunded after capture
        "cancelled", // authorization voided / payment cancelled
        "failed",
      ],
      default: "not_required",
    },
    stripePaymentIntentId: { type: String },
    stripePaymentMethodId: { type: String },
    stripePaymentAmount: { type: Number },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);
