import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    staffs: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
        name: { type: String },
      },
    ],
    name: { type: String, required: true },
    description: String,
    duration: { type: Number, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    imageUrl: String,
    // Payment options - как може да се плаща услугата
    paymentOption: {
      type: String,
      enum: ["cash", "card", "cash_and_card"],
      default: "cash",
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Service", serviceSchema);
