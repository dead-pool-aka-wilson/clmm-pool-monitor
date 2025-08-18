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
  findLiquidityBreakpoints,
  generateLiquidityBreakpointReport,
  simulateExactSwap
} from "./swapSimulator";
import { addDecimalPoint } from "./bnUtils";
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
  fetchPositionOwners: true,
  generateReport: true,
  reportOutputDir: "./reports",
  publishToNotion: true
};

/**
 * Display liquidity breakpoint summary in console
 */
function displayLiquidityBreakpointSummary(pool: any, positions: any[]): void {
  console.log("\n💱 Liquidity Breakpoint Analysis...");

  const decimals0 = pool.poolState.mintDecimals0;
  const decimals1 = pool.poolState.mintDecimals1;

  // Analyze both directions
  const sol2fragme = findLiquidityBreakpoints(
    pool,
    positions,
    "token0ToToken1",
    5 // Just show top 5 in console
  );

  const fragme2sol = findLiquidityBreakpoints(
    pool,
    positions,
    "token1ToToken0",
    5
  );

  console.log("\n📊 SOL → FRAGME Key Breakpoints:");
  sol2fragme.slice(0, 3).forEach((bp) => {
    if (bp.isAccessible) {
      console.log(`   Tick ${bp.tick}:`);
      console.log(
        `     Swap needed: ${addDecimalPoint(
          bp.swapAmountToReach,
          decimals0
        )} SOL`
      );
      console.log(
        `     Expected output: ${addDecimalPoint(
          bp.expectedOutput,
          decimals1
        )} FRAGME`
      );
      console.log(
        `     Liquidity change: ${
          bp.liquidityChange.isNeg() ? "-" : "+"
        }${bp.liquidityChange.abs().toString()}`
      );
    }
  });

  console.log("\n📊 FRAGME → SOL Key Breakpoints:");
  fragme2sol.slice(0, 3).forEach((bp) => {
    if (bp.isAccessible) {
      console.log(`   Tick ${bp.tick}:`);
      console.log(
        `     Swap needed: ${addDecimalPoint(
          bp.swapAmountToReach,
          decimals1
        )} FRAGME`
      );
      console.log(
        `     Expected output: ${addDecimalPoint(
          bp.expectedOutput,
          decimals0
        )} SOL`
      );
      console.log(
        `     Liquidity change: ${
          bp.liquidityChange.isNeg() ? "-" : "+"
        }${bp.liquidityChange.abs().toString()}`
      );
    }
  });

  // Find where liquidity runs out
  const liquidityRunsOutSOL = sol2fragme.find((bp) =>
    bp.liquidityAfter.isZero()
  );
  const liquidityRunsOutFRAGME = fragme2sol.find((bp) =>
    bp.liquidityAfter.isZero()
  );

  if (liquidityRunsOutSOL) {
    console.log(
      `\n⚠️ SOL → FRAGME: Liquidity depletes at tick ${liquidityRunsOutSOL.tick}`
    );
    console.log(
      `   Max swap: ${addDecimalPoint(
        liquidityRunsOutSOL.swapAmountToReach,
        decimals0
      )} SOL`
    );
  }

  if (liquidityRunsOutFRAGME) {
    console.log(
      `\n⚠️ FRAGME → SOL: Liquidity depletes at tick ${liquidityRunsOutFRAGME.tick}`
    );
    console.log(
      `   Max swap: ${addDecimalPoint(
        liquidityRunsOutFRAGME.swapAmountToReach,
        decimals1
      )} FRAGME`
    );
  }
}

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
          fetchOwners: CONFIG.fetchPositionOwners
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

        // Step 5: Display liquidity breakpoint analysis
        displayLiquidityBreakpointSummary(poolInfo, positions);

        // Test exact swap simulation (optional)
        if (false) {
          // Set to true to test
          console.log("\n🧪 Testing exact swap simulation:");

          // Test FRAGME → SOL swap (298,171.51 FRAGME)
          const testAmountFRAGME = new BN("298171510000000"); // 298,171.51 FRAGME (with 9 decimals)
          const result = simulateExactSwap(
            poolInfo,
            positions,
            testAmountFRAGME,
            "token1ToToken0"
          );

          console.log(`\n📊 Swap Result:`);
          console.log(
            `  Input: ${addDecimalPoint(
              testAmountFRAGME,
              poolInfo.poolState.mintDecimals1
            )} FRAGME`
          );
          console.log(
            `  Output: ${addDecimalPoint(
              result.amountOut,
              poolInfo.poolState.mintDecimals0
            )} SOL`
          );
          console.log(`  Price Impact: ${result.priceImpact.toFixed(2)}%`);
          console.log(
            `  Execution Price: ${result.executionPrice.toFixed(2)} FRAGME/SOL`
          );
        }
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
