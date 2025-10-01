// chatbot/chatbot.js
import natural from "natural";
import { TRAINING_DATA, Intents } from "./intents.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import moment from "moment";
import { getAvailableSlots } from "../utils/AppointmentUtilities.js";

class Chatbot {
  constructor() {
    this.classifier = null;
    this.conversationState = {};
    this.initialized = false;
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
      };
    }

    const currentState = this.conversationState[userId];
    const lowerCaseMessage = message.toLowerCase();
    const intent = this.classifier.classify(lowerCaseMessage);

    console.log("📩 Incoming message:", message);
    console.log("🧠 Classified intent:", intent);
    console.log("📌 Current state for user:", currentState);

    if (
      ["отказ", "отмени", "започни отначало", "спри"].includes(lowerCaseMessage)
    ) {
      this.conversationState[userId] = {};
      console.log("❌ Conversation reset for user:", userId);
      return "Разговорът е прекратен. Моля, заповядайте отново.";
    }

    if (intent === Intents.GREETING) {
      this.conversationState[userId] = {
        ...this.conversationState[userId],
        intent: Intents.GREETING,
      };
      console.log("🙋 Greeting detected for user:", userId);
      return "Здравейте! Аз съм вашият виртуален асистент. С какво мога да ви помогна? Мога да ви помогна със запазване на час.";
    }

    if (
      intent === Intents.BOOK_APPOINTMENT ||
      currentState.intent === Intents.BOOK_APPOINTMENT
    ) {
      currentState.intent = Intents.BOOK_APPOINTMENT;
      console.log("📅 Booking flow started for user:", userId);

      if (!currentState.service) {
        const services = await Service.find({ business: businessId });
        const foundService = services.find((s) =>
          lowerCaseMessage.includes(s.name.toLowerCase())
        );

        if (foundService) {
          currentState.service = foundService;
          const staffForService = await User.find({
            role: "staff",
            _id: { $in: foundService.staffIds },
          });
          const staffNames = staffForService.map((s) => s.firstName).join(", ");

          return `Добре, услуга "${foundService.name}". За нея можем да ви предложим: ${staffNames}. При кого бихте искали?`;
        } else {
          const services = await Service.find({ business: businessId });
          const serviceNames = services.map((s) => s.name).join(", ");
          return `Не можах да намеря такава услуга. Моля, изберете от: ${serviceNames}.`;
        }
      }

      if (currentState.service && !currentState.staff) {
        const staffForService = await User.find({
          role: "staff",
          _id: { $in: currentState.service.staffIds },
        });
        const foundStaff = staffForService.find((s) =>
          lowerCaseMessage.includes(s.firstName.toLowerCase())
        );

        if (foundStaff) {
          currentState.staff = foundStaff;

          const { slots } = await getAvailableSlots(
            foundStaff._id,
            moment().format("YYYY-MM-DD"),
            currentState.service.duration
          );
          const now = moment();
          const availableToday = slots.filter((slot) =>
            moment(
              `${moment().format("YYYY-MM-DD")}T${slot.startTime}`
            ).isAfter(now)
          );

          if (availableToday.length > 0) {
            const closestSlot = availableToday[0];
            currentState.date = moment().format("YYYY-MM-DD");
            currentState.time = closestSlot.startTime;
            return `Най-близкият свободен час при ${foundStaff.firstName} е днес в ${closestSlot.startTime}. Искате ли да го запазите? (Отговорете с "да" или "не").`;
          } else {
            return `За съжаление, ${foundStaff.firstName} няма свободни часове днес. Опитайте с друг служител или друга услуга.`;
          }
        } else {
          const staffNames = staffForService.map((s) => s.firstName).join(", ");
          return `Не можах да намеря такъв служител. Моля, изберете от: ${staffNames}.`;
        }
      }

      if (
        currentState.service &&
        currentState.staff &&
        currentState.date &&
        currentState.time
      ) {
        if (
          lowerCaseMessage.includes("да") ||
          lowerCaseMessage.includes("потвърди")
        ) {
          const businessId = currentState.service.business;
          const serviceId = currentState.service._id;
          const staffId = currentState.staff._id;
          const startDateTime = moment(
            `${currentState.date}T${currentState.time}`
          ).toISOString();

          await Appointment.create({
            business: businessId,
            service: serviceId,
            appointmentTime: {
              start: moment(startDateTime).toDate(),
              end: moment(startDateTime)
                .add(currentState.service.duration, "minutes")
                .toDate(),
            },
            client: userId,
            clientName: "Чатбот Потребител",
            clientPhone: "0888888888",
            email: "chatbot@example.com",
            staff: staffId,
          });

          this.conversationState[userId] = {};
          return `Благодаря! Вашият час за услуга "${
            currentState.service.name
          }" при ${
            currentState.staff.firstName
          } е запазен. Очакваме ви на ${moment(startDateTime).format(
            "DD.MM.YYYY"
          )} в ${moment(startDateTime).format("HH:mm")}.`;
        }

        this.conversationState[userId] = {};
        return "Добре, тогава запазването на този час се отменя. Ако искате да запазите друг, просто кажете 'запази час'.";
      }
    }

    if (intent === Intents.UNKNOWN) {
      console.log("🤷 Unknown intent for user:", userId);
      return "Съжалявам, не мога да ви разбера. Моля, опитайте да преформулирате въпроса си.";
    }

    return "Съжалявам, не мога да ви разбера.";
  }
}

const chatbot = new Chatbot();
export default chatbot;
