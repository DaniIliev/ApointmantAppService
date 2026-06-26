import SystemLog from "../models/SystemLog.js";

export const notFound = (req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
};

export const errorHandler = async (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;

  try {
    await SystemLog.create({
      level: "error",
      category: "api_error",
      message: err.message || "Unknown Server Error",
      metadata: {
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        status: status,
        body: req.body && Object.keys(req.body).length ? req.body : undefined,
        query: req.query && Object.keys(req.query).length ? req.query : undefined,
        userId: req.user ? (req.user._id || req.user.id) : "anonymous",
      },
    });
  } catch (logError) {
    console.error("Failed to write error to SystemLog database:", logError);
  }

  res.status(status).json({ message: err.message || "Server error" });
};

