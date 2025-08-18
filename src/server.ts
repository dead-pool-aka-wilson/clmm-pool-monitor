import * as cron from "node-cron";
import { analyzePool } from "./index";

console.log("🚀 Starting Byreal Pool Analysis Scheduler");
console.log("⏰ Scheduled to run every 30 minutes");

// Run every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("\n" + "=".repeat(50));
  console.log(`[${new Date().toISOString()}] Running scheduled analysis...`);
  console.log("=".repeat(50));

  try {
    await analyzePool();
    console.log(
      `[${new Date().toISOString()}] Analysis completed successfully`
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Analysis failed:`, error);
  }
});

// Run immediately on start
(async () => {
  console.log("\n📊 Running initial analysis...");
  try {
    await analyzePool();
    console.log("✅ Initial analysis completed");
  } catch (error) {
    console.error("❌ Initial analysis failed:", error);
  }
})();

// Keep the process running
process.on("SIGINT", () => {
  console.log("\n👋 Scheduler stopped");
  process.exit(0);
});
