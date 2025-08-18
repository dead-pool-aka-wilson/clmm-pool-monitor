"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePool = analyzePool;
exports.getQuickSummary = getQuickSummary;
const web3_js_1 = require("@solana/web3.js");
const dotenv = __importStar(require("dotenv"));
const fetchPool_1 = require("./fetchPool");
const fetchPositions_1 = require("./fetchPositions");
const generateMarkdownReport_1 = require("./generateMarkdownReport");
const swapSimulator_1 = require("./swapSimulator");
const bnUtils_1 = require("./bnUtils");
const bn_js_1 = __importDefault(require("bn.js"));
dotenv.config();
// Configuration
const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=ce3617a7-afb3-418e-9c80-366eb06d0235";
const PROGRAM_ID = new web3_js_1.PublicKey("REALQqNEomY6cQGZJUGwywTBD2UmDT32rZcNnfxQ5N2");
const POOL_ID = new web3_js_1.PublicKey("FSmViworLwK7sTqiKf3WBtBowCQhSvVFaTt427XDevHi");
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
function displayLiquidityBreakpointSummary(pool, positions) {
    console.log("\n💱 Liquidity Breakpoint Analysis...");
    const decimals0 = pool.poolState.mintDecimals0;
    const decimals1 = pool.poolState.mintDecimals1;
    // Analyze both directions
    const sol2fragme = (0, swapSimulator_1.findLiquidityBreakpoints)(pool, positions, "token0ToToken1", 5 // Just show top 5 in console
    );
    const fragme2sol = (0, swapSimulator_1.findLiquidityBreakpoints)(pool, positions, "token1ToToken0", 5);
    console.log("\n📊 SOL → FRAGME Key Breakpoints:");
    sol2fragme.slice(0, 3).forEach((bp) => {
        if (bp.isAccessible) {
            console.log(`   Tick ${bp.tick}:`);
            console.log(`     Swap needed: ${(0, bnUtils_1.addDecimalPoint)(bp.swapAmountToReach, decimals0)} SOL`);
            console.log(`     Expected output: ${(0, bnUtils_1.addDecimalPoint)(bp.expectedOutput, decimals1)} FRAGME`);
            console.log(`     Liquidity change: ${bp.liquidityChange.isNeg() ? "-" : "+"}${bp.liquidityChange.abs().toString()}`);
        }
    });
    console.log("\n📊 FRAGME → SOL Key Breakpoints:");
    fragme2sol.slice(0, 3).forEach((bp) => {
        if (bp.isAccessible) {
            console.log(`   Tick ${bp.tick}:`);
            console.log(`     Swap needed: ${(0, bnUtils_1.addDecimalPoint)(bp.swapAmountToReach, decimals1)} FRAGME`);
            console.log(`     Expected output: ${(0, bnUtils_1.addDecimalPoint)(bp.expectedOutput, decimals0)} SOL`);
            console.log(`     Liquidity change: ${bp.liquidityChange.isNeg() ? "-" : "+"}${bp.liquidityChange.abs().toString()}`);
        }
    });
    // Find where liquidity runs out
    const liquidityRunsOutSOL = sol2fragme.find((bp) => bp.liquidityAfter.isZero());
    const liquidityRunsOutFRAGME = fragme2sol.find((bp) => bp.liquidityAfter.isZero());
    if (liquidityRunsOutSOL) {
        console.log(`\n⚠️ SOL → FRAGME: Liquidity depletes at tick ${liquidityRunsOutSOL.tick}`);
        console.log(`   Max swap: ${(0, bnUtils_1.addDecimalPoint)(liquidityRunsOutSOL.swapAmountToReach, decimals0)} SOL`);
    }
    if (liquidityRunsOutFRAGME) {
        console.log(`\n⚠️ FRAGME → SOL: Liquidity depletes at tick ${liquidityRunsOutFRAGME.tick}`);
        console.log(`   Max swap: ${(0, bnUtils_1.addDecimalPoint)(liquidityRunsOutFRAGME.swapAmountToReach, decimals1)} FRAGME`);
    }
}
/**
 * Main analysis function
 */
