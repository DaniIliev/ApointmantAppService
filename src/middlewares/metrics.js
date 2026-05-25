import SystemLog from "../models/SystemLog.js";

export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;

    // Avoid logging requests to admin dashboard itself to prevent self-logging infinite loops
    if (req.originalUrl.startsWith("/api/admin")) {
      return;
    }

    try {
      await SystemLog.create({
        level: "metric",
        category: "api_performance",
        message: `${req.method} ${req.originalUrl.split("?")[0]} - ${res.statusCode} in ${duration}ms`,
        metadata: {
          url: req.originalUrl,
          method: req.method,
          status: res.statusCode,
          durationMs: duration,
          userId: req.user ? (req.user._id || req.user.id) : "anonymous",
        },
      });
    } catch (e) {
      console.error("Failed to log request performance metric:", e);
    }
  });

  next();
};
