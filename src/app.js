import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import businessRoutes from "./routes/business.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import staffScheduleRoutes from "./routes/staff-shedule.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import { swaggerDocs } from "./config/swagger.js";
import { notFound, errorHandler } from "./middlewares/error.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const server = createServer(app);
// Инициализираме Socket.IO сървъра, който работи върху HTTP сървъра
export const io = new Server(server, {
  cors: {
    origin: "*", // Позволява връзки от всеки домейн, коригирайте според нуждите
  },
});
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Клиентът може да изпрати своя потребителски ID, за да се присъедини към 'стая'
  socket.on("joinRoom", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});
app.get("/", (req, res) => {
  console.log("home page");
  res.send("🚀 Appointment API is running. Go to /api-docs for Swagger UI");
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
);
app.use(express.json());
swaggerDocs(app);

app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/service", serviceRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/staff-schedules", staffScheduleRoutes);
app.use("/api/alerts", alertRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
