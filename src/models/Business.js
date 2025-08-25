import mongoose from "mongoose";

const businessSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    address: String,
    qrCodeUrl: String,
  },
  { timestamps: true }
);

export default mongoose.model("Business", businessSchema);
