import mongoose from "mongoose";

const TimeRangeSchema = new mongoose.Schema(
  {
    start: { type: String },
    end: { type: String },
  },
  { _id: false }
);

const StaffScheduleSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    workTime: { type: TimeRangeSchema, required: true },
    isDayOff: {
      monday: { type: Boolean, default: false },
      tuesday: { type: Boolean, default: false },
      wednesday: { type: Boolean, default: false },
      thursday: { type: Boolean, default: false },
      friday: { type: Boolean, default: false },
      saturday: { type: Boolean, default: true },
      sunday: { type: Boolean, default: true },
    },
    break1: { type: TimeRangeSchema },
    break2: { type: TimeRangeSchema },
    break3: { type: TimeRangeSchema },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    dailySchedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DailySchedule",
    },
  },
  { timestamps: true }
);

export default mongoose.model("StaffSchedule", StaffScheduleSchema);
