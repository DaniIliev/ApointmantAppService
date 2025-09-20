// models/DailySchedule.js

import mongoose from "mongoose";

const TimeRangeSchema = new mongoose.Schema(
  {
    start: { type: String },
    end: { type: String },
  },
  { _id: false }
);

const WorkHourSchema = new mongoose.Schema({
  day: { type: String, required: true },
  date: { type: Date, required: true },
  isDayOff: { type: Boolean, default: false },
  workTime: { type: TimeRangeSchema },
  breaks: [TimeRangeSchema],
});

const DailyScheduleSchema = new mongoose.Schema({
  workHours: [WorkHourSchema],
});

export default mongoose.model("DailySchedule", DailyScheduleSchema);
