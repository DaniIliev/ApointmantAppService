import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    profilePictureUrl: { type: String, required: false },
    primaryColor: { type: String, required: false, default: "#3b61c0" }, // За запазване на избрания цвят
    theme: {
      type: String,
      required: false,
      enum: ["light", "dark"],
      default: "light",
    },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
    phone: { type: String, required: false },
    role: {
      type: String,
      enum: ["business", "personal", "staff", "admin"],
      required: true,
    },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
    subscriptionPlan: {
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
      required: false,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "past_due", "canceled", "unpaid", "incomplete", "none"],
      default: "none",
      required: false,
    },
    subscriptionBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: false,
    },
    subscriptionActivatedAt: { type: Date, required: false },
    subscriptionCurrentPeriodEnd: { type: Date, required: false },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
