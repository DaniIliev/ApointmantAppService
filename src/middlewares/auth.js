import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authMiddleware = (req, res, next) => {
  // Check both headers to support different frontend implementations
  let token = req.header("x-auth-token");

  if (!token) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) {
      token = header.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Няма токен, достъпът е отказан." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach full payload (id, role, businessId)
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Токенът е невалиден." });
  }
};

export const authRequired = authMiddleware;
export default authMiddleware;

export const requireRole =
  (...roles) =>
  async (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Fast-path: If the role encoded in the JWT matches, proceed immediately
    if (roles.includes(req.user.role)) {
      return next();
    }

    // Resilient fallback: Query the database in case the user's role was updated (prevents stale JWT lockouts)
    try {
      const dbUser = await User.findById(req.user.id || req.user._id);
      if (dbUser && roles.includes(dbUser.role)) {
        req.user.role = dbUser.role; // Sync role state for current request
        return next();
      }
    } catch (err) {
      console.error("Resilient role fallback check failed:", err);
    }

    res.status(403).json({ message: "Forbidden" });
  };

