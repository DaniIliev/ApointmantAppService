import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  // 1. Вземи токена от хедъра на заявката
  const token = req.header("x-auth-token");

  // 2. Провери дали има токен
  if (!token) {
    return res.status(401).json({ message: "Няма токен, достъпът е отказан." });
  }

  // 3. Верифицирай токена
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Добави потребителските данни към обекта на заявката (req)
    req.user = decoded;

    // 5. Продължи към следващия middleware или контролер
    next();
  } catch (error) {
    // Ако токенът е невалиден
    res.status(401).json({ message: "Токенът е невалиден." });
  }
};

export default authMiddleware;

export const authRequired = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  console.log("token", token);
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log("payload", payload);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
