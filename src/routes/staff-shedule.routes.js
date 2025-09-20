import express from "express";
import {
  getSchedules,
  createSchedule,
  getDailySchedule,
  updateSchedule,
  updateDailySchedule,
  deleteSchedule,
  applyScheduleToAllStaff,
} from "../controllers/staffSchedule.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

// Маршрути за общите графици на служителя
router
  .route("/")
  .get(authMiddleware, getSchedules) // Извличане на всички графици
  .post(authMiddleware, createSchedule); // Създаване на нов график

// Маршрути за конкретен график (CRUD операции)
router
  .route("/:id")
  .put(authMiddleware, updateSchedule) // Обновяване на основна информация за графика
  .delete(authMiddleware, deleteSchedule); // Изтриване на графика

// Маршрут за детайлния дневен график
router
  .route("/:id/details")
  .get(authMiddleware, getDailySchedule) // Извличане на детайлен дневен график
  .put(authMiddleware, updateDailySchedule); // Обновяване на детайлния дневен график

router.post("/apply-to-all", authMiddleware, applyScheduleToAllStaff);
export default router;
