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
    phone: { type: String, required: true },
    role: {
      type: String,
      enum: ["business", "personal", "staff"],
      required: true,
    },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
