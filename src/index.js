import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.routes.js";
import businessRoutes from "./routes/business.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import staffScheduleRoutes from "./routes/staff-shedule.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import stripeRoutes from "./routes/stripe.routes.js";
import stripeConnectRoutes from "./routes/stripeConnect.routes.js";
import stripeConnectWebhookRoutes from "./routes/stripeConnectWebhook.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import kanbanRoutes from "./routes/kanban.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { swaggerDocs } from "./config/swagger.js";
import { notFound, errorHandler } from "./middlewares/error.js";
import chatbot from "./chatbot/chatbot.js";
import { startSubscriptionExpirationJob } from "./jobs/subscriptionExpirationCheck.js";
import locationRoutes from "./routes/location.routes.js";
import "./config/passport.js";
import passport from "passport";

const app = express();
const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || process.env.TEST_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.on("joinRoom", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });
  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
console.log("CLIENT_URL:", process.env.CLIENT_URL);
app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000"].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
  })
);
app.use(
  "/api/v1/webhook",
  express.raw({ type: "application/json" }),
  webhookRoutes
);
// Stripe Connect webhook с raw body ПРЕДИ express.json()
app.use(
  "/api/stripe/connect/webhook",
  express.raw({ type: "application/json" }),
  stripeConnectWebhookRoutes
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🚀 Appointment API is running. Go to /api-docs for Swagger UI");
});

swaggerDocs(app);

app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/service", serviceRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/staff-schedules", staffScheduleRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/stripe", stripeConnectRoutes); // Stripe Connect endpoints
app.use("/api/kanban", kanbanRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/locations", locationRoutes);
app.use(passport.initialize());

app.use(notFound);
app.use(errorHandler);
console.log("MONGO_URI:", MONGO_URI);
(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected");
    await chatbot.initialize();

    startSubscriptionExpirationJob();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
    console.log(`📘 Swagger UI: http://localhost:${PORT}/api-docs`);
  } catch (err) {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  }
})();
