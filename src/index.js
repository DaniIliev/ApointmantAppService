import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";

// Импортиране на рутерите
import authRoutes from "./routes/auth.routes.js";
import businessRoutes from "./routes/business.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import staffScheduleRoutes from "./routes/staff-shedule.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js"; // <-- Импортираме новия рутер
import { swaggerDocs } from "./config/swagger.js";
import { notFound, errorHandler } from "./middlewares/error.js";
import chatbot from "./chatbot/chatbot.js"; // <-- Импортираме чатбот инстанцията

dotenv.config();

const app = express();
const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
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

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
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
app.use("/api/chatbot", chatbotRoutes); // <-- Използваме рутера

app.use(notFound);
app.use(errorHandler);

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_URI.split("/").pop() });
    console.log("✅ MongoDB connected");
    await chatbot.initialize(); // <-- Вече не чакаме тук, а в рутера
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
    console.log(`📘 Swagger UI: http://localhost:${PORT}/api-docs`);
  } catch (err) {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  }
})();
