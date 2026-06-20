// chatbot/chatbot.js — Gemini AI-powered chatbot with full database context
import { GoogleGenerativeAI } from "@google/generative-ai";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Location from "../models/Location.js";
import Business from "../models/Business.js";
import Appointment from "../models/Appointment.js";
import StaffSchedule from "../models/StaffSchedule.js";
import mongoose from "mongoose";
import moment from "moment-timezone";
import { getAvailableSlots } from "../utils/AppointmentUtilities.js";

const APP_TIMEZONE = "Europe/Sofia";

class Chatbot {
  constructor() {
    this.conversations = {}; // userId -> { history: [], lastActivity: Date }
    this.rateCounters = {};
    this.TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    this.RATE_LIMIT_MAX = 12;
    this.RATE_LIMIT_WINDOW_MS = 60 * 1000;
    this.model = null;
  }

  _getGenAI() {
    if (this.genAI) return this.genAI;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    return this.genAI;
  }

  _createModelWithSystemPrompt(systemPrompt) {
    const genAI = this._getGenAI();
    return genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });
  }

  // ─── Gather full database context for a business ──────────────────
  async _gatherContext(businessId, locationId) {
    const [business, locations, services] = await Promise.all([
      Business.findById(businessId).lean(),
      Location.find({ businessId }).lean(),
      Service.find({ business: businessId }).lean(),
    ]);

    if (!business) return null;

    // Collect all unique staff IDs from services
    const allStaffIds = new Set();
    services.forEach((svc) => {
      if (Array.isArray(svc.staffMembers)) {
        svc.staffMembers.forEach((id) => {
          if (id && mongoose.Types.ObjectId.isValid(id)) {
            allStaffIds.add(String(id));
          }
        });
      }
    });

    const staffMembers = await User.find({
      _id: { $in: Array.from(allStaffIds) },
    }).lean();

    const staffMap = {};
    staffMembers.forEach((s) => {
      staffMap[String(s._id)] = {
        id: String(s._id),
        firstName: s.firstName || "",
        lastName: s.lastName || "",
        role: s.role || "staff",
      };
    });

    // Format locations
    const dayLabels = {
      monday: "Понеделник/Monday",
      tuesday: "Вторник/Tuesday",
      wednesday: "Сряда/Wednesday",
      thursday: "Четвъртък/Thursday",
      friday: "Петък/Friday",
      saturday: "Събота/Saturday",
      sunday: "Неделя/Sunday",
    };

    const formattedLocations = locations.map((loc) => {
      const hours = {};
      if (loc.weeklyWorkingHours) {
        for (const [day, label] of Object.entries(dayLabels)) {
          const wh = loc.weeklyWorkingHours[day];
          if (wh && !wh.isDayOff && wh.workTime?.start && wh.workTime?.end) {
            hours[label] = `${wh.workTime.start} - ${wh.workTime.end}`;
          } else {
            hours[label] = "Почивен ден / Day Off";
          }
        }
      }
      return {
        id: String(loc._id),
        name: loc.name,
        address: `${loc.address}, ${loc.city}`,
        phone: loc.phone || "N/A",
        email: loc.email || "N/A",
        workingHours: hours,
      };
    });

    // Format services
    const formattedServices = services.map((svc) => ({
      id: String(svc._id),
      name: svc.name,
      description: svc.description || "",
      duration: svc.duration,
      price: svc.price,
      category: svc.category,
      paymentOption: svc.paymentOption,
      isGroup: svc.isGroup || false,
      capacity: svc.capacity || 1,
      staffMembers: (svc.staffMembers || [])
        .map((id) => staffMap[String(id)])
        .filter(Boolean)
        .map((s) => `${s.firstName} ${s.lastName} (ID: ${s.id})`),
      locationIds: (svc.locationIds || []).map(String),
    }));

    // If a specific location is provided, get today's availability for staff at that location
    let availabilityInfo = "";
    if (locationId) {
      const targetLocation = locations.find(
        (l) => String(l._id) === String(locationId)
      );
      if (targetLocation) {
        const locationServices = services.filter(
          (svc) =>
            Array.isArray(svc.locationIds) &&
            svc.locationIds.some((lid) => String(lid) === String(locationId))
        );
        // Get unique staff for this location
        const locationStaffIds = new Set();
        locationServices.forEach((svc) => {
          (svc.staffMembers || []).forEach((id) => {
            if (id) locationStaffIds.add(String(id));
          });
        });

        const today = moment.tz(APP_TIMEZONE).format("YYYY-MM-DD");
        const availParts = [];
        for (const staffId of locationStaffIds) {
          const staff = staffMap[staffId];
          if (!staff) continue;
          // Find shortest service duration for this staff
          const staffServices = locationServices.filter(
            (svc) =>
              Array.isArray(svc.staffMembers) &&
              svc.staffMembers.some((id) => String(id) === staffId)
          );
          const minDuration =
            staffServices.length > 0
              ? Math.min(...staffServices.map((s) => s.duration))
              : 30;
          try {
            const { slots } = await getAvailableSlots(
              staffId,
              today,
              minDuration,
              locationId
            );
            const slotsToShow = (slots || []).slice(0, 8);
            if (slotsToShow.length > 0) {
              availParts.push(
                `  ${staff.firstName} ${staff.lastName}: свободни часове днес (${today}): ${slotsToShow.map((s) => s.startTime).join(", ")}${slots.length > 8 ? ` и още ${slots.length - 8}` : ""}`
              );
            } else {
              availParts.push(
                `  ${staff.firstName} ${staff.lastName}: няма свободни часове днес (${today})`
              );
            }
          } catch (e) {
            availParts.push(
              `  ${staff.firstName} ${staff.lastName}: не може да се провери наличността`
            );
          }
        }
        if (availParts.length > 0) {
          availabilityInfo = `\n\nДнешна наличност за локация "${targetLocation.name}" (${today}):\n${availParts.join("\n")}`;
        }
      }
    }

    return {
      business: {
        name: business.businessName,
        category: business.category || "",
        aboutUs: business.aboutUs || "",
      },
      locations: formattedLocations,
      services: formattedServices,
      staffList: Object.values(staffMap),
      availabilityInfo,
      currentDateTime: moment.tz(APP_TIMEZONE).format("YYYY-MM-DD HH:mm (dddd)"),
    };
  }

  // ─── Build the system prompt ──────────────────────────────────────
  _buildSystemPrompt(context, locationId) {
    const locationNote = locationId
      ? `\nThe user is currently on the page for location ID: ${locationId}. Prioritize information about this location.`
      : "";

    return `You are a professional, friendly virtual AI assistant for the business "${context.business.name}".
Your role is to help customers with questions about services, staff, locations, working hours, availability, and booking appointments.

CRITICAL RULES:
1. ALWAYS respond in the SAME LANGUAGE the user writes in. If they write in Bulgarian, respond in Bulgarian. If they write in English, respond in English. If they mix languages, prefer the dominant one.
2. Use ONLY the data provided below to answer questions. Do NOT invent information.
3. Be concise but helpful. Use bullet points and formatting when listing multiple items.
4. When a user wants to book an appointment, guide them step by step: ask for service → staff → date → time → client details (name, email, phone). Then confirm.
5. When you have ALL booking details confirmed by the user, output a special JSON block at the END of your message (after your human-readable confirmation) in this exact format:
\`\`\`json
{"action":"book","service":"<service_id>","staff":"<staff_id>","date":"YYYY-MM-DD","time":"HH:mm","clientName":"<name>","clientEmail":"<email>","clientPhone":"<phone>"}
\`\`\`
6. For availability queries, if you need to check a specific date/staff that isn't in the pre-loaded data, tell the user what you know and suggest they ask about a specific date.
7. Today's date and time: ${context.currentDateTime}
8. Use emojis sparingly to make responses feel warm (✅, 📅, ⏰, 💇, 📍 etc).
${locationNote}

═══ BUSINESS DATA ═══

📍 LOCATIONS:
${JSON.stringify(context.locations, null, 2)}

💇 SERVICES:
${JSON.stringify(context.services, null, 2)}

👥 STAFF:
${JSON.stringify(context.staffList, null, 2)}
${context.availabilityInfo}

═══ END OF DATA ═══

Remember: Be helpful, accurate, and respond in the user's language.`;
  }

  // ─── Fetch availability for a specific staff + date on demand ─────
  async _getAvailabilityForStaffDate(staffId, date, serviceDuration, locationId) {
    try {
      const { slots } = await getAvailableSlots(
        staffId,
        date,
        serviceDuration,
        locationId
      );
      return slots || [];
    } catch (e) {
      console.error("Availability check error:", e);
      return [];
    }
  }

  // ─── Process message ──────────────────────────────────────────────
  async processMessage(message, userId, businessId, locationId = null) {
    try {
      // Rate limiting
      const nowTs = Date.now();
      if (!this.rateCounters[userId]) {
        this.rateCounters[userId] = { count: 0, windowStart: nowTs };
      }
      const rc = this.rateCounters[userId];
      if (nowTs - rc.windowStart > this.RATE_LIMIT_WINDOW_MS) {
        rc.windowStart = nowTs;
        rc.count = 0;
      }
      rc.count++;
      if (rc.count > this.RATE_LIMIT_MAX) {
        return "⏳ Моля, изчакайте малко преди да изпратите още съобщения. / Please wait before sending more messages.";
      }

      // Check inactivity timeout
      const conv = this.conversations[userId];
      if (conv && nowTs - conv.lastActivity > this.TIMEOUT_MS) {
        delete this.conversations[userId];
      }

      // Initialize or get conversation
      if (!this.conversations[userId]) {
        this.conversations[userId] = {
          history: [],
          lastActivity: nowTs,
          businessId,
          locationId,
        };
      }
      const conversation = this.conversations[userId];
      conversation.lastActivity = nowTs;

      // Gather database context
      const context = await this._gatherContext(businessId, locationId);
      if (!context) {
        return "❌ Не мога да намеря информация за този бизнес. / Cannot find business information.";
      }

      // Check if user is asking about availability for a specific date/staff
      // Parse date from message for extra context
      const lowerMsg = message.toLowerCase();
      let extraAvailability = "";

      // Try to detect date requests
      const datePatterns = [
        { regex: /\b(днес|today)\b/i, offset: 0 },
        { regex: /\b(утре|tomorrow)\b/i, offset: 1 },
        { regex: /\b(вдругиден)\b/i, offset: 2 },
      ];
      const explicitDateMatch = lowerMsg.match(
        /(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/
      );

      let requestedDate = null;
      for (const dp of datePatterns) {
        if (dp.regex.test(lowerMsg)) {
          requestedDate = moment
            .tz(APP_TIMEZONE)
            .add(dp.offset, "days")
            .format("YYYY-MM-DD");
          break;
        }
      }
      if (!requestedDate && explicitDateMatch) {
        let [, day, month, year] = explicitDateMatch;
        if (!year) year = moment.tz(APP_TIMEZONE).format("YYYY");
        if (year.length === 2) year = "20" + year;
        const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        if (moment(iso, "YYYY-MM-DD", true).isValid()) {
          requestedDate = iso;
        }
      }

      // If we detect a date and staff name in the message, pre-fetch availability
      if (requestedDate) {
        const staffToCheck = context.staffList.filter((s) => {
          const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
          return (
            lowerMsg.includes(s.firstName.toLowerCase()) ||
            lowerMsg.includes(s.lastName.toLowerCase()) ||
            lowerMsg.includes(fullName)
          );
        });

        if (staffToCheck.length > 0) {
          const availParts = [];
          for (const staff of staffToCheck) {
            // Find the minimum service duration for this staff
            const staffServices = context.services.filter((svc) =>
              svc.staffMembers.some((sm) => sm.includes(staff.id))
            );
            const minDur =
              staffServices.length > 0
                ? Math.min(...staffServices.map((s) => s.duration))
                : 30;
            const slots = await this._getAvailabilityForStaffDate(
              staff.id,
              requestedDate,
              minDur,
              locationId
            );
            if (slots.length > 0) {
              const slotTimes = slots.slice(0, 12).map((s) => s.startTime).join(", ");
              availParts.push(
                `${staff.firstName} ${staff.lastName} on ${requestedDate}: ${slotTimes}${slots.length > 12 ? ` (+${slots.length - 12} more)` : ""}`
              );
            } else {
              availParts.push(
                `${staff.firstName} ${staff.lastName} on ${requestedDate}: no available slots`
              );
            }
          }
          extraAvailability = `\n\n[REAL-TIME AVAILABILITY DATA for this query]:\n${availParts.join("\n")}`;
        } else {
          // No specific staff mentioned, check all staff
          const availParts = [];
          for (const staff of context.staffList) {
            const staffServices = context.services.filter((svc) =>
              svc.staffMembers.some((sm) => sm.includes(staff.id))
            );
            const minDur =
              staffServices.length > 0
                ? Math.min(...staffServices.map((s) => s.duration))
                : 30;
            const slots = await this._getAvailabilityForStaffDate(
              staff.id,
              requestedDate,
              minDur,
              locationId
            );
            if (slots.length > 0) {
              const slotTimes = slots.slice(0, 8).map((s) => s.startTime).join(", ");
              availParts.push(
                `${staff.firstName} ${staff.lastName}: ${slotTimes}${slots.length > 8 ? ` (+${slots.length - 8} more)` : ""}`
              );
            } else {
              availParts.push(
                `${staff.firstName} ${staff.lastName}: no slots`
              );
            }
          }
          extraAvailability = `\n\n[REAL-TIME AVAILABILITY for ${requestedDate}]:\n${availParts.join("\n")}`;
        }
      }

      // Build the conversation for Gemini
      const systemPrompt = this._buildSystemPrompt(context, locationId) + extraAvailability;

      // Add user message to history
      conversation.history.push({
        role: "user",
        parts: [{ text: message }],
      });

      // Keep history manageable (last 20 messages)
      if (conversation.history.length > 20) {
        conversation.history = conversation.history.slice(-20);
      }

      // Call Gemini
      const model = this._createModelWithSystemPrompt(systemPrompt);
      const chat = model.startChat({
        history: conversation.history.slice(0, -1), // All except last
      });

      const result = await chat.sendMessage(message);
      const responseText = result.response.text();

      // Add assistant response to history
      conversation.history.push({
        role: "model",
        parts: [{ text: responseText }],
      });

      // Check if response contains a booking action
      const bookingAction = this._extractBookingAction(responseText);
      if (bookingAction) {
        const bookingResult = await this._executeBooking(
          bookingAction,
          businessId,
          userId,
          locationId
        );
        if (bookingResult.success) {
          // Remove the JSON block from the displayed response
          const cleanResponse = responseText
            .replace(/```json[\s\S]*?```/g, "")
            .trim();
          // Reset conversation after successful booking
          delete this.conversations[userId];
          return cleanResponse || bookingResult.message;
        } else {
          return bookingResult.message;
        }
      }

      // Remove any accidental JSON blocks from response for display
      const cleanResponse = responseText.replace(/```json[\s\S]*?```/g, "").trim();
      return cleanResponse;
    } catch (err) {
      console.error("💥 Chatbot processing error:", err);
      if (err.message?.includes("GEMINI_API_KEY")) {
        return "⚠️ AI системата не е конфигурирана. Моля, свържете се с администратора. / AI system is not configured.";
      }
      return "❌ Възникна грешка. Моля, опитайте отново. / An error occurred. Please try again.";
    }
  }

  // ─── Extract booking action from response ─────────────────────────
  _extractBookingAction(responseText) {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.action === "book") {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse booking JSON:", e);
    }
    return null;
  }

  // ─── Execute booking ──────────────────────────────────────────────
  async _executeBooking(action, businessId, userId, locationId) {
    try {
      const { service, staff, date, time, clientName, clientEmail, clientPhone } =
        action;

      // Validate required fields
      if (!service || !staff || !date || !time) {
        return {
          success: false,
          message:
            "❌ Липсват данни за резервацията. Моля, уточнете услуга, служител, дата и час.",
        };
      }

      // Validate service exists
      const serviceDoc = await Service.findById(service).lean();
      if (!serviceDoc) {
        return {
          success: false,
          message: "❌ Услугата не е намерена. Моля, опитайте отново.",
        };
      }

      // Validate staff exists
      const staffDoc = await User.findById(staff).lean();
      if (!staffDoc) {
        return {
          success: false,
          message: "❌ Служителят не е намерен. Моля, опитайте отново.",
        };
      }

      // Check slot is still available
      const slots = await this._getAvailabilityForStaffDate(
        staff,
        date,
        serviceDoc.duration,
        locationId
      );
      const slotAvailable = slots.some((s) => s.startTime === time);
      if (!slotAvailable) {
        return {
          success: false,
          message: `❌ За съжаление, часът ${time} на ${date} вече не е свободен. Моля, изберете друг час.`,
        };
      }

      const startDateTime = moment.tz(
        `${date}T${time}`,
        "YYYY-MM-DDTHH:mm",
        APP_TIMEZONE
      );

      await Appointment.create({
        business: businessId,
        service: serviceDoc._id,
        appointmentTime: {
          start: startDateTime.toDate(),
          end: startDateTime
            .clone()
            .add(serviceDoc.duration, "minutes")
            .toDate(),
        },
        client: mongoose.Types.ObjectId.isValid(userId) ? userId : undefined,
        clientName: clientName || "Chatbot Client",
        clientPhone: clientPhone || "",
        email: clientEmail || "",
        staff: staffDoc._id,
        status: "pending",
        locationId: locationId || undefined,
      });

      console.log("✅ Appointment created via AI chatbot for user", userId);

      return {
        success: true,
        message: `✅ Часът е успешно запазен!\n📋 ${serviceDoc.name}\n👤 ${staffDoc.firstName} ${staffDoc.lastName}\n📅 ${startDateTime.format("DD.MM.YYYY")} в ${startDateTime.format("HH:mm")}\n⏱️ ${serviceDoc.duration} мин | 💰 ${serviceDoc.price} лв`,
      };
    } catch (error) {
      console.error("Booking execution error:", error);
      return {
        success: false,
        message:
          "❌ Грешка при запазване на часа. Моля, опитайте отново. / Booking error. Please try again.",
      };
    }
  }
}

const chatbot = new Chatbot();
export default chatbot;
