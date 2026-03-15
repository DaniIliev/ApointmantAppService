import mongoose from "mongoose";
import dotenv from "dotenv";
import { runFullSubscriptionCheck } from "../src/jobs/subscriptionExpirationCheck.js";

dotenv.config();

/**
 * Manual script to trigger the full subscription expiration check.
 */
async function manualRun() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    
    await runFullSubscriptionCheck();

    console.log("Manual run completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Manual run failed:", error);
    process.exit(1);
  }
}

manualRun();
