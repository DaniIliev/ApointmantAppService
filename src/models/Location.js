import mongoose from "mongoose";

const TimeRangeSchema = new mongoose.Schema(
  {
    start: { type: String, default: null },
    end: { type: String, default: null },
  },
  { _id: false },
);

const WeeklyDaySchema = new mongoose.Schema(
  {
    isDayOff: { type: Boolean, default: false },
    workTime: {
      type: TimeRangeSchema,
      default: () => ({ start: null, end: null }),
    },
  },
  { _id: false },
);

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
    weeklyWorkingHours: {
      monday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: false,
          workTime: { start: "09:00", end: "18:00" },
        }),
      },
      tuesday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: false,
          workTime: { start: "09:00", end: "18:00" },
        }),
      },
      wednesday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: false,
          workTime: { start: "09:00", end: "18:00" },
        }),
      },
      thursday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: false,
          workTime: { start: "09:00", end: "18:00" },
        }),
      },
      friday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: false,
          workTime: { start: "09:00", end: "18:00" },
        }),
      },
      saturday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: true,
          workTime: { start: null, end: null },
        }),
      },
      sunday: {
        type: WeeklyDaySchema,
        default: () => ({
          isDayOff: true,
          workTime: { start: null, end: null },
        }),
      },
    },
  },
  { timestamps: true },
);

// Index for faster queries
locationSchema.index({ businessId: 1 });

export default mongoose.model("Location", locationSchema);
