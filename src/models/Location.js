import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    addressLine2: {
      type: String,
    },
    postalCode: {
      type: String,
    },
    city: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      default: "България",
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
    isDefault: {
      type: Boolean,
      default: false,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Index for faster queries
locationSchema.index({ businessId: 1 });

export default mongoose.model("Location", locationSchema);
