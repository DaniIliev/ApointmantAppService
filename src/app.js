import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import businessRoutes from "./routes/business.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import { swaggerDocs } from "./config/swagger.js";
import { notFound, errorHandler } from "./middlewares/error.js";

dotenv.config();

const app = express();
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

app.use(notFound);
app.use(errorHandler);

export default app;
