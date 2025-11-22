// chatbot/chatbot.js
import natural from "natural";
import { TRAINING_DATA, Intents } from "./intents.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import moment from "moment";
import mongoose from "mongoose";
import { getAvailableSlots } from "../utils/AppointmentUtilities.js";

class Chatbot {
  constructor() {
    this.classifier = null;
    this.conversationState = {};
    this.lastActivity = {};
    this.rateCounters = {};
    this.initialized = false;
    // Configurable runtime parameters
    this.TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout
    this.RATE_LIMIT_MAX = 10; // Max messages per minute per user
    this.RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
  }

  async initialize() {
    if (this.initialized) {
      console.log("Chatbot model already initialized.");
      return;
    }
    console.log("Initializing chatbot model...");

    this.classifier = new natural.BayesClassifier();

    let docsCount = 0;
    for (const intent in TRAINING_DATA) {
      TRAINING_DATA[intent].forEach((text) => {
        this.classifier.addDocument(text.toLowerCase(), intent);
        docsCount++;
      });
    }
    console.log("📄 Documents added:", docsCount);
    this.classifier.train();
    this.initialized = true;
    console.log("Chatbot model successfully trained and ready!");
  }

  async processMessage(message, userId, businessId) {
    try {
      console.log(
        "🔍 Initialized:",
        this.initialized,
        "Classifier:",
        !!this.classifier
      );

      if (!this.initialized) {
        console.log("🤖 Initializing inside processMessage...");
        await this.initialize();
      }

      if (!this.conversationState[userId]) {
        this.conversationState[userId] = {
          intent: null,
          service: null,
          staff: null,
          date: null,
          time: null,
          clientName: null,
          clientEmail: null,
          clientPhone: null,
        };
      }

      const currentState = this.conversationState[userId];
      const lowerCaseMessage = (message || "").toLowerCase();

      // -------- Rate limiting --------
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
        console.warn("⏱️ Rate limit exceeded for user", userId);
        return "Моля, изчакайте малко преди да изпратите още съобщения.";
      }

      // -------- Inactivity timeout --------
      const last = this.lastActivity[userId];
      if (last && nowTs - last > this.TIMEOUT_MS) {
        console.log(
          "🕒 Inactivity timeout; resetting conversation for",
          userId
        );
        this.conversationState[userId] = {
          intent: null,
          service: null,
          staff: null,
          date: null,
          time: null,
        };
      }
      this.lastActivity[userId] = nowTs;

      // -------- Date parsing helper --------
      const parseRequestedDate = () => {
        if (/(днес)/i.test(lowerCaseMessage)) {
          return moment().format("YYYY-MM-DD");
        }
        if (/(утре)/i.test(lowerCaseMessage)) {
          return moment().add(1, "day").format("YYYY-MM-DD");
        }
        const dateMatch = lowerCaseMessage.match(
          /(\d{1,2}[\.\/]\d{1,2}(?:[\.\/]\d{2,4})?)/
        );
        if (dateMatch) {
          const raw = dateMatch[1];
          const parts = raw.split(/[\.\/]/).map((p) => p.trim());
          let day = parts[0];
          let month = parts[1];
          let year = parts[2];
          if (!year) year = moment().format("YYYY");
          if (year.length === 2) year = "20" + year;
          const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(
            2,
            "0"
          )}`;
          if (moment(iso, "YYYY-MM-DD", true).isValid()) return iso;
        }
        return null;
      };
      const requestedDate = parseRequestedDate();

      // Early greeting regex (covers punctuation / trailing spaces)
      const greetingRegex = /^(здравей|здравейте|здрасти|привет)[!.,\s]*$/i;
      if (greetingRegex.test(message.trim())) {
        this.conversationState[userId] = { intent: Intents.GREETING };
        console.log("🙋 Early regex greeting matched for user:", userId);
        return "Здравейте! Аз съм вашият виртуален асистент. С какво мога да ви помогна? Може да кажете 'Искам да запазя час' или 'Кои са свободните часове?'";
      }
      // Early availability regex
      const availabilityRegex =
        /(кои|какви|има ли|покажи).*(свободн|наличн).*(час|часове)|свободни часове|налични часове/i;
      if (availabilityRegex.test(lowerCaseMessage)) {
        currentState.intent = Intents.CHECK_AVAILABILITY;
        console.log("🕒 Early regex availability matched for user:", userId);
        // Fall through so classifier probabilities logged; override intent later
      }
      // Early booking regex to catch variants before classifier
      const bookingRegex =
        /(искам|може ли|мога ли).*(да)?\s*(запазя|запиша|резервирам)\s*час/i;
      if (bookingRegex.test(lowerCaseMessage)) {
        currentState.intent = Intents.BOOK_APPOINTMENT;
        console.log("📌 Early regex booking intent matched for user:", userId);
        // Downstream logic will pick this up via currentState.intent
      }
      let intent = Intents.UNKNOWN;
      try {
        intent = this.classifier.classify(lowerCaseMessage);
      } catch (classErr) {
        console.error("Classifier error, defaulting to UNKNOWN:", classErr);
        intent = Intents.UNKNOWN;
      }
      // If regex set a desired intent, override classifier outcome
      if (
        currentState.intent === Intents.CHECK_AVAILABILITY &&
        intent !== Intents.CHECK_AVAILABILITY
      ) {
        console.log(
          "🔁 Overriding classifier intent to CHECK_AVAILABILITY due to regex match."
        );
        intent = Intents.CHECK_AVAILABILITY;
      }

      // Log classification probabilities for debugging
      if (this.classifier && this.classifier.getClassifications) {
        try {
          const probs = this.classifier.getClassifications(lowerCaseMessage);
          console.log("📊 Intent probabilities:", probs);
        } catch (probErr) {
          console.warn("Could not get intent probabilities:", probErr);
        }
      }
      console.log(
        "🤖 ProcessMessage inputs - UserID:",
        userId,
        "BusinessID:",
        businessId
      );
      console.log("📩 Incoming message:", message);
      console.log("🧠 Classified intent:", intent);
      console.log("📌 Current state for user:", currentState);

      // Reset conversation
      if (
        ["отказ", "отмени", "започни отначало", "спри", "не"].includes(
          lowerCaseMessage.trim()
        )
      ) {
        this.conversationState[userId] = {};
        console.log("❌ Conversation reset for user:", userId);
        return "Разговорът е прекратен. Ако искате да запазите час, просто кажете 'искам да запазя час'.";
      }

      // Greeting
      if (intent === Intents.GREETING) {
        this.conversationState[userId] = {
          ...this.conversationState[userId],
          intent: Intents.GREETING,
        };
        console.log("🙋 Greeting detected for user:", userId);
        return "Здравейте! Аз съм вашият виртуален асистент. С какво мога да ви помогна? Мога да ви помогна със запазване на час.";
      }

      // Booking flow
      if (
        intent === Intents.BOOK_APPOINTMENT ||
        currentState.intent === Intents.BOOK_APPOINTMENT
      ) {
        currentState.intent = Intents.BOOK_APPOINTMENT;
        console.log("📅 Booking flow started for user:", userId);

        // Step 1: Ask for service
        if (!currentState.service) {
          let services = [];
          try {
            services = await Service.find({ business: businessId }).lean();
            console.log("Services fetched count:", services.length);
          } catch (svcErr) {
            console.error("Service fetch error:", svcErr);
            return "Възникна грешка при зареждане на услугите. Опитайте отново.";
          }

          if (!services || services.length === 0) {
            this.conversationState[userId] = {};
            return "За съжаление, няма налични услуги в момента.";
          }

          const normalizedMsg = lowerCaseMessage.replace(/\s+/g, " ").trim();
          const foundService = services.find((s) => {
            try {
              const rawName = String(s.name || "");
              const name = rawName.toLowerCase().trim(); // remove trailing spaces
              if (!name) return false;
              // Exact word boundary match
              const wordBoundaryMatch = new RegExp(
                `(^|[^а-яa-z0-9])${name}($|[^а-яa-z0-9])`,
                "i"
              ).test(normalizedMsg);
              // Explicit selection verbs before name (избирам <name>)
              const selectionPattern = new RegExp(
                `(?:избирам|вземам|избера|искам)\\s+${name}`,
                "i"
              ).test(normalizedMsg);
              // Simple substring fallback
              const substring = normalizedMsg.includes(name);
              return wordBoundaryMatch || selectionPattern || substring;
            } catch (e) {
              return false;
            }
          });

          if (foundService) {
            currentState.service = foundService;

            const serviceStaffs = Array.isArray(foundService.staffs)
              ? foundService.staffs
              : [];
            if (serviceStaffs.length === 0) {
              this.conversationState[userId] = {};
              return `За услугата "${foundService.name}" няма налични служители в момента. Моля, изберете друга услуга.`;
            }
            const staffIds = serviceStaffs
              .map((s) => s?._id)
              .filter((id) => mongoose.Types.ObjectId.isValid(id));
            if (staffIds.length === 0) {
              this.conversationState[userId] = {};
              return `За услугата "${foundService.name}" няма валидни служители.`;
            }
            const staffForService = await User.find({
              _id: { $in: staffIds },
            }).lean();

            if (!staffForService || staffForService.length === 0) {
              this.conversationState[userId] = {};
              return `За услугата "${foundService.name}" няма налични служители в момента.`;
            }

            const staffNames = staffForService
              .map((s) => `${s.firstName} ${s.lastName}`)
              .join(", ");
            return `Отлично! Избрахте услуга "${foundService.name}" (${foundService.duration} мин, ${foundService.price} лв). Налични служители: ${staffNames}. При кого бихте искали да запазите час?`;
          } else {
            const serviceList = services
              .map((s) => `• ${s.name} (${s.duration} мин, ${s.price} лв)`)
              .join("\n");
            return `Моля, изберете услуга от следните:\n${serviceList}`;
          }
        }

        // Step 2: Ask for staff
        if (currentState.service && !currentState.staff) {
          const serviceStaffs2 = Array.isArray(currentState.service.staffs)
            ? currentState.service.staffs
            : [];
          const staffIds = serviceStaffs2
            .map((s) => s?._id)
            .filter((id) => mongoose.Types.ObjectId.isValid(id));
          if (staffIds.length === 0) {
            this.conversationState[userId] = {};
            return "За избраната услуга няма валидни служители. Опитайте друга услуга.";
          }
          const staffForService = await User.find({
            _id: { $in: staffIds },
          }).lean();

          const foundStaff = staffForService.find(
            (s) =>
              lowerCaseMessage.includes(s.firstName.toLowerCase()) ||
              lowerCaseMessage.includes(s.lastName.toLowerCase())
          );

          if (foundStaff) {
            currentState.staff = foundStaff;

            let slots = [];
            try {
              const dateForSearch =
                requestedDate || moment().format("YYYY-MM-DD");
              const avail = await getAvailableSlots(
                foundStaff._id,
                dateForSearch,
                currentState.service.duration
              );
              slots = avail.slots || [];
            } catch (slotErr) {
              console.error("Slot calc error:", slotErr);
              return "Възникна грешка при проверка на свободните часове. Опитайте отново.";
            }
            const now = moment();
            const searchDate = requestedDate || moment().format("YYYY-MM-DD");
            const availableToday = slots.filter((slot) =>
              moment(`${searchDate}T${slot.startTime}`).isAfter(now)
            );

            if (availableToday.length > 0) {
              const closestSlot = availableToday[0];
              currentState.date = searchDate;
              currentState.time = closestSlot.startTime;
              return `Най-близкият свободен час при ${foundStaff.firstName} ${
                foundStaff.lastName
              } е ${
                searchDate === moment().format("YYYY-MM-DD")
                  ? "днес"
                  : moment(searchDate).format("DD.MM.YYYY")
              } в ${
                closestSlot.startTime
              }. Моля, въведете вашето име, за да продължим (пример: Иван Петров).`;
            } else {
              let foundSlot = null;
              let foundDate = null;

              for (let i = 1; i <= 7; i++) {
                const searchDate = moment().add(i, "days").format("YYYY-MM-DD");
                try {
                  const { slots: futureSlots } = await getAvailableSlots(
                    foundStaff._id,
                    searchDate,
                    currentState.service.duration
                  );
                  if (futureSlots.length > 0) {
                    foundSlot = futureSlots[0];
                    foundDate = searchDate;
                    break;
                  }
                } catch (futureErr) {
                  console.warn(
                    "Future slot check failed for date",
                    searchDate,
                    futureErr
                  );
                }
              }

              if (foundSlot && foundDate) {
                currentState.date = foundDate;
                currentState.time = foundSlot.startTime;
                return `${foundStaff.firstName} ${
                  foundStaff.lastName
                } няма свободни часове днес. Най-близкият свободен час е на ${moment(
                  foundDate
                ).format("DD.MM.YYYY")} в ${
                  foundSlot.startTime
                }. Моля, напишете вашето име, за да продължим.`;
              } else {
                this.conversationState[userId] = {};
                return `За съжаление, ${foundStaff.firstName} ${foundStaff.lastName} няма свободни часове в следващите 7 дни. Моля, изберете друг служител или опитайте по-късно.`;
              }
            }
          } else {
            const staffNames = staffForService
              .map((s) => `${s.firstName} ${s.lastName}`)
              .join(", ");
            return `Моля, изберете служител от: ${staffNames}.`;
          }
        }

        // Step 3: Confirm booking
        if (
          currentState.service &&
          currentState.staff &&
          currentState.date &&
          currentState.time
        ) {
          // Sequential data collection: name -> email -> phone -> confirmation
          const collectName = !currentState.clientName;
          const collectEmail =
            currentState.clientName && !currentState.clientEmail;
          const collectPhone =
            currentState.clientName &&
            currentState.clientEmail &&
            !currentState.clientPhone;

          if (collectName) {
            // Simple heuristic: if message contains letters and not already recognized as confirmation, treat entire input as name
            const nameCandidate = message.trim();
            const nameOk = /^[A-Za-zА-Яа-яЁёІіЇїЬьЪъ\s'-]{2,50}$/.test(
              nameCandidate
            );
            if (nameOk && !/(да|не|отказ)/i.test(nameCandidate.toLowerCase())) {
              currentState.clientName = nameCandidate
                .replace(/\s+/g, " ")
                .trim();
              return (
                "Записах името: " +
                currentState.clientName +
                ". Моля, въведете вашия email."
              );
            }
            return "Моля, въведете вашето име (пример: Иван Петров).";
          }

          if (collectEmail) {
            const emailCandidate = message.trim();
            const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
              emailCandidate
            );
            if (emailOk) {
              currentState.clientEmail = emailCandidate;
              return (
                "Записах email: " +
                currentState.clientEmail +
                ". Моля, въведете телефон (пример: +359888123456)."
              );
            }
            return "Моля, въведете валиден email адрес.";
          }

          if (collectPhone) {
            const phoneCandidate = message.trim();
            const phoneOk = /^(\+?\d[\d\s-]{6,18})$/.test(phoneCandidate);
            if (phoneOk) {
              currentState.clientPhone = phoneCandidate.replace(/\s+/g, " ");
              return (
                "Записах телефон: " +
                currentState.clientPhone +
                `. Потвърдете запазването с 'да' или отменете с 'не'.`
              );
            }
            return "Моля, въведете валиден телефон (цифри, може +359).";
          }

          // Now we have all data; wait for confirmation
          if (
            lowerCaseMessage.includes("да") ||
            lowerCaseMessage.includes("потвърди") ||
            lowerCaseMessage.includes("запази")
          ) {
            try {
              const startDateTime = moment(
                `${currentState.date}T${currentState.time}`
              );
              await Appointment.create({
                business: businessId,
                service: currentState.service._id,
                appointmentTime: {
                  start: startDateTime.toDate(),
                  end: startDateTime
                    .clone()
                    .add(currentState.service.duration, "minutes")
                    .toDate(),
                },
                client: userId,
                clientName: currentState.clientName || "Чатбот Клиент",
                clientPhone: currentState.clientPhone || "Няма",
                email: currentState.clientEmail || "chatbot@example.com",
                staff: currentState.staff._id,
                status: "pending",
              });
              console.log(
                "✅ Appointment created via chatbot for user",
                userId
              );
              const successMessage =
                `✅ Благодаря! Вашият час е успешно запазен!\n\n` +
                `📋 Детайли:\n` +
                `• Услуга: ${currentState.service.name}\n` +
                `• Служител: ${currentState.staff.firstName} ${currentState.staff.lastName}\n` +
                `• Дата: ${startDateTime.format("DD.MM.YYYY")}\n` +
                `• Час: ${startDateTime.format("HH:mm")}\n` +
                `• Продължителност: ${currentState.service.duration} минути\n` +
                `• Цена: ${currentState.service.price} лв\n` +
                (currentState.clientName
                  ? `• Клиент: ${currentState.clientName}\n`
                  : "") +
                (currentState.clientEmail
                  ? `• Email: ${currentState.clientEmail}\n`
                  : "") +
                (currentState.clientPhone
                  ? `• Телефон: ${currentState.clientPhone}\n`
                  : "") +
                `\nОчакваме ви!`;
              this.conversationState[userId] = {};
              return successMessage;
            } catch (error) {
              console.error("Error creating appointment:", error);
              this.conversationState[userId] = {};
              return "Съжалявам, възникна грешка при запазването на часа. Моля, опитайте отново.";
            }
          }
          if (
            lowerCaseMessage.includes("не") ||
            lowerCaseMessage.includes("отказ")
          ) {
            this.conversationState[userId] = {};
            return 'Запазването е отменено. Ако искате нов час, кажете "искам да запазя час".';
          }
          return 'Моля, потвърдете със "да" или отменете с "не".';
        }
      }

      // Check availability
      if (intent === Intents.CHECK_AVAILABILITY) {
        try {
          const services = await Service.find({ business: businessId }).lean();
          const allStaffIds = new Set();

          services.forEach((service) => {
            if (Array.isArray(service.staffs)) {
              service.staffs.forEach((staff) => {
                if (staff && staff._id) {
                  allStaffIds.add(String(staff._id));
                }
              });
            }
          });

          const validStaffIds = Array.from(allStaffIds).filter((id) =>
            mongoose.Types.ObjectId.isValid(id)
          );
          const staff = await User.find({
            _id: { $in: validStaffIds },
          }).lean();

          if (!staff || staff.length === 0) {
            return "Няма налични служители в момента.";
          }

          // Staff-specific availability: "свободни часове при <име>"
          const staffNameMatch = lowerCaseMessage.match(
            /(?:при|за)\s+([А-ЯA-Zа-яa-z]+)/i
          );
          if (staffNameMatch) {
            const fragment = staffNameMatch[1].toLowerCase();
            const chosen = staff.find(
              (s) =>
                s.firstName.toLowerCase().startsWith(fragment) ||
                s.lastName.toLowerCase().startsWith(fragment)
            );
            if (chosen) {
              let duration = 30;
              const durations = [];
              services.forEach((svc) => {
                if (
                  Array.isArray(svc.staffs) &&
                  svc.staffs.some(
                    (st) =>
                      st && st._id && String(st._id) === String(chosen._id)
                  )
                ) {
                  durations.push(svc.duration);
                }
              });
              if (durations.length > 0) duration = Math.min(...durations);
              const dateSearch = requestedDate || moment().format("YYYY-MM-DD");
              let availSlots = [];
              try {
                const { slots: staffSlots } = await getAvailableSlots(
                  chosen._id,
                  dateSearch,
                  duration
                );
                availSlots = staffSlots;
              } catch (asErr) {
                console.warn("Staff-specific availability slot error", asErr);
              }
              if (availSlots.length === 0) {
                return `Няма свободни часове при ${chosen.firstName} ${chosen.lastName} за избраната дата.`;
              }
              const slotList = availSlots
                .slice(0, 10)
                .map((slt) => slt.startTime)
                .join(", ");
              return `Свободни часове при ${chosen.firstName} ${
                chosen.lastName
              } на ${moment(dateSearch).format(
                "DD.MM.YYYY"
              )} : ${slotList}. За да запазите час, кажете 'Искам да запазя час'.`;
            }
          }
          const staffList = staff
            .map((s) => `• ${s.firstName} ${s.lastName}`)
            .join("\n");
          return `Налични служители:\n${staffList}\n\nМоже да попитате: 'Свободни часове при <име>' или да кажете 'Искам да запазя час'.`;
        } catch (error) {
          console.error("Error checking availability:", error);
          return "Съжалявам, възникна грешка при проверката на наличността.";
        }
      }

      // Unknown intent
      console.log("🤷 Unknown intent for user:", userId);
      return "Съжалявам, не мога да ви разбера. Моля, опитайте:\n• 'Искам да запазя час'\n• 'Кои са свободните часове?'\n• 'Здравей' за начало";
    } catch (err) {
      console.error("💥 Chatbot processing error:", err);
      // Keep state so user can retry or decide to restart
      return "Възникна вътрешна грешка. Моля, опитайте отново или напишете 'отказ'.";
    }
  }
}

const chatbot = new Chatbot();
export default chatbot;
