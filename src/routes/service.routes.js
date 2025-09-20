import express from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  createService,
  listServices,
  deleteService,
  updateService,
} from "../controllers/service.controller.js";
import authMiddleware from "../middlewares/auth.js";
import upload from "../storage.js";
const router = express.Router({ mergeParams: true });

router.post("/", authMiddleware, upload.single("imageUrl"), createService);
router.get("/", authMiddleware, listServices);
router.put(
  "/:serviceId",
  authMiddleware,
  upload.single("imageUrl"),
  updateService
);
router.delete("/:serviceId", authMiddleware, deleteService);

export default router;
