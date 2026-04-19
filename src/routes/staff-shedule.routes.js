import express from "express";
import {
  getSchedules,
  createSchedule,
  getDailySchedule,
  getDailyScheduleByStaff,
  updateSchedule,
  updateDailySchedule,
  deleteSchedule,
  getDailyView,
} from "../controllers/staffSchedule.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

// Маршрути за общите графици на служителя
router
  .route("/")
  .get(authMiddleware, getSchedules) // Извличане на всички графици
  .post(authMiddleware, createSchedule); // Създаване на нов график

router.get("/daily-view", authMiddleware, getDailyView);

// Маршрути за конкретен график (CRUD операции)
router
  .route("/:id")
  .put(authMiddleware, updateSchedule) // Обновяване на основна информация за графика
  .delete(authMiddleware, deleteSchedule); // Изтриване на графика

// Маршрут за детайлния дневен график
router.get(
  "/details/by-staff/:staffId",
  authMiddleware,
  getDailyScheduleByStaff,
);

router
  .route("/:id/details")
  .get(authMiddleware, getDailySchedule) // Извличане на детайлен дневен график
  .put(authMiddleware, updateDailySchedule); // Обновяване на детайлния дневен график

export default router;
