import mongoose from "mongoose";


const StaffScheduleSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // required: true, // Make staff optional for location schedules
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
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
