import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

const requiredEnvVars = [
  "STRIPE_SECRET_KEY",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "FRONTEND_URL",
];

const optionalEnvVars = ["PLATFORM_FEE_PERCENT"];

console.log("🔍 Checking Stripe Connect environment variables...\n");

let allPresent = true;

// Проверка на задължителни променливи
console.log("Required variables:");
requiredEnvVars.forEach((varName) => {
  const isPresent = !!process.env[varName];
  const status = isPresent ? "✅" : "❌";
  console.log(`  ${status} ${varName}: ${isPresent ? "Present" : "MISSING"}`);
  if (!isPresent) allPresent = false;
});

console.log("\nOptional variables:");
optionalEnvVars.forEach((varName) => {
  const isPresent = !!process.env[varName];
  const status = isPresent ? "✅" : "⚠️";
  const value = isPresent ? process.env[varName] : "Not set (will use default)";
  console.log(`  ${status} ${varName}: ${value}`);
});

console.log("\n" + "=".repeat(50));

if (allPresent) {
  console.log("✅ All required environment variables are present!");
  console.log("\nNext steps:");
  console.log(
    "1. Make sure Stripe Connect is enabled in your Stripe Dashboard"
  );
  console.log("2. Configure webhook endpoint in Stripe Dashboard");
  console.log("3. Test the integration with test cards");
  process.exit(0);
} else {
  console.log("❌ Some required environment variables are missing!");
  console.log("\nPlease add them to your .env file:");
  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      console.log(`  ${varName}=your_value_here`);
    }
  });
  console.log("\nSee STRIPE_CONNECT_SETUP.md for more details.");
  process.exit(1);
}
