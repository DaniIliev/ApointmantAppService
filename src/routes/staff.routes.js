import express from "express";
import {
  listBusinessStaff,
  inviteStaff,
  getStaffByIds,
  removeStaff,
  updateStaffEmail,
} from "../controllers/staff.controller.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

router.get("/staff-list", listBusinessStaff);
router.post("/invite-staff", authMiddleware, inviteStaff);
router.post("/by-ids", getStaffByIds);
router.delete("/:id", authMiddleware, removeStaff);
router.patch("/:id/email", authMiddleware, updateStaffEmail);
// router.post("/", authMiddleware, getAllStaff

export default router;
