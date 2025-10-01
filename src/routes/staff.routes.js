import express from "express";
import {
  listBusinessStaff,
  inviteStaff,
  getStaffByIds,
} from "../controllers/staff.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

router.get("/staff-list", authMiddleware, listBusinessStaff);
router.post("/invite-staff", authMiddleware, inviteStaff);
router.post("/by-ids", authMiddleware, getStaffByIds);
// router.post("/", authMiddleware, getAllStaff

export default router;
