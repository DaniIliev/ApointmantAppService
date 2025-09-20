import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    staffIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    name: { type: String, required: true },
    description: String,
    duration: { type: Number, required: true },
    price: { type: Number, required: true },
    imageUrl: String,
  },
  { timestamps: true }
);

export default mongoose.model("Service", serviceSchema);
