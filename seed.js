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
    const staffEmail = "test_staff@example.com";
    const clientEmail = "test_client@example.com";

    // 0. Clean up previous seeded users to prevent unique email errors
    console.log("Cleaning up old test users...");
    const oldUsers = await User.find({ email: { $in: [ownerEmail, staffEmail, clientEmail] } });
    for (const u of oldUsers) {
      // Clean up Business, Schedule, Appointments related to them just in case
      if (u.businessId) {
        await Business.deleteMany({ _id: u.businessId });
        await Service.deleteMany({ business: u.businessId });
        await Appointment.deleteMany({ business: u.businessId });
      }
      await StaffSchedule.deleteMany({ staff: u._id });
    }
    await User.deleteMany({ email: { $in: [ownerEmail, staffEmail, clientEmail] } });
    
    // Setup Password
    const passwordHash = await bcrypt.hash("password123", 10);

    // 1. Create Business Owner
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
    let business = new Business({
      owner: owner._id,
      businessName: "Test Beauty Salon",
      category: "Beauty",
      aboutUs: "A salon specifically for testing purposes.",
      openingHours: "09:00 - 18:00",
      phone: "+359888111222",
      email: ownerEmail,
      city: "Sofia",
      country: "Bulgaria"
    });
    business = await business.save();

    // Update Owner with businessId
    owner.businessId = business._id;
    await owner.save();

    // 3. Create Staff Member
    let staff = new User({
      email: staffEmail,
      firstName: "Test",
      lastName: "Staff",
      phone: "+359888333444",
      role: "staff",
      passwordHash,
      businessId: business._id
    });
    staff = await staff.save();

    // 4. Create Service
    let service = new Service({
      business: business._id,
      staffs: [{ _id: staff._id, name: `${staff.firstName} ${staff.lastName}` }],
      name: "Test Haircut",
      description: "Quick 30 min test haircut",
      duration: 30, // 30 minutes
      price: 25.00,
      category: "Hair",
      paymentOption: "cash"
    });
    service = await service.save();

    console.log(`Created Service: ${service.name} (Duration: ${service.duration} mins)`);

    // 5. Create Schedule (Daily & Staff)
    const APP_TIMEZONE = "Europe/Sofia";
    const workHoursArray = [];
    const startDate = moment.tz(APP_TIMEZONE).startOf('day');
    const endDate = moment.tz(APP_TIMEZONE).add(30, 'days').endOf('day');

    // Create 30 days of schedule
    for (let d = startDate.clone(); d.isSameOrBefore(endDate); d.add(1, 'day')) {
      const dayName = d.format('dddd').toLowerCase();
      // Make Saturday and Sunday days off
      const isDayOff = (dayName === "saturday" || dayName === "sunday");
      
      workHoursArray.push({
        day: dayName,
        date: d.toDate(),
        isDayOff: isDayOff,
        workTime: isDayOff ? null : { start: "09:00", end: "18:00" },
        // A standard valid break from 12:00 to 13:00
        breaks: isDayOff ? [] : [{ start: "12:00", end: "13:00" }]
      });
    }

    const dailySchedule = new DailySchedule({ workHours: workHoursArray });
    await dailySchedule.save();

    const staffSchedule = new StaffSchedule({
      startDate: startDate.toDate(),
      endDate: endDate.toDate(),
      workTime: { start: "09:00", end: "18:00" },
      isDayOff: {
        monday: false, tuesday: false, wednesday: false, thursday: false,
        friday: false, saturday: true, sunday: true
      },
      break1: { start: "12:00", end: "13:00" },
      staff: staff._id,
      business: business._id,
      dailySchedule: dailySchedule._id
    });
    await staffSchedule.save();

    console.log("Created valid Staff Schedule with 12:00 to 13:00 breaks");

    // 6. Create Client User
    let client = new User({
      email: clientEmail,
      firstName: "Test",
      lastName: "Client",
      phone: "+359888999000",
      role: "personal",
      passwordHash,
    });
    client = await client.save();

    // 7. Create many Appointments
    console.log("Generating many appointments...");
    const apptsToSave = [];
    const today = moment.tz(APP_TIMEZONE).startOf('day');
    
    // Generate for the past 60 days and next 90 days
    for (let offset = -60; offset <= 90; offset++) {
      const currentDay = today.clone().add(offset, 'days');
      const dayName = currentDay.format('dddd').toLowerCase();
      
      // Skip weekends to match schedule
      if (dayName === 'saturday' || dayName === 'sunday') continue;
      
      const isPast = offset < 0;
      
      // Let's create an appointment every hour between 09:00 and 17:00, except 12:00 (lunch)
      const times = [
        { hour: 9, min: 0 },
        { hour: 9, min: 30 },
        { hour: 10, min: 0 },
        { hour: 10, min: 30 },
        { hour: 11, min: 0 },
        { hour: 11, min: 30 },
        { hour: 13, min: 0 },
        { hour: 13, min: 30 },
        { hour: 14, min: 0 },
        { hour: 14, min: 30 },
        { hour: 15, min: 0 },
        { hour: 15, min: 30 },
        { hour: 16, min: 0 },
        { hour: 16, min: 30 },
        { hour: 17, min: 0 },
      ];
      
      for (let t = 0; t < times.length; t++) {
        const startAppt = currentDay.clone().hour(times[t].hour).minute(times[t].min).toDate();
        const endAppt = moment(startAppt).add(service.duration, 'minutes').toDate();
        
        let status = "confirmed";
        if (isPast) {
          // Mostly completed, but some cancelled
          status = Math.random() > 0.1 ? "completed" : "cancelled";
        } else {
          // Mix of confirmed, pending, and some cancelled for future appointments
          const rand = Math.random();
          if (rand > 0.4) {
            status = "confirmed";
          } else if (rand > 0.1) {
            status = "pending";
          } else {
            status = "cancelled";
          }
        }

        const appt = new Appointment({
          business: business._id,
          service: service._id,
          staff: staff._id,
          client: client._id,
          clientName: `${client.firstName} ${client.lastName} ${Math.floor(Math.random() * 100)}`,
          clientPhone: client.phone,
          email: client.email,
          appointmentTime: { start: startAppt, end: endAppt },
          status: status
        });
        apptsToSave.push(appt);
      }
    }
    
    await Appointment.insertMany(apptsToSave);
    console.log(`Created ${apptsToSave.length} appointments (mix of past, pending and confirmed)`);

    console.log(`\n✅ DATABASE SEEDED SUCCESSFULLY!`);
    console.log(`-------------------------------------------------`);
    console.log(`Test Owner: ${ownerEmail} | Pass: password123`);
    console.log(`Test Staff: ${staffEmail} | Pass: password123`);
    console.log(`Test Client: ${clientEmail} | Pass: password123`);
    console.log(`Business ID: ${business._id}`);
    console.log(`Service ID: ${service._id}`);
    console.log(`Staff ID: ${staff._id}`);

    process.exit(0);

  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedDB();
