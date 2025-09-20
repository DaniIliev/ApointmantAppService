import Alert from "../models/Alert.js";

export const getAlerts = async (req, res, next) => {
  try {
    const alerts = await Alert.find({ staff: req.user.id })
      .populate({
        path: "appointment",
        populate: { path: "service", select: "name" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json(alerts);
  } catch (error) {
    next(error);
  }
};

export const markAlertAsRead = async (req, res, next) => {
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
};

export const deleteAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const alert = await Alert.findByIdAndDelete(id);

    if (!alert) {
      return res.status(404).json({ message: "Alert не е намерена." });
    }

    res.status(200).json({ message: "Alert изтрита успешно." });
  } catch (e) {
    next(e);
  }
};
