import mongoose from "mongoose";
import dotenv from "dotenv";
import "../src/models/StaffSchedule.js";
import "../src/models/User.js";
import "../src/models/Location.js";

dotenv.config();

const staffId = "69c7d8f3c5a82c4ee3bfe057";

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const StaffSchedule = mongoose.model("StaffSchedule");
    const businessId = "69c7d8c9c5a82c4ee3bfe042";
    const schedules = await StaffSchedule.find({ business: businessId });
    
    console.log(`Found ${schedules.length} schedules for business: ${businessId}`);
    schedules.forEach(s => {
        console.log(`- ID: ${s._id}, Staff: ${s.staff}, Location: ${s.location}`);
    });

    const User = mongoose.model("User");
    const user = await User.findById(staffId);
    if (user) {
        console.log(`User found: ${user.firstName} ${user.lastName}, Role: ${user.role}, BusinessId: ${user.businessId}`);
    } else {
        console.log("User NOT FOUND in User collection.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Inspect failed:", error);
    process.exit(1);
  }
}

inspect();
