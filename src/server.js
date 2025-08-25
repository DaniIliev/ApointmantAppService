import mongoose from "mongoose";
import app from "./app.js";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_URI.split("/").pop() });
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
    console.log(`📘 Swagger UI:   http://localhost:${PORT}/api-docs`);
  } catch (err) {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  }
})();
