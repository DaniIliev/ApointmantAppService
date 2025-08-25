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
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
    phone: { type: String, required: true },
    role: { type: String, enum: ["business", "personal"], required: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
