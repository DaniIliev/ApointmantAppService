import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
} from "../controllers/location.controller.js";

const router = express.Router();

// GET /api/locations
router.get("/", getLocations);

// GET /api/locations/:id
router.get("/:id", getLocationById);

// POST /api/locations
router.post("/", authRequired, createLocation);

// PUT /api/locations/:id
router.put("/:id", authRequired, requireRole("business"), updateLocation);

// DELETE /api/locations/:id
router.delete("/:id", authRequired, requireRole("business"), deleteLocation);

export default router;
