import Alert from "../models/Alert.js";

export const getAlerts = async (req, res, next) => {
  try {
    const alerts = await Alert.find({ staff: req.user.id })
      .populate({
        path: "appointment",
        match: { status: "pending" },
        populate: { path: "service", select: "name" },
      })
      .sort({ createdAt: -1 });

    // Filter out alerts where the appointment was not found (due to status mismatch)
    const filteredAlerts = alerts.filter((alert) => alert.appointment !== null);

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });

    res.status(200).json(filteredAlerts);
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
      return res.status(404)
        .json({ 
          errorCode: "ALERT_NOT_FOUND",
          message: "Alert not found or access denied." 
        });
    }

    res.status(200).json({
      message: "Alert marked as read.",
      messageCode: "ALERT_READ",
      data: alert
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const alert = await Alert.findByIdAndDelete(id);

    if (!alert) {
      return res.status(404).json({ 
        errorCode: "ALERT_NOT_FOUND",
        message: "Alert not found." 
      });
    }

    res.status(200).json({ 
      message: "Alert deleted successfully.",
      messageCode: "ALERT_DELETED"
    });
  } catch (e) {
    next(e);
  }
};
