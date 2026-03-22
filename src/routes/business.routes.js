import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createBusiness,
  getBusinesses,
  getBusinessById,
  updateBusiness,
} from "../controllers/business.controller.js";
import authMiddleware from "../middlewares/auth.js";
import upload from "../storage.js";
import { getBusinessOptions } from "../controllers/business.controller.js";
const router = express.Router();

// GET /api/business
router.get("/", getBusinesses);

// GET /api/business/options - for select dropdowns
router.get("/options", getBusinessOptions);

// GET /api/business/:id
router.get("/:id", getBusinessById);

// POST /api/business - Създаване на бизнес (само за оторизирани потребители)
router.post("/", authRequired, createBusiness);

// PUT/PATCH /api/business/:id - Актуализация на бизнес
router.put(
  "/:id",
  authMiddleware,
  requireRole("business"),
  upload.single("businessImageUrl"),
  updateBusiness
);

export default router;