function analyzePool() {
    return __awaiter(this, void 0, void 0, function* () {
        const connection = new web3_js_1.Connection(RPC_ENDPOINT, "confirmed");
        try {
            console.log("🚀 Starting Byreal CLMM Pool Analysis");
            console.log("=".repeat(50));
            // Step 1: Fetch pool information
            console.log("\n📥 Step 1: Fetching pool data...");
            const poolInfo = yield (0, fetchPool_1.fetchPoolInfo)(connection, POOL_ID);
            // Step 2: Display pool information
            if (CONFIG.showDetailedOutput) {
                (0, fetchPool_1.displayPoolInfo)(poolInfo);
            }
            // Step 3: Fetch and analyze positions
            if (CONFIG.fetchPositions) {
                console.log("\n📥 Step 2: Fetching pool positions...");
                const positions = yield (0, fetchPositions_1.fetchAllPoolPositions)(connection, PROGRAM_ID, POOL_ID, {
                    batchSize: CONFIG.positionBatchSize,
                    maxPositions: CONFIG.maxPositions,
                    fetchOwners: CONFIG.fetchPositionOwners
                });
                // Step 4: Display position analysis
                if (positions.length > 0 && CONFIG.showDetailedOutput) {
                    (0, fetchPositions_1.displayPositionsSummary)(positions, poolInfo.currentTick, poolInfo.poolState.sqrtPriceX64, poolInfo.poolState.mintDecimals0, poolInfo.poolState.mintDecimals1);
                    // Step 5: Display liquidity breakpoint analysis
                    displayLiquidityBreakpointSummary(poolInfo, positions);
                    // Test exact swap simulation (optional)
                    if (false) {
                        // Set to true to test
                        console.log("\n🧪 Testing exact swap simulation:");
                        // Test FRAGME → SOL swap (298,171.51 FRAGME)
                        const testAmountFRAGME = new bn_js_1.default("298171510000000"); // 298,171.51 FRAGME (with 9 decimals)
                        const result = (0, swapSimulator_1.simulateExactSwap)(poolInfo, positions, testAmountFRAGME, "token1ToToken0");
                        console.log(`\n📊 Swap Result:`);
                        console.log(`  Input: ${(0, bnUtils_1.addDecimalPoint)(testAmountFRAGME, poolInfo.poolState.mintDecimals1)} FRAGME`);
                        console.log(`  Output: ${(0, bnUtils_1.addDecimalPoint)(result.amountOut, poolInfo.poolState.mintDecimals0)} SOL`);
                        console.log(`  Price Impact: ${result.priceImpact.toFixed(2)}%`);
                        console.log(`  Execution Price: ${result.executionPrice.toFixed(2)} FRAGME/SOL`);
                    }
                }
                else if (positions.length === 0) {
                    console.log("\n⚠️ No positions found for this pool");
                }
                // Generate markdown report if enabled
                if (CONFIG.generateReport) {
                    console.log("\n📝 Generating markdown report...");
                    const reportData = {
                        pool: poolInfo,
                        positions,
                        timestamp: new Date()
                    };
                    const filename = (0, generateMarkdownReport_1.generateReportFilename)();
                    const outputPath = `${CONFIG.reportOutputDir}/${filename}`;
                    yield (0, generateMarkdownReport_1.generateMarkdownReport)(reportData, outputPath, CONFIG.publishToNotion);
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
                        activePositions: positions.filter((p) => poolInfo.currentTick >= p.tickLowerIndex &&
                            poolInfo.currentTick < p.tickUpperIndex).length
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
        }
        catch (error) {
            console.error("\n❌ Error during analysis:", error);
            throw error;
        }
    });
}
/**
 * Quick summary function
 */
function getQuickSummary() {
    return __awaiter(this, void 0, void 0, function* () {
        const connection = new web3_js_1.Connection(RPC_ENDPOINT, "confirmed");
        try {
            console.log("🚀 Getting quick pool summary...");
            const poolInfo = yield (0, fetchPool_1.fetchPoolInfo)(connection, POOL_ID);
            console.log("\n📊 Quick Summary:");
            console.log(`   Pool: ${POOL_ID.toBase58()}`);
            console.log(`   Price: ${poolInfo.currentPrice} FRAGME/SOL`);
            console.log(`   TVL: ${poolInfo.tvl}`);
            console.log(`   Current Tick: ${poolInfo.currentTick}`);
            return poolInfo;
        }
        catch (error) {
            console.error("❌ Error getting summary:", error);
            throw error;
        }
    });
}
/**
 * Main execution
 */
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("\n");
        console.log("╔════════════════════════════════════════════════╗");
        console.log("║     Byreal CLMM Pool Analysis Tool v1.0       ║");
        console.log("╚════════════════════════════════════════════════╝");
        console.log("\n");
        const startTime = Date.now();
        try {
            // Run full analysis
            const analysis = yield analyzePool();
            // Final summary
            console.log("\n");
            console.log("=".repeat(50));
            console.log("✅ Analysis Complete!");
            console.log(`⏱️ Time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
            console.log("=".repeat(50));
            // Key metrics summary
            console.log("\n🎯 Key Metrics:");
            console.log(`   • TVL: ${analysis.summary.tvl}`);
            console.log(`   • Current Price: ${analysis.summary.currentPrice} FRAGME/SOL`);
            console.log(`   • Total Positions: ${analysis.summary.totalPositions}`);
            console.log(`   • Active Positions: ${analysis.summary.activePositions}`);
            console.log(`   • Utilization: ${analysis.summary.totalPositions > 0
                ? ((analysis.summary.activePositions /
                    analysis.summary.totalPositions) *
                    100).toFixed(1)
                : 0}%`);
        }
        catch (error) {
            console.error("\n❌ Fatal error:", error);
            process.exit(1);
        }
    });
}
// Run if called directly
if (require.main === module) {
    main();
}
