import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI;

async function ensureUniqueIndexes() {
  if (!MONGO_URI) {
    console.error("❌ MONGO_URI not found in environment variables");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const User = mongoose.model("User", new mongoose.Schema({
      email: { type: String, lowercase: true, trim: true }
    }, { strict: false }));

    console.log("🔍 Checking for duplicate emails...");
    
    const duplicates = await User.aggregate([
      {
        $group: {
          _id: "$email",
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length > 0) {
      console.log(`⚠️ Found ${duplicates.length} duplicate emails. Cleaning up...`);
      for (const dup of duplicates) {
        console.log(`  - Duplicate: ${dup._id} (${dup.count} instances)`);
        // Keep the first instance, remove the rest
        const [keep, ...remove] = dup.ids;
        await User.deleteMany({ _id: { $in: remove } });
        console.log(`    ✅ Kept ${keep}, removed ${remove.length} others.`);
      }
    } else {
      console.log("✨ No duplicate emails found.");
    }

    console.log("⚡ Re-creating unique index on email...");
    // Drop existing index if it exists but is not unique
    try {
      await User.collection.dropIndex("email_1");
    } catch (e) {
      // Index might not exist
    }

    try {
      await User.collection.createIndex({ email: 1 }, { unique: true });
      console.log("✅ Unique index on 'email' successfully created/verified.");
    } catch (e) {
      console.error("❌ Failed to create unique index:", e.message);
      console.log("💡 This usually means there are still duplicates or null values that violate uniqueness.");
    }

    await mongoose.disconnect();
    console.log("👋 Done.");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

ensureUniqueIndexes();
