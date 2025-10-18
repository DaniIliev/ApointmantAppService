// import mongoose from "mongoose";

// const businessSchema = new mongoose.Schema(
//   {
//     owner: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },
//     name: { type: String, required: true, trim: true },
//     address: String,
//     qrCodeUrl: String,
//   },
//   { timestamps: true }
// );

// export default mongoose.model("Business", businessSchema);
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
      required: true,
      trim: true,
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

    address: {
      type: String,
    },
    addressLine2: {
      type: String,
    },
    postalCode: {
      type: String,
    },
    city: {
      type: String,
    },
    country: {
      type: String,
    },

    businessImageUrl: {
      type: String,
    },
    qrCodeUrl: {
      type: String,
    },
  },
  { timestamps: true }
);

// Индексиране за по-бързо търсене, ако е необходимо
businessSchema.index({ owner: 1, businessName: 1 });

export default mongoose.model("Business", businessSchema);
