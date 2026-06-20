/**
 * ====================================================================
 *  SEED + SMOKE-TEST  —  Business Account с 2 локации, служители,
 *  графици и 20 часа на човек (1 месец назад + 2 седмици напред).
 *
 *  Употреба:  node seed-full-test.js
 *
 *  Скриптът хвърля грешка при всяка неуспешна стъпка — работи и като
 *  интеграционен тест дали моделите/базата са наред.
 * ====================================================================
 */

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

const APP_TIMEZONE = "Europe/Sofia";
const APPTS_PER_STAFF = 20;

// ── helpers ────────────────────────────────────────────────────────────
function assert(condition, message) {
  if (!condition) throw new Error(`❌ ASSERTION FAILED: ${message}`);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Генерира работни дни (Пон-Пет) в диапазон от дати */
function getWorkdays(startMoment, endMoment) {
  const days = [];
  for (let d = startMoment.clone(); d.isSameOrBefore(endMoment, "day"); d.add(1, "day")) {
    const dow = d.isoWeekday(); // 1=Mon … 7=Sun
    if (dow <= 5) days.push(d.clone());
  }
  return days;
}

// ── main ───────────────────────────────────────────────────────────────
const seedAndTest = async () => {
  const startTime = Date.now();
  const counters = { users: 0, locations: 0, services: 0, schedules: 0, appointments: 0 };

  try {
    // ── 0. Connect ─────────────────────────────────────────────────────
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not defined in .env");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅  Свързан с MongoDB\n");

    // ── 1. Cleanup ─────────────────────────────────────────────────────
    const ownerEmail    = "d.marinova@glamoursudio.bg";
    const staffEmails   = [
      "ivan.kostadinov@gmail.com",
      "maria.todorova@abv.bg",
      "petar.zhelev@gmail.com",
      "elena.borisova@yahoo.com",
      "georgi.hristov@abv.bg",
      "anna.velikova@gmail.com",
    ];
    const clientEmails = [
      "nikolay.atanasov@gmail.com",
      "viktoriya.koleva@abv.bg",
      "aleksandar.stoykov@yahoo.com",
    ];

    const allEmails = [ownerEmail, ...staffEmails, ...clientEmails];
    console.log("🧹  Почистване на стари тестови данни...");

    const oldUsers = await User.find({ email: { $in: allEmails } });
    const oldBusinessIds = oldUsers.map((u) => u.businessId).filter(Boolean);

    if (oldBusinessIds.length > 0) {
      await Appointment.deleteMany({ business: { $in: oldBusinessIds } });
      await Service.deleteMany({ business: { $in: oldBusinessIds } });
      const oldSchedules = await StaffSchedule.find({ business: { $in: oldBusinessIds } });
      const oldDailyIds = oldSchedules.map((s) => s.dailySchedule).filter(Boolean);
      await DailySchedule.deleteMany({ _id: { $in: oldDailyIds } });
      await StaffSchedule.deleteMany({ business: { $in: oldBusinessIds } });
      await Location.deleteMany({ businessId: { $in: oldBusinessIds } });
      await Business.deleteMany({ _id: { $in: oldBusinessIds } });
    }
    await User.deleteMany({ email: { $in: allEmails } });
    console.log("   ✔ Почистено.\n");

    // ── 2. Business Owner ──────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("Test1234!", 10);

    console.log("👤  Създаване на собственик...");
    let owner = await User.create({
      email: ownerEmail,
      firstName: "Даниела",
      lastName: "Маринова",
      phone: "+359887234561",
      role: "business",
      passwordHash,
      profilePictureUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=Daniela",
    });
    assert(owner._id, "Owner _id трябва да съществува");
    counters.users++;

    // ── 3. Business ────────────────────────────────────────────────────
    console.log("🏢  Създаване на бизнес...");
    let business = await Business.create({
      owner: owner._id,
      businessName: "Glamour Studio",
      category: "Beauty & Wellness",
      aboutUs: "Професионално студио за красота с две локации в София. Предлагаме широка гама от услуги за коса, нокти, масаж и козметика.",
      openingHours: "09:00 - 19:00",
      phone: "+359887234561",
      email: ownerEmail,
      businessImageUrl: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1974&auto=format&fit=crop",
      qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://appointdi.com/glamourstudio",
      plan: "Enterprise_Annual",
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub_mock_" + Date.now(),
      stripeCustomerId: "cus_mock_" + Date.now(),
    });
    assert(business._id, "Business _id трябва да съществува");
    assert(business.businessName === "Glamour Studio", "Името на бизнеса не съвпада");

    owner.businessId = business._id;
    owner.subscriptionPlan = "Enterprise_Annual";
    owner.subscriptionStatus = "active";
    await owner.save();

    // ── 4. Locations ───────────────────────────────────────────────────
    console.log("📍  Създаване на 2 локации...");

    const loc1 = await Location.create({
      businessId: business._id,
      name: "Glamour Studio — Лозенец",
      address: "ул. Крум Попов 56",
      city: "София",
      country: "България",
      phone: "+359882345610",
      isDefault: true,
      imageUrl: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1974&auto=format&fit=crop",
      weeklyWorkingHours: {
        monday:    { isDayOff: false, workTime: { start: "09:00", end: "19:00" } },
        tuesday:   { isDayOff: false, workTime: { start: "09:00", end: "19:00" } },
        wednesday: { isDayOff: false, workTime: { start: "09:00", end: "19:00" } },
        thursday:  { isDayOff: false, workTime: { start: "09:00", end: "19:00" } },
        friday:    { isDayOff: false, workTime: { start: "09:00", end: "19:00" } },
        saturday:  { isDayOff: true,  workTime: { start: null, end: null } },
        sunday:    { isDayOff: true,  workTime: { start: null, end: null } },
      },
    });
    assert(loc1._id, "Location 1 _id трябва да съществува");
    counters.locations++;

    const loc2 = await Location.create({
      businessId: business._id,
      name: "Glamour Studio — Младост",
      address: "ж.к. Младост 1А, бл. 506, партер",
      city: "София",
      country: "България",
      phone: "+359882345620",
      isDefault: false,
      imageUrl: "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?q=80&w=2036&auto=format&fit=crop",
      weeklyWorkingHours: {
        monday:    { isDayOff: false, workTime: { start: "10:00", end: "20:00" } },
        tuesday:   { isDayOff: false, workTime: { start: "10:00", end: "20:00" } },
        wednesday: { isDayOff: false, workTime: { start: "10:00", end: "20:00" } },
        thursday:  { isDayOff: false, workTime: { start: "10:00", end: "20:00" } },
        friday:    { isDayOff: false, workTime: { start: "10:00", end: "20:00" } },
        saturday:  { isDayOff: false, workTime: { start: "10:00", end: "16:00" } },
        sunday:    { isDayOff: true,  workTime: { start: null, end: null } },
      },
    });
    assert(loc2._id, "Location 2 _id трябва да съществува");
    counters.locations++;

    // ── 5. Staff ───────────────────────────────────────────────────────
    console.log("👥  Създаване на 6 служителя (3 + 3)...");

    const staffConfigs = [
      // Локация 1 — Лозенец
      { firstName: "Иван",    lastName: "Костадинов",  email: staffEmails[0], location: loc1 },
      { firstName: "Мария",   lastName: "Тодорова",    email: staffEmails[1], location: loc1 },
      { firstName: "Петър",   lastName: "Желев",       email: staffEmails[2], location: loc1 },
      // Локация 2 — Младост
      { firstName: "Елена",   lastName: "Борисова",    email: staffEmails[3], location: loc2 },
      { firstName: "Георги",  lastName: "Христов",     email: staffEmails[4], location: loc2 },
      { firstName: "Ана",     lastName: "Великова",    email: staffEmails[5], location: loc2 },
    ];

    const staffMembers = [];
    for (const cfg of staffConfigs) {
      const s = await User.create({
        email: cfg.email,
        firstName: cfg.firstName,
        lastName: cfg.lastName,
        phone: `+3598871${String(counters.users + 10).padStart(4, "0")}`,
        role: "staff",
        passwordHash,
        businessId: business._id,
        locationIds: [cfg.location._id],
        profilePictureUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${cfg.firstName}`,
        subscriptionPlan: "Enterprise_Annual",
        subscriptionStatus: "active",
      });
      assert(s._id, `Staff ${cfg.firstName} _id трябва да съществува`);
      staffMembers.push({ user: s, location: cfg.location });
      counters.users++;
    }

    // ── 6. Services ────────────────────────────────────────────────────
    console.log("✂️  Създаване на услуги...");

    const loc1Staff = staffMembers.filter((s) => s.location._id.equals(loc1._id));
    const loc2Staff = staffMembers.filter((s) => s.location._id.equals(loc2._id));

    const serviceConfigs = [
      // Локация 1 — Лозенец
      { name: "Дамско подстригване",      price: 35,  duration: 40, category: "Коса",       loc: loc1, staff: loc1Staff, image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&q=80" },
      { name: "Балеаж с тониране",       price: 120, duration: 120, category: "Коса",      loc: loc1, staff: loc1Staff, image: "https://images.unsplash.com/photo-1595476108010-b4d1f10d5e43?w=500&q=80" },
      { name: "Релаксиращ масаж",        price: 75,  duration: 60, category: "Масаж",      loc: loc1, staff: loc1Staff, image: "https://images.unsplash.com/photo-1519823551278-64ac92734fb4?w=500&q=80" },
      // Локация 2 — Младост
      { name: "Гел маникюр",             price: 40,  duration: 50, category: "Нокти",      loc: loc2, staff: loc2Staff, image: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=500&q=80" },
      { name: "SPA педикюр с лак",       price: 55,  duration: 60, category: "Нокти",      loc: loc2, staff: loc2Staff, image: "https://images.unsplash.com/photo-1519014816548-bf5fe059e98b?w=500&q=80" },
      { name: "Дълбоко почистване на лице", price: 90, duration: 75, category: "Козметика", loc: loc2, staff: loc2Staff, image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&q=80" },
    ];

    const services = [];
    for (const cfg of serviceConfigs) {
      const svc = await Service.create({
        business: business._id,
        name: cfg.name,
        price: cfg.price,
        duration: cfg.duration,
        category: cfg.category,
        locationIds: [cfg.loc._id],
        staffMembers: cfg.staff.map((s) => s.user._id),
        paymentOption: "cash_and_card",
        imageUrl: cfg.image,
      });
      assert(svc._id, `Service "${cfg.name}" _id трябва да съществува`);
      services.push({ svc, location: cfg.loc });
      counters.services++;
    }

    // ── 7. Schedules ───────────────────────────────────────────────────
    console.log("📅  Създаване на графици за всеки служител...");

    const scheduleStart = moment.tz(APP_TIMEZONE).subtract(2, "months").startOf("day");
    const scheduleEnd   = moment.tz(APP_TIMEZONE).add(3, "months").endOf("day");

    for (const { user: s, location: loc } of staffMembers) {
      // Определяме работно време по локация
      const isLoc2 = loc._id.equals(loc2._id);
      const workStart = isLoc2 ? "10:00" : "09:00";
      const workEnd   = isLoc2 ? "20:00" : "19:00";
      const saturdayWork = isLoc2; // Loc2 работи в събота

      const workHoursArray = [];
      for (let d = scheduleStart.clone(); d.isSameOrBefore(scheduleEnd, "day"); d.add(1, "day")) {
        const dayName = d.format("dddd").toLowerCase();
        const isSunday = dayName === "sunday";
        const isSaturday = dayName === "saturday";
        const isDayOff = isSunday || (isSaturday && !saturdayWork);

        workHoursArray.push({
          day: dayName,
          date: d.toDate(),
          isDayOff,
          workTime: isDayOff ? null : {
            start: (isSaturday && saturdayWork) ? "10:00" : workStart,
            end:   (isSaturday && saturdayWork) ? "16:00" : workEnd,
          },
          breaks: isDayOff ? [] : [{ start: "13:00", end: "14:00" }],
        });
      }

      const dailySchedule = await DailySchedule.create({ workHours: workHoursArray });
      assert(dailySchedule._id, `DailySchedule за ${s.firstName} трябва да съществува`);

      const staffSchedule = await StaffSchedule.create({
        startDate: scheduleStart.toDate(),
        endDate: scheduleEnd.toDate(),
        staff: s._id,
        business: business._id,
        location: loc._id,
        dailySchedule: dailySchedule._id,
      });
      assert(staffSchedule._id, `StaffSchedule за ${s.firstName} трябва да съществува`);
      counters.schedules++;
    }

    // ── 8. Test Clients ────────────────────────────────────────────────
    console.log("🧑  Създаване на тестови клиенти...");

    const clients = [];
    const clientConfigs = [
      { email: clientEmails[0], firstName: "Николай",    lastName: "Атанасов",  phone: "+359876543210" },
      { email: clientEmails[1], firstName: "Виктория",   lastName: "Колева",    phone: "+359889112233" },
      { email: clientEmails[2], firstName: "Александър", lastName: "Стойков",   phone: "+359878445566" },
    ];
    for (const cc of clientConfigs) {
      const cl = await User.create({ ...cc, role: "personal", passwordHash });
      assert(cl._id, `Client ${cc.firstName} _id трябва да съществува`);
      clients.push(cl);
      counters.users++;
    }

    // ── 9. Appointments — 20 на служител ───────────────────────────────
    console.log(`📋  Генериране на ${APPTS_PER_STAFF} часа × ${staffMembers.length} служителя...`);

    const today = moment.tz(APP_TIMEZONE).startOf("day");
    const rangeStart = today.clone().subtract(1, "month");
    const rangeEnd   = today.clone().add(2, "weeks");

    const allWorkdays = getWorkdays(rangeStart, rangeEnd);
    assert(allWorkdays.length > 0, "Трябва да има поне 1 работен ден в диапазона");

    const allAppointments = [];

    for (const { user: staffUser, location: loc } of staffMembers) {
      const locServices = services.filter((s) => s.location._id.equals(loc._id));
      assert(locServices.length > 0, `Няма услуги за локация ${loc.name}`);

      const isLoc2 = loc._id.equals(loc2._id);
      const minHour = isLoc2 ? 10 : 9;
      const maxHour = isLoc2 ? 18 : 17; // оставяме поне 1ч преди затваряне

      // Разпръскваме 20 часа по различни дни
      const usedSlots = new Set(); // "YYYY-MM-DD|HH:mm" — за уникалност

      let created = 0;
      let attempts = 0;
      const maxAttempts = APPTS_PER_STAFF * 10; // safety valve

      while (created < APPTS_PER_STAFF && attempts < maxAttempts) {
        attempts++;

        const day = pickRandom(allWorkdays);
        const hour = randomInt(minHour, maxHour);
        if (hour === 13) continue; // обедна почивка
        const minute = pickRandom([0, 15, 30, 45]);
        const slotKey = `${day.format("YYYY-MM-DD")}|${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}|${staffUser._id}`;
        if (usedSlots.has(slotKey)) continue;
        usedSlots.add(slotKey);

        const { svc: service } = pickRandom(locServices);
        const client = pickRandom(clients);

        const start = day.clone().hour(hour).minute(minute).second(0).toDate();
        const end   = moment(start).add(service.duration, "minutes").toDate();

        const isPast = moment(start).isBefore(moment());
        let status;
        if (isPast) {
          status = Math.random() > 0.15 ? "completed" : "cancelled";
        } else {
          status = pickRandom(["pending", "confirmed"]);
        }

        allAppointments.push({
          business: business._id,
          service: service._id,
          staff: staffUser._id,
          locationId: loc._id,
          client: client._id,
          clientName: `${client.firstName} ${client.lastName}`,
          clientPhone: client.phone,
          email: client.email,
          appointmentTime: { start, end },
          status,
        });
        created++;
      }

      assert(
        created === APPTS_PER_STAFF,
        `Създадени ${created} вместо ${APPTS_PER_STAFF} часа за ${staffUser.firstName} ${staffUser.lastName}`
      );
    }

    const inserted = await Appointment.insertMany(allAppointments);
    counters.appointments = inserted.length;
    assert(
      inserted.length === staffMembers.length * APPTS_PER_STAFF,
      `Очаквани ${staffMembers.length * APPTS_PER_STAFF} записа, получени ${inserted.length}`
    );

    // ── 10. Verification Queries (Smoke Tests) ─────────────────────────
    console.log("\n🔍  Верификация...\n");

    // 10a. Business exists
    const bizCheck = await Business.findById(business._id);
    assert(bizCheck, "Бизнесът не е намерен в базата");
    console.log(`   ✔ Бизнес: ${bizCheck.businessName}`);

    // 10b. Locations count
    const locCount = await Location.countDocuments({ businessId: business._id });
    assert(locCount === 2, `Очаквани 2 локации, получени ${locCount}`);
    console.log(`   ✔ Локации: ${locCount}`);

    // 10c. Staff count
    const staffCount = await User.countDocuments({ businessId: business._id, role: "staff" });
    assert(staffCount === 6, `Очаквани 6 служителя, получени ${staffCount}`);
    console.log(`   ✔ Служители: ${staffCount}`);

    // 10d. Schedules count
    const schedCount = await StaffSchedule.countDocuments({ business: business._id });
    assert(schedCount === 6, `Очаквани 6 графика, получени ${schedCount}`);
    console.log(`   ✔ Графици: ${schedCount}`);

    // 10e. Services count
    const svcCount = await Service.countDocuments({ business: business._id });
    assert(svcCount === 6, `Очаквани 6 услуги, получени ${svcCount}`);
    console.log(`   ✔ Услуги: ${svcCount}`);

    // 10f. Appointments count & per-staff distribution
    const apptCount = await Appointment.countDocuments({ business: business._id });
    assert(
      apptCount === staffMembers.length * APPTS_PER_STAFF,
      `Очаквани ${staffMembers.length * APPTS_PER_STAFF} часа, получени ${apptCount}`
    );
    console.log(`   ✔ Общо часове: ${apptCount}`);

    for (const { user: s } of staffMembers) {
      const perStaff = await Appointment.countDocuments({ staff: s._id });
      assert(perStaff === APPTS_PER_STAFF, `${s.firstName} ${s.lastName}: очаквани ${APPTS_PER_STAFF}, получени ${perStaff}`);
      console.log(`     • ${s.firstName} ${s.lastName}: ${perStaff} часа`);
    }

    // 10g. Past vs future
    const nowDate = new Date();
    const pastCount = await Appointment.countDocuments({
      business: business._id,
      "appointmentTime.start": { $lt: nowDate },
    });
    const futureCount = await Appointment.countDocuments({
      business: business._id,
      "appointmentTime.start": { $gte: nowDate },
    });
    console.log(`   ✔ Минали часове: ${pastCount}, Бъдещи часове: ${futureCount}`);
    assert(pastCount > 0, "Трябва да има поне 1 минал час");
    assert(futureCount > 0, "Трябва да има поне 1 бъдещ час");

    // 10h. Location-based service linkage
    for (const loc of [loc1, loc2]) {
      const locSvcCount = await Service.countDocuments({
        business: business._id,
        locationIds: loc._id,
      });
      assert(locSvcCount === 3, `Локация "${loc.name}" — очаквани 3 услуги, получени ${locSvcCount}`);
    }
    console.log("   ✔ Всяка локация има по 3 услуги");

    // ── Summary ────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                 ✅  SEED + TEST PASSED!                     ║
╠══════════════════════════════════════════════════════════════╣
║  Бизнес:     ${business.businessName.padEnd(44)}║
║  Локации:    ${String(counters.locations).padEnd(44)}║
║  Служители:  ${String(counters.users - clients.length - 1).padEnd(44)}║
║  Услуги:     ${String(counters.services).padEnd(44)}║
║  Графици:    ${String(counters.schedules).padEnd(44)}║
║  Часове:     ${String(counters.appointments).padEnd(44)}║
║  Клиенти:    ${String(clients.length).padEnd(44)}║
╠══════════════════════════════════════════════════════════════╣
║  Акаунт:   ${ownerEmail.padEnd(46)}║
║  Парола:   ${"Test1234!".padEnd(46)}║
║  Време:    ${(elapsed + "s").padEnd(46)}║
╚══════════════════════════════════════════════════════════════╝
`);

    console.log("📧  Имейли за вход (парола за всички: Test1234!):\n");
    console.log(`   👑 Собственик:  ${ownerEmail}`);
    console.log("");
    console.log(`   📍 ${loc1.name}:`);
    for (const { user: s, location: loc } of staffMembers) {
      if (loc._id.equals(loc1._id)) {
        console.log(`      👤 ${s.firstName} ${s.lastName}  →  ${s.email}`);
      }
    }
    console.log("");
    console.log(`   📍 ${loc2.name}:`);
    for (const { user: s, location: loc } of staffMembers) {
      if (loc._id.equals(loc2._id)) {
        console.log(`      👤 ${s.firstName} ${s.lastName}  →  ${s.email}`);
      }
    }
    console.log("");
    console.log("   🧑 Клиенти:");
    for (const cl of clients) {
      console.log(`      👤 ${cl.firstName} ${cl.lastName}  →  ${cl.email}`);
    }
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("\n╔══════════════════════════════════════════════════════════════╗");
    console.error("║                 ❌  SEED FAILED!                            ║");
    console.error("╚══════════════════════════════════════════════════════════════╝\n");
    console.error(error);
    process.exit(1);
  }
};

seedAndTest();
