import mongoose from "mongoose";

const systemLogSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ["info", "warn", "error", "metric"],
      required: true,
      index: true,
    },
    category: {
      type: String,
      default: "general",
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Optimize query performance for logs pagination and filters
systemLogSchema.index({ level: 1, timestamp: -1 });
systemLogSchema.index({ category: 1, timestamp: -1 });

export default mongoose.model("SystemLog", systemLogSchema);
