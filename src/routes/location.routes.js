import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
} from "../controllers/location.controller.js";

import upload from "../storage.js";

const router = express.Router();

// GET /api/locations
router.get("/", getLocations);

// GET /api/locations/:id
router.get("/:id", getLocationById);

// POST /api/locations
router.post("/", authRequired, upload.single("imageUrl"), createLocation);

// PUT /api/locations/:id
router.put("/:id", authRequired, requireRole("business"), upload.single("imageUrl"), updateLocation);

// DELETE /api/locations/:id
router.delete("/:id", authRequired, requireRole("business"), deleteLocation);

export default router;
