import { Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { fetchPoolInfo, displayPoolInfo } from "./fetchPool";
import {
  fetchAllPoolPositions,
  displayPositionsSummary
} from "./fetchPositions";
import {
  generateMarkdownReport,
  generateReportFilename
} from "./generateMarkdownReport";
import {
  simulateSwapExactAmount,
  displaySwapSimulation
} from "./swapSimulator";
import BN from "bn.js";

dotenv.config();

// Configuration
const RPC_ENDPOINT =
  "https://mainnet.helius-rpc.com/?api-key=ce3617a7-afb3-418e-9c80-366eb06d0235";
const PROGRAM_ID = new PublicKey("REALQqNEomY6cQGZJUGwywTBD2UmDT32rZcNnfxQ5N2");
const POOL_ID = new PublicKey("FSmViworLwK7sTqiKf3WBtBowCQhSvVFaTt427XDevHi");

// Configuration options
const CONFIG = {
  fetchPositions: true,
  positionBatchSize: 10,
  maxPositions: 1000,
  showDetailedOutput: true,
  fetchPositionOwners: true, // New option
  generateReport: true, // Generate markdown report
  reportOutputDir: "./reports", // Directory for reports
  publishToNotion: true // Publish report to Notion
};

/**
 * Main analysis function
 */
async function analyzePool() {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  try {
    console.log("🚀 Starting Byreal CLMM Pool Analysis");
    console.log("=".repeat(50));

    // Step 1: Fetch pool information
    console.log("\n📥 Step 1: Fetching pool data...");
    const poolInfo = await fetchPoolInfo(connection, POOL_ID);

    // Step 2: Display pool information
    if (CONFIG.showDetailedOutput) {
      displayPoolInfo(poolInfo);
    }

    // Step 3: Fetch and analyze positions
    if (CONFIG.fetchPositions) {
      console.log("\n📥 Step 2: Fetching pool positions...");
      const positions = await fetchAllPoolPositions(
        connection,
        PROGRAM_ID,
        POOL_ID,
        {
          batchSize: CONFIG.positionBatchSize,
          maxPositions: CONFIG.maxPositions,
          fetchOwners: CONFIG.fetchPositionOwners // Pass the new option
        }
      );

      // Step 4: Display position analysis
      if (positions.length > 0 && CONFIG.showDetailedOutput) {
        displayPositionsSummary(
          positions,
          poolInfo.currentTick,
          poolInfo.poolState.sqrtPriceX64,
          poolInfo.poolState.mintDecimals0,
          poolInfo.poolState.mintDecimals1
        );

        // Step 5: Simulate swaps with slippage analysis
        console.log("\n💱 Analyzing Swap Slippage...");

        // Test specific swap sizes
        const testSizes = [
          new BN(1 * 1e9), // 1 SOL
          new BN(10 * 1e9), // 10 SOL
          new BN(100 * 1e9) // 100 SOL
        ];

        console.log("\n📊 SOL → FRAGME Swaps:");
        testSizes.forEach((size) => {
          const result = simulateSwapExactAmount(
            poolInfo,
            positions,
            size,
            "token0ToToken1"
          );
          displaySwapSimulation(
            result,
            poolInfo.poolState.mintDecimals0,
            poolInfo.poolState.mintDecimals1
          );
        });

        console.log("\n📊 FRAGME → SOL Swaps:");
        const fragmeTestSizes = [
          new BN(4000 * 1e9), // ~1 SOL worth
          new BN(40000 * 1e9), // ~10 SOL worth
          new BN(400000 * 1e9) // ~100 SOL worth
        ];

        fragmeTestSizes.forEach((size) => {
          const result = simulateSwapExactAmount(
            poolInfo,
            positions,
            size,
            "token1ToToken0"
          );
          displaySwapSimulation(
            result,
            poolInfo.poolState.mintDecimals0,
            poolInfo.poolState.mintDecimals1
          );
        });
      } else if (positions.length === 0) {
        console.log("\n⚠️ No positions found for this pool");
      }

      // Generate markdown report if enabled
      if (CONFIG.generateReport) {
        console.log("\n📝 Generating markdown report...");

        const reportData: any = {
          pool: poolInfo,
          positions,
          timestamp: new Date()
        };

        const filename = generateReportFilename();
        const outputPath = `${CONFIG.reportOutputDir}/${filename}`;

        await generateMarkdownReport(
          reportData,
          outputPath,
          CONFIG.publishToNotion
        );
      }

      // Return complete analysis
      return {
        pool: poolInfo,
        positions,
        summary: {
          poolAddress: poolInfo.poolAddress,
          currentPrice: poolInfo.currentPrice,
          tvl: poolInfo.tvl,
          totalPositions: positions.length,
          activePositions: positions.filter(
            (p) =>
              poolInfo.currentTick >= p.tickLowerIndex &&
              poolInfo.currentTick < p.tickUpperIndex
          ).length
        }
      };
    }

    return {
      pool: poolInfo,
      positions: [],
      summary: {
        poolAddress: poolInfo.poolAddress,
        currentPrice: poolInfo.currentPrice,
        tvl: poolInfo.tvl,
        totalPositions: 0,
        activePositions: 0
      }
    };
  } catch (error) {
    console.error("\n❌ Error during analysis:", error);
    throw error;
  }
}

/**
 * Quick summary function
 */
async function getQuickSummary() {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  try {
    console.log("🚀 Getting quick pool summary...");

    const poolInfo = await fetchPoolInfo(connection, POOL_ID);

    console.log("\n📊 Quick Summary:");
    console.log(`   Pool: ${POOL_ID.toBase58()}`);
    console.log(`   Price: ${poolInfo.currentPrice} FRAGME/SOL`);
    console.log(`   TVL: ${poolInfo.tvl}`);
    console.log(`   Current Tick: ${poolInfo.currentTick}`);

    return poolInfo;
  } catch (error) {
    console.error("❌ Error getting summary:", error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║     Byreal CLMM Pool Analysis Tool v1.0       ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log("\n");

  const startTime = Date.now();

  try {
    // Run full analysis
    const analysis = await analyzePool();

    // Final summary
    console.log("\n");
    console.log("=".repeat(50));
    console.log("✅ Analysis Complete!");
    console.log(
      `⏱️ Time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
    );
    console.log("=".repeat(50));

    // Key metrics summary
    console.log("\n🎯 Key Metrics:");
    console.log(`   • TVL: ${analysis.summary.tvl}`);
    console.log(
      `   • Current Price: ${analysis.summary.currentPrice} FRAGME/SOL`
    );
    console.log(`   • Total Positions: ${analysis.summary.totalPositions}`);
    console.log(`   • Active Positions: ${analysis.summary.activePositions}`);
    console.log(
      `   • Utilization: ${
        analysis.summary.totalPositions > 0
          ? (
              (analysis.summary.activePositions /
                analysis.summary.totalPositions) *
              100
            ).toFixed(1)
          : 0
      }%`
    );
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

// Export functions for external use
export { analyzePool, getQuickSummary };

// Run if called directly
if (require.main === module) {
  main();
}
