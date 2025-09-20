import express from "express";
import Alert from "../models/Alert.js";
import authMiddleware from "../middlewares/auth.js";

const router = express.Router();

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const alerts = await Alert.find({ staff: req.user.id })
      .populate({
        path: "appointment",
        populate: { path: "service", select: "name" },
      })
      .sort({ createdAt: -1 }); // Sort from newest to oldest

    res.status(200).json(alerts);
  } catch (error) {
    next(error);
  }
});

// Update an alert to "read"
router.put("/:id/read", authMiddleware, async (req, res, next) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, staff: req.user.id },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!alert) {
      return res
        .status(404)
        .json({ message: "Alert not found or access denied." });
    }

    res.status(200).json(alert);
  } catch (error) {
    next(error);
  }
});

export default router;
