import mongoose from "mongoose";
import moment from "moment-timezone";
import { getAvailableSlots } from "../src/utils/AppointmentUtilities.js";
import dotenv from "dotenv";
import "../src/models/StaffSchedule.js";
import "../src/models/DailySchedule.js";
import "../src/models/Appointment.js";
import "../src/models/Service.js";
import "../src/models/User.js";
import "../src/models/Location.js";

dotenv.config();

const staffId = "69c7d8f3c5a82c4ee3bfe057";
const serviceId = "69c7db7428fbed638dbcf489";
const locationId = "69c7d8e4c5a82c4ee3bfe050";

async function debug() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const Service = mongoose.model("Service");
    const service = await Service.findById(serviceId);
    if (!service) {
        console.error("Service not found!");
        process.exit(1);
    }
    const duration = service.duration;

    console.log(`Service duration: ${duration}`);

    // Test for next 7 days
    for (let i = 0; i < 7; i++) {
        const testDate = moment().add(i, "days").format("YYYY-MM-DD");
        console.log(`\n--- Testing for date: ${testDate} ---`);
        const result = await getAvailableSlots(staffId, testDate, duration, locationId);
        console.log("Result slots count:", result.slots.length);
        if (result.slots.length > 0) {
            console.log("First slot:", result.slots[0]);
        } else {
            console.log("Message:", result.message);
        }
    }

    process.exit(0);
  } catch (error) {
    console.error("Debug failed:", error);
    process.exit(1);
  }
}

debug();
