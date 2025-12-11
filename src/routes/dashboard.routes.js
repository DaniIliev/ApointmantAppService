import express from "express";
import authMiddleware from "../middlewares/auth.js";
import {
  getDashboard,
  addItem,
  updateItem,
  removeItem,
  saveLayout,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/", authMiddleware, getDashboard);
router.post("/items", authMiddleware, addItem);
router.put("/items/:itemId", authMiddleware, updateItem);
router.delete("/items/:itemId", authMiddleware, removeItem);
router.put("/layout", authMiddleware, saveLayout);

export default router;
