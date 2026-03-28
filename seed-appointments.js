import mongoose from "mongoose";
import dotenv from "dotenv";
import moment from "moment-timezone";

// Models
import User from "./src/models/User.js";
import Business from "./src/models/Business.js";
import Service from "./src/models/Service.js";
import Appointment from "./src/models/Appointment.js";
import Location from "./src/models/Location.js";

dotenv.config();

const seedByEmail = async (email) => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    if (!email) {
      throw new Error("Please provide an email address as an argument.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB. Seeding appointments for: ${email}`);

    // 1. Find the target user
    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      throw new Error(`User with email ${email} not found.`);
    }

    let businessId = targetUser.businessId;
    let staffId = targetUser.role === 'staff' ? targetUser._id : null;

    // If it's a new owner who hasn't created a business yet, we might need to create one
    if (!businessId && targetUser.role === 'business') {
      console.log("No business found for this owner. Creating a default one...");
      const business = new Business({
        owner: targetUser._id,
        businessName: "My New Business",
        category: "Other",
        city: "Sofia",
        country: "Bulgaria"
      });
      await business.save();
      businessId = business._id;
      targetUser.businessId = businessId;
      await targetUser.save();
    }

    if (!businessId) {
      throw new Error("Target user is not associated with a business.");
    }

    // 2. Ensure at least one Location exists
    let location = await Location.findOne({ businessId });
    if (!location) {
      console.log("No location found. Creating a default one...");
      location = new Location({
        businessId,
        name: "Main Branch",
        address: "Default Address",
        city: "Sofia",
        country: "Bulgaria",
        isDefault: true
      });
      await location.save();
    }

    // 3. Ensure at least one Service exists
    let service = await Service.findOne({ business: businessId });
    if (!service) {
      console.log("No service found. Creating a default one...");
      service = new Service({
        business: businessId,
        name: "Professional Consultation",
        price: 50,
        duration: 60,
        category: "Consulting",
        locationId: location._id,
        staffMembers: staffId ? [staffId] : [targetUser._id],
        paymentOption: "cash"
      });
      await service.save();
    }

    // 4. Find or Create a Test Client
    let clientEmail = "client_for_test@example.com";
    let client = await User.findOne({ email: clientEmail });
    if (!client) {
      client = new User({
        email: clientEmail,
        firstName: "Sample",
        lastName: "Client",
        phone: "+359888777666",
        role: "personal"
      });
      await client.save();
    }

    // 5. Generate 50 Appointments
    console.log("Generating 100 mixed-status appointments...");
    const apptsToSave = [];
    const APP_TIMEZONE = "Europe/Sofia";
    const today = moment.tz(APP_TIMEZONE).startOf('day');
    const statuses = ["confirmed", "pending", "cancelled", "completed"];

    // Use current staffId or any staff from the business
    if (!staffId) {
       const anyStaff = await User.findOne({ businessId, role: 'staff' });
       staffId = anyStaff ? anyStaff._id : targetUser._id;
    }

    // Generate for 60 days (30 past, 30 future)
    for (let offset = -30; offset <= 30; offset++) {
      const currentDay = today.clone().add(offset, 'days');
      const dayName = currentDay.format('dddd').toLowerCase();
      
      if (dayName === 'saturday' || dayName === 'sunday') continue;
      
      const isPast = offset < 0;
      const dailyCount = Math.floor(Math.random() * 3) + 2; // 2-4 appts per day

      for (let i = 0; i < dailyCount; i++) {
        const hour = Math.floor(Math.random() * 8) + 9; // 9 to 16
        const minute = Math.random() > 0.5 ? 0 : 30;
        const start = currentDay.clone().hour(hour).minute(minute).toDate();
        const end = moment(start).add(service.duration, 'minutes').toDate();

        let status = statuses[Math.floor(Math.random() * statuses.length)];
        if (isPast) {
          status = Math.random() > 0.1 ? "completed" : "cancelled";
        } else if (offset === 0) {
          status = "confirmed";
        }

        apptsToSave.push({
          business: businessId,
          service: service._id,
          staff: staffId,
          locationId: location._id,
          client: client._id,
          clientName: `${client.firstName} ${client.lastName} ${Math.floor(Math.random() * 100)}`,
          email: client.email,
          appointmentTime: { start, end },
          status: status
        });
      }
    }

    const inserted = await Appointment.insertMany(apptsToSave);
    console.log(`Successfully seeded ${inserted.length} appointments for ${email}.`);

    process.exit(0);
  } catch (error) {
    console.error("Error seeding appointments:", error);
    process.exit(1);
  }
};

const emailArg = process.argv[2];
seedByEmail(emailArg);
