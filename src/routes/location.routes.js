import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createLocation,
  getLocations,
  getLocationById,
  getLocationWeeklyWorkingHours,
  updateLocation,
  updateLocationWeeklyWorkingHours,
  deleteLocation,
} from "../controllers/location.controller.js";

import upload from "../storage.js";

const router = express.Router();

// GET /api/locations
router.get("/", getLocations);

// GET /api/locations/:id
router.get("/:id", getLocationById);

// GET /api/locations/:id/weekly-hours
router.get("/:id/weekly-hours", authRequired, getLocationWeeklyWorkingHours);

// PUT /api/locations/:id/weekly-hours
router.put(
  "/:id/weekly-hours",
  authRequired,
  requireRole("business", "manager"),
  updateLocationWeeklyWorkingHours,
);

// POST /api/locations
router.post(
  "/",
  authRequired,
  requireRole("business", "manager"),
  upload.single("imageUrl"),
  createLocation,
);

// PUT /api/locations/:id
router.put(
  "/:id",
  authRequired,
  requireRole("business", "manager"),
  upload.single("imageUrl"),
  updateLocation,
);

// DELETE /api/locations/:id
router.delete(
  "/:id",
  authRequired,
  requireRole("business", "manager"),
  deleteLocation,
);

export default router;
