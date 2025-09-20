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
    // ПРОМЯНА: Сега времето на срещата е обект
    appointmentTime: { type: TimeRangeSchema, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);
