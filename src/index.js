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
import { swaggerDocs } from "./config/swagger.js";
import { notFound, errorHandler } from "./middlewares/error.js";

// Зареждане на променливите от .env файла
dotenv.config();

// Инициализиране на Express приложението
const app = express();
// Създаваме HTTP сървър, към който ще прикачим Express и Socket.IO
const server = createServer(app);

// Инициализираме Socket.IO върху нашия `server`
export const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

// Обработка на Socket.IO връзки
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

// Дефиниране на портове и URI
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
);
app.use(express.json());

// Основен рутер за проверка на състоянието на API
app.get("/", (req, res) => {
  res.send("🚀 Appointment API is running. Go to /api-docs for Swagger UI");
});

// Интеграция на Swagger
swaggerDocs(app);

// Рутери на API
app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/service", serviceRoutes);
app.use("/api/appointment", appointmentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/staff-schedules", staffScheduleRoutes);
app.use("/api/alerts", alertRoutes);

// Middleware за обработка на грешки
app.use(notFound);
app.use(errorHandler);

// Асинхронна функция за свързване с базата данни и стартиране на сървъра
(async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_URI.split("/").pop() });
    console.log("✅ MongoDB connected");

    // Стартираме сървъра, използвайки `server.listen()`, а не `app.listen()`
    // Това гарантира, че и Express, и Socket.IO слушат на един и същ порт.
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
    console.log(`📘 Swagger UI: http://localhost:${PORT}/api-docs`);
  } catch (err) {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  }
})();

// import mongoose from "mongoose";
// import app from "./app.js";
// import dotenv from "dotenv";
// import { createServer } from "http";
// import { Server } from "socket.io";

// dotenv.config();

// const PORT = process.env.PORT || 5000;
// const MONGO_URI = process.env.MONGO_URI;
// const server = createServer(app);
// // Инициализираме Socket.IO сървъра, който работи върху HTTP сървъра
// export const io = new Server(server, {
//   cors: {
//     origin: "*", // Позволява връзки от всеки домейн, коригирайте според нуждите
//   },
// });
// io.on("connection", (socket) => {
//   console.log("A user connected:", socket.id);

//   // Клиентът може да изпрати своя потребителски ID, за да се присъедини към 'стая'
//   socket.on("joinRoom", (userId) => {
//     socket.join(userId);
//     console.log(`User ${userId} joined room`);
//   });

//   socket.on("disconnect", () => {
//     console.log("User disconnected");
//   });
// });

// (async () => {
//   try {
//     await mongoose.connect(MONGO_URI, { dbName: MONGO_URI.split("/").pop() });
//     console.log("✅ MongoDB connected");
//     app.listen(PORT, () =>
//       console.log(`🚀 Server running on http://localhost:${PORT}`)
//     );
//     console.log(`📘 Swagger UI: http://localhost:${PORT}/api-docs`);
//   } catch (err) {
//     console.error("Mongo connection error:", err.message);
//     process.exit(1);
//   }
// })();
