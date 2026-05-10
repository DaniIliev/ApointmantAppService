import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "appointment",
        "subscription_purchased",
        "subscription_expiring",
        "kanban_assignment",
      ],
      required: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: false,
    },
    messageKey: {
      type: String,
      required: true,
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Alert", alertSchema);
