import jwt from "jsonwebtoken";

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
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
