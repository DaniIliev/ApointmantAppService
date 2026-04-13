import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import moment from "moment-timezone";

// Models
import User from "./src/models/User.js";
import Business from "./src/models/Business.js";
import Service from "./src/models/Service.js";
import DailySchedule from "./src/models/DailySchedule.js";
import StaffSchedule from "./src/models/StaffSchedule.js";
import Appointment from "./src/models/Appointment.js";
import Location from "./src/models/Location.js";

dotenv.config();

const seedDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for seeding...");

    // Emails for testing
    const ownerEmail = "test_owner@example.com";
    const staffEmails = [
      "staff1@example.com",
      "staff2@example.com",
      "staff3@example.com",
      "staff4@example.com",
    ];
    const clientEmail = "test_client@example.com";

    // 0. Clean up previous seeded data
    console.log("Cleaning up old test data...");
    const allTestEmails = [ownerEmail, ...staffEmails, clientEmail];
    
    // Find previous users
    const oldUsers = await User.find({ email: { $in: allTestEmails } });
    const businessIds = oldUsers.map(u => u.businessId).filter(id => id);

    if (businessIds.length > 0) {
      await Business.deleteMany({ _id: { $in: businessIds } });
      await Location.deleteMany({ businessId: { $in: businessIds } });
      await Service.deleteMany({ business: { $in: businessIds } });
      await Appointment.deleteMany({ business: { $in: businessIds } });
      await StaffSchedule.deleteMany({ business: { $in: businessIds } });
    }
    
    await User.deleteMany({ email: { $in: allTestEmails } });
    console.log("Cleanup complete.");
    
    // Setup Password
    const passwordHash = await bcrypt.hash("password123", 10);

    // 1. Create Business Owner
    console.log("Creating Business Owner...");
    let owner = new User({
      email: ownerEmail,
      firstName: "Test",
      lastName: "Owner",
      phone: "+359888111222",
      role: "business",
      passwordHash,
    });
    owner = await owner.save();

    // 2. Create Business
    console.log("Creating Business...");
    let business = new Business({
      owner: owner._id,
      businessName: "Elite Wellness Center",
      category: "Beauty & Wellness",
      aboutUs: "A premium multi-location wellness center for testing.",
      openingHours: "09:00 - 20:00",
      phone: "+359888111222",
      email: ownerEmail,
      city: "Sofia",
      country: "Bulgaria"
    });
    business = await business.save();

    // Update Owner with businessId
    owner.businessId = business._id;
    await owner.save();

    // 3. Create 2 Locations
    console.log("Creating Locations...");
    const location1 = new Location({
      businessId: business._id,
      name: "Sofia City Center",
      address: "bul. Vitosha 10",
      city: "Sofia",
      country: "Bulgaria",
      isDefault: true
    });
    await location1.save();

    const location2 = new Location({
      businessId: business._id,
      name: "Business Park Branch",
      address: "Mladost 4, Building 1",
      city: "Sofia",
      country: "Bulgaria",
      isDefault: false
    });
    await location2.save();

    // 4. Create 4 Staff (2 per location)
    console.log("Creating Staff...");
    const staffMembers = [];
    const staffConfigs = [
      { firstName: "Ivan", lastName: "Ivanov", email: staffEmails[0], locationIds: [location1._id] },
      { firstName: "Maria", lastName: "Petrova", email: staffEmails[1], locationIds: [location1._id] },
      { firstName: "Georgi", lastName: "Georgiev", email: staffEmails[2], locationIds: [location2._id] },
      { firstName: "Elena", lastName: "Dimitrova", email: staffEmails[3], locationIds: [location2._id] },
    ];

    for (const config of staffConfigs) {
      const s = new User({
        ...config,
        role: "staff",
        passwordHash,
        businessId: business._id
      });
      staffMembers.push(await s.save());
    }

    // 5. Create 4 Services (2 per location)
    console.log("Creating Services...");
    const services = [];
    const serviceConfigs = [
      { name: "Executive Haircut", price: 35, duration: 45, category: "Hair", locationId: location1._id, staffIdx: [0, 1] },
      { name: "Deep Tissue Massage", price: 80, duration: 90, category: "Massage", locationId: location1._id, staffIdx: [0, 1] },
      { name: "Premium Manicure", price: 45, duration: 60, category: "Nails", locationId: location2._id, staffIdx: [2, 3] },
      { name: "Skin Rejuvenation", price: 120, duration: 60, category: "Facial", locationId: location2._id, staffIdx: [2, 3] },
    ];

    for (const config of serviceConfigs) {
      const s = new Service({
        business: business._id,
        name: config.name,
        price: config.price,
        duration: config.duration,
        category: config.category,
        locationId: config.locationId,
        staffMembers: config.staffIdx.map(idx => staffMembers[idx]._id),
        paymentOption: "cash_and_card"
      });
      services.push(await s.save());
    }

    // 6. Create Schedules
    console.log("Creating Schedules...");
    const APP_TIMEZONE = "Europe/Sofia";
    const startDate = moment.tz(APP_TIMEZONE).startOf('day').subtract(2, 'months');
    const endDate = moment.tz(APP_TIMEZONE).add(4, 'months').endOf('day');

    for (const s of staffMembers) {
      const workHoursArray = [];
      for (let d = startDate.clone(); d.isSameOrBefore(endDate); d.add(1, 'day')) {
        const dayName = d.format('dddd').toLowerCase();
        const isDayOff = (dayName === "saturday" || dayName === "sunday");
        workHoursArray.push({
          day: dayName,
          date: d.toDate(),
          isDayOff: isDayOff,
          workTime: isDayOff ? null : { start: "09:00", end: "19:00" },
          breaks: isDayOff ? [] : [{ start: "13:00", end: "14:00" }]
        });
      }
      
      const dailySchedule = new DailySchedule({ workHours: workHoursArray });
      await dailySchedule.save();

      const staffSchedule = new StaffSchedule({
        startDate: startDate.toDate(),
        endDate: endDate.toDate(),
        workTime: { start: "09:00", end: "19:00" },
        isDayOff: {
          monday: false, tuesday: false, wednesday: false, thursday: false,
          friday: false, saturday: true, sunday: true
        },
        break1: { start: "13:00", end: "14:00" },
        staff: s._id,
        business: business._id,
        location: s.locationIds[0],
        dailySchedule: dailySchedule._id
      });
      await staffSchedule.save();
    }

    // 7. Create Client
    let client = new User({
      email: clientEmail,
      firstName: "Regular",
      lastName: "Client",
      phone: "+359888999000",
      role: "personal",
      passwordHash,
    });
    client = await client.save();

    // 8. Generate Many Appointments
    console.log("Generating ~300 appointments...");
    const apptsToSave = [];
    const today = moment.tz(APP_TIMEZONE).startOf('day');
    const statuses = ["confirmed", "pending", "cancelled", "completed"];

    // Generate for 120 days (60 past, 60 future)
    for (let offset = -60; offset <= 60; offset++) {
      const currentDay = today.clone().add(offset, 'days');
      const dayName = currentDay.format('dddd').toLowerCase();
      
      if (dayName === 'saturday' || dayName === 'sunday') continue;
      
      const isPast = offset < 0;
      // 5-8 appointments per day distributed
      const dailyCount = Math.floor(Math.random() * 4) + 5;

      for (let i = 0; i < dailyCount; i++) {
        const staff = staffMembers[Math.floor(Math.random() * staffMembers.length)];
        const locId = staff.locationIds[0];
        const possibleServices = services.filter(ser => ser.locationId.equals(locId));
        const service = possibleServices[Math.floor(Math.random() * possibleServices.length)];

        const hour = Math.floor(Math.random() * 9) + 9; // 9 to 17
        if (hour === 13) continue; // Lunch break

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
          business: business._id,
          service: service._id,
          staff: staff._id,
          locationId: locId,
          client: client._id,
          clientName: `Test Client ${Math.floor(Math.random() * 1000)}`,
          email: client.email,
          appointmentTime: { start, end },
          status: status
        });
      }
    }

    await Appointment.insertMany(apptsToSave);
    console.log(`Successfully seeded ${apptsToSave.length} appointments.`);

    console.log(`\n✅ DATABASE SEEDED SUCCESSFULLY!`);
    console.log(`Owner: ${ownerEmail} | Password: password123`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedDB();
