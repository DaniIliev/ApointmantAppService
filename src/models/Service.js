import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    staffMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
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

serviceSchema.pre("save", function (next) {
  if (this.isModified("staffMembers") && Array.isArray(this.staffMembers)) {
    this.staffMembers = this.staffMembers
      .map((item) => {
        if (typeof item === "object" && item._id) return item._id;
        return item;
      })
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
  }
  next();
});

export default mongoose.model("Service", serviceSchema);
