"use strict";
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
exports.generateMarkdownReport = generateMarkdownReport;
exports.generateReportFilename = generateReportFilename;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bn_js_1 = __importDefault(require("bn.js"));
const tickToPrice_1 = require("./tickToPrice");
const bnUtils_1 = require("./bnUtils");
const publishToNotion_1 = require("./publishToNotion");
const fetchPrices_1 = require("./fetchPrices");
const swapSimulator_1 = require("./swapSimulator");
const slackNotifier_1 = require("./slackNotifier");
// Target owner to track specially
const TARGET_OWNER = "Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6";
/**
 * Generate comprehensive markdown report with Slack notification
 */
function generateMarkdownReport(data_1, outputPath_1) {
    return __awaiter(this, arguments, void 0, function* (data, outputPath, publishToNotion = false, sendSlackNotification = true // New parameter
    ) {
        const { pool, positions, timestamp } = data;
        // Fetch SOL price and calculate USD prices
        let priceData = null;
        try {
            console.log("\n💰 Fetching current SOL price...");
            const solPriceData = yield (0, fetchPrices_1.fetchSOLPrice)();
            priceData = (0, fetchPrices_1.calculateUSDPrices)(pool.currentPrice, solPriceData.solPriceUSD);
            console.log(`   SOL Price: ${(0, fetchPrices_1.formatUSDPrice)(priceData.solPriceUSD)} (${solPriceData.source})`);
            console.log(`   FRAGME Price: ${(0, fetchPrices_1.formatUSDPrice)(priceData.fragmePriceUSD)}`);
        }
        catch (error) {
            console.log("⚠️ Could not fetch live prices, using estimates");
        }
        // Update data with price info
        data.priceData = priceData || undefined;
        let report = "";
        // Header
        report += "# Byreal CLMM Pool Analysis Report\n\n";
        report += `Generated: ${timestamp.toISOString()}\n\n`;
        report += "---\n\n";
        // Important Note about price convention
        report += "## Price Convention\n\n";
        report +=
            "**Important**: All prices in this report are displayed as **FRAGME/SOL**\n";
        report += "This means: How many FRAGME tokens equal 1 SOL\n\n";
        if (priceData) {
            report += `Example: Current price of ${(0, tickToPrice_1.formatPrice)(pool.currentPrice)} FRAGME/SOL means:\n`;
            report += `- 1 SOL = ${(0, tickToPrice_1.formatPrice)(pool.currentPrice)} FRAGME\n`;
            report += `- 1 FRAGME = ${(1 / parseFloat(pool.currentPrice)).toFixed(6)} SOL\n\n`;
        }
        report += "---\n\n";
        // Pool Overview Section
        report += "## Pool Overview\n\n";
        report += generatePoolOverviewSection(pool);
        // Market Metrics Section (now includes USD prices)
        report += "## Market Metrics\n\n";
        report += generateMarketMetricsSection(pool, positions, priceData);
        // Position Statistics Section
        report += "## Position Statistics\n\n";
        report += generatePositionStatisticsSection(positions, pool);
        // Swap Capacity Analysis Section
        report += (0, swapSimulator_1.generateSwapCapacitySection)(pool, positions);
        // Ownership Analysis Section
        report += "## Ownership Analysis\n\n";
        report += generateOwnershipAnalysisSection(positions);
        // All Positions Table
        report += "## All Positions\n\n";
        report += generatePositionsTable(positions, pool);
        // Target Owner Positions
        report += `## Positions Owned by ${TARGET_OWNER}\n\n`;
        report += generateTargetOwnerPositions(positions, pool, TARGET_OWNER);
        // Top Liquidity Providers Section
        report += "## Top Liquidity Providers\n\n";
        report += generateTopLiquidityProviders(positions);
        // Volume and Fees Section
        report += "## Volume and Fees\n\n";
        report += generateVolumeAndFeesSection(pool);
        // Footer
        report += "---\n\n";
        report += `Report generated at ${timestamp.toLocaleString()}\n`;
        // Save to file if path provided
        if (outputPath) {
            saveReportToFile(report, outputPath);
        }
        // Publish to Notion if enabled
        let notionPageUrl = null;
        if (publishToNotion) {
            const notionConfig = (0, publishToNotion_1.loadNotionConfig)();
            if (notionConfig) {
                try {
                    const metadata = (0, publishToNotion_1.createReportMetadata)(pool, positions, timestamp);
                    notionPageUrl = yield (0, publishToNotion_1.publishReportToNotion)(report, metadata, notionConfig);
                    console.log(`\n🔗 Notion Page: ${notionPageUrl}`);
                    // Send Slack notification if enabled and Notion publish was successful
                    if (sendSlackNotification && notionPageUrl) {
                        try {
                            yield (0, slackNotifier_1.notifySlackAfterNotionPublish)(pool, positions, priceData, notionPageUrl);
                        }
                        catch (slackError) {
                            console.error("Failed to send Slack notification:", slackError);
                            // Don't throw - Slack notification is not critical
                        }
                    }
                }
                catch (error) {
                    console.error("Failed to publish to Notion:", error);
                }
            }
            else {
                console.log("⚠️ Notion publishing skipped - configuration not found");
            }
        }
        return report;
    });
}
/**
 * Generate pool overview section
 */
function generatePoolOverviewSection(pool) {
    let section = "";
    section += "| Metric | Value |\n";
    section += "|--------|-------|\n";
    section += `| Pool Address | ${pool.poolAddress} |\n`;
    section += `| Token 0 (SOL) | ${pool.token0.mint} |\n`;
    section += `| Token 1 (FRAGME) | ${pool.token1.mint} |\n`;
    section += `| Current Price | ${(0, tickToPrice_1.formatPrice)(pool.currentPrice)} FRAGME/SOL |\n`;
    section += `| Current Tick | ${pool.currentTick} |\n`;
    section += `| Tick Spacing | ${pool.poolState.tickSpacing} |\n`;
    section += `| Status | ${pool.poolState.status === 0 ? "Active" : "Paused"} |\n`;
    section += `| TVL | ${(0, tickToPrice_1.formatPrice)(pool.tvl)} |\n`;
    section += `| Total Liquidity | ${pool.totalLiquidity} |\n`;
    section += "\n";
    return section;
}
/**
 * Generate market metrics section
 */
function generateMarketMetricsSection(pool, positions, priceData) {
    let section = "";
    const activePositions = positions.filter((p) => pool.currentTick >= p.tickLowerIndex &&
        pool.currentTick < p.tickUpperIndex);
    const utilization = positions.length > 0
        ? ((activePositions.length / positions.length) * 100).toFixed(2)
        : "0.00";
    // Basic metrics table
    section += "### Pool Metrics\n\n";
    section += "| Metric | Value |\n";
    section += "|--------|-------|\n";
    section += `| Token 0 Balance | ${(0, bnUtils_1.addDecimalPoint)(pool.token0.amount, pool.token0.decimals)} SOL |\n`;
    section += `| Token 1 Balance | ${(0, bnUtils_1.addDecimalPoint)(pool.token1.amount, pool.token1.decimals)} FRAGME |\n`;
    section += `| Total Positions | ${positions.length} |\n`;
    section += `| Active Positions | ${activePositions.length} |\n`;
    section += `| Inactive Positions | ${positions.length - activePositions.length} |\n`;
    section += `| Utilization Rate | ${utilization}% |\n`;
    section += "\n";
    // Add USD Prices section if available
    if (priceData) {
        section += "### Current Prices (USD)\n\n";
        section += "| Asset | Price (USD) | Notes |\n";
        section += "|-------|-------------|-------|\n";
        section += `| SOL | ${(0, fetchPrices_1.formatUSDPrice)(priceData.solPriceUSD)} | Market price |\n`;
        section += `| FRAGME | ${(0, fetchPrices_1.formatUSDPrice)(priceData.fragmePriceUSD)} | Calculated from pool |\n`;
        section += `| Pool Price | ${(0, tickToPrice_1.formatPrice)(pool.currentPrice)} FRAGME/SOL | Current pool ratio |\n`;
        section += "\n";
        // Calculate TVL in USD with actual SOL price
        const token0AmountSOL = parseFloat((0, bnUtils_1.addDecimalPoint)(pool.token0.amount, pool.token0.decimals));
        const token1AmountFRAGME = parseFloat((0, bnUtils_1.addDecimalPoint)(pool.token1.amount, pool.token1.decimals));
        const token0ValueUSD = token0AmountSOL * priceData.solPriceUSD;
        const token1ValueUSD = token1AmountFRAGME * priceData.fragmePriceUSD;
        const totalTVLUSD = token0ValueUSD + token1ValueUSD;
        section += "### Total Value Locked (TVL)\n\n";
        section += "| Component | Amount | Value (USD) |\n";
        section += "|-----------|--------|-------------|\n";
        section += `| SOL | ${token0AmountSOL.toFixed(4)} | ${(0, fetchPrices_1.formatUSDPrice)(token0ValueUSD)} |\n`;
        section += `| FRAGME | ${token1AmountFRAGME.toFixed(4)} | ${(0, fetchPrices_1.formatUSDPrice)(token1ValueUSD)} |\n`;
        section += `| **Total TVL** | - | **${(0, fetchPrices_1.formatUSDPrice)(totalTVLUSD)}** |\n`;
        section += "\n";
        section += `*Price data source: ${priceData.priceSource} at ${priceData.calculatedAt.toLocaleTimeString()}*\n\n`;
    }
    else {
        section += "*Note: USD prices unavailable - API connection failed*\n\n";
    }
    return section;
}
/**
 * Generate position statistics section
 */
function generatePositionStatisticsSection(positions, pool) {
    let section = "";
    // Calculate liquidity distribution
    let totalLiquidity = new bn_js_1.default(0);
    let activeLiquidity = new bn_js_1.default(0);
    positions.forEach((pos) => {
        totalLiquidity = totalLiquidity.add(pos.liquidity);
        const isActive = pool.currentTick >= pos.tickLowerIndex &&
            pool.currentTick < pos.tickUpperIndex;
        if (isActive) {
            activeLiquidity = activeLiquidity.add(pos.liquidity);
        }
    });
    const activePercentage = totalLiquidity.isZero()
        ? "0.00"
        : ((activeLiquidity.toNumber() / totalLiquidity.toNumber()) * 100).toFixed(2);
    section += "### Liquidity Distribution\n\n";
    section += "| Type | Liquidity | Percentage |\n";
    section += "|------|-----------|------------|\n";
    section += `| Total | ${totalLiquidity.toString()} | 100.00% |\n`;
    section += `| Active | ${activeLiquidity.toString()} | ${activePercentage}% |\n`;
    section += `| Inactive | ${totalLiquidity
        .sub(activeLiquidity)
        .toString()} | ${(100 - parseFloat(activePercentage)).toFixed(2)}% |\n`;
    section += "\n";
    return section;
}
/**
 * Generate ownership analysis section
 */
function generateOwnershipAnalysisSection(positions) {
    let section = "";
    const ownerMap = new Map();
    positions.forEach((pos) => {
        const owner = pos.positionOwnerAddress || "Unknown";
        const existing = ownerMap.get(owner);
        if (existing) {
            existing.count++;
            existing.liquidity = existing.liquidity.add(pos.liquidity);
        }
        else {
            ownerMap.set(owner, {
                count: 1,
                liquidity: new bn_js_1.default(pos.liquidity)
            });
        }
    });
    const uniqueOwners = ownerMap.size;
    const avgPositionsPerOwner = positions.length > 0 ? (positions.length / uniqueOwners).toFixed(2) : "0";
    section += "| Metric | Value |\n";
    section += "|--------|-------|\n";
    section += `| Unique Owners | ${uniqueOwners} |\n`;
    section += `| Average Positions per Owner | ${avgPositionsPerOwner} |\n`;
    // Check if target owner has positions
    const targetOwnerData = ownerMap.get(TARGET_OWNER);
    if (targetOwnerData) {
        section += `| ${TARGET_OWNER} Positions | ${targetOwnerData.count} |\n`;
        section += `| ${TARGET_OWNER} Liquidity | ${targetOwnerData.liquidity.toString()} |\n`;
    }
    section += "\n";
    return section;
}
/**
 * Generate positions table
 */
function generatePositionsTable(positions, pool) {
    if (positions.length === 0) {
        return "No positions found.\n\n";
    }
    let table = "";
    table += "| # | Owner | Active | Price Range | Liquidity | NFT Mint |\n";
    table += "|---|-------|--------|-------------|-----------|----------|\n";
    // Sort positions by liquidity (highest first)
    const sortedPositions = [...positions].sort((a, b) => b.liquidity.cmp(a.liquidity));
    sortedPositions.forEach((pos, index) => {
        const owner = pos.positionOwnerAddress
            ? `${pos.positionOwnerAddress.slice(0, 8)}...`
            : "Unknown";
        const isActive = pool.currentTick >= pos.tickLowerIndex &&
            pool.currentTick < pos.tickUpperIndex;
        const activeStatus = isActive ? "Yes" : "No";
        const priceRange = (0, tickToPrice_1.tickRangeToPriceRange)(pos.tickLowerIndex, pos.tickUpperIndex, pool.poolState.mintDecimals0, pool.poolState.mintDecimals1, pool.currentTick, pool.poolState.sqrtPriceX64);
        // Format price range without brackets that might interfere with table
        const priceLower = (0, tickToPrice_1.formatPrice)(priceRange.priceLower, { maxDecimals: 4 });
        const priceUpper = (0, tickToPrice_1.formatPrice)(priceRange.priceUpper, { maxDecimals: 4 });
        const rangeStr = `${priceLower}-${priceUpper}`;
        const nftMint = `${pos.nftMint.toBase58().slice(0, 8)}...`;
        table += `| ${index + 1} | ${owner} | ${activeStatus} | ${rangeStr} | ${pos.liquidity.toString()} | ${nftMint} |\n`;
    });
    table += "\n";
    return table;
}
/**
 * Generate target owner positions table
 */
function generateTargetOwnerPositions(positions, pool, targetOwner) {
    const targetPositions = positions.filter((p) => p.positionOwnerAddress === targetOwner);
    if (targetPositions.length === 0) {
        return `No positions found for owner ${targetOwner}.\n\n`;
    }
    let table = "";
    table += `### Total Positions: ${targetPositions.length}\n\n`;
    // Calculate total liquidity for target owner
    let totalTargetLiquidity = new bn_js_1.default(0);
    let activeTargetLiquidity = new bn_js_1.default(0);
    targetPositions.forEach((pos) => {
        totalTargetLiquidity = totalTargetLiquidity.add(pos.liquidity);
        const isActive = pool.currentTick >= pos.tickLowerIndex &&
            pool.currentTick < pos.tickUpperIndex;
        if (isActive) {
            activeTargetLiquidity = activeTargetLiquidity.add(pos.liquidity);
        }
    });
    table += `### Total Liquidity: ${totalTargetLiquidity.toString()}\n`;
    table += `### Active Liquidity: ${activeTargetLiquidity.toString()}\n\n`;
    table +=
        "| # | Active | Tick Range | Price Range | Liquidity | Fees Owed | NFT Mint |\n";
    table +=
        "|---|--------|------------|-------------|-----------|-----------|----------|\n";
    // Sort by liquidity
    const sortedTargetPositions = [...targetPositions].sort((a, b) => b.liquidity.cmp(a.liquidity));
    sortedTargetPositions.forEach((pos, index) => {
        const isActive = pool.currentTick >= pos.tickLowerIndex &&
            pool.currentTick < pos.tickUpperIndex;
        const activeStatus = isActive ? "Yes" : "No";
        const tickRange = `${pos.tickLowerIndex}-${pos.tickUpperIndex}`;
        const priceRange = (0, tickToPrice_1.tickRangeToPriceRange)(pos.tickLowerIndex, pos.tickUpperIndex, pool.poolState.mintDecimals0, pool.poolState.mintDecimals1, pool.currentTick, pool.poolState.sqrtPriceX64);
        // Format price range without brackets
        const priceLower = (0, tickToPrice_1.formatPrice)(priceRange.priceLower, { maxDecimals: 4 });
        const priceUpper = (0, tickToPrice_1.formatPrice)(priceRange.priceUpper, { maxDecimals: 4 });
        const priceRangeStr = `${priceLower}-${priceUpper}`;
        const feesOwed = pos.tokenFeesOwed0.gt(new bn_js_1.default(0)) || pos.tokenFeesOwed1.gt(new bn_js_1.default(0))
            ? `T0:${pos.tokenFeesOwed0.toString()} T1:${pos.tokenFeesOwed1.toString()}`
            : "None";
        const nftMint = pos.nftMint.toBase58();
        table += `| ${index + 1} | ${activeStatus} | ${tickRange} | ${priceRangeStr} | ${pos.liquidity.toString()} | ${feesOwed} | ${nftMint} |\n`;
    });
    table += "\n";
    return table;
}
/**
 * Generate top liquidity providers section
 */
function generateTopLiquidityProviders(positions) {
    const ownerMap = new Map();
    positions.forEach((pos) => {
        const owner = pos.positionOwnerAddress || "Unknown";
        const existing = ownerMap.get(owner);
        if (existing) {
            existing.count++;
            existing.liquidity = existing.liquidity.add(pos.liquidity);
        }
        else {
            ownerMap.set(owner, {
                count: 1,
                liquidity: new bn_js_1.default(pos.liquidity)
            });
        }
    });
    // Sort by liquidity
    const topProviders = Array.from(ownerMap.entries())
        .map(([owner, data]) => (Object.assign({ owner }, data)))
        .sort((a, b) => b.liquidity.cmp(a.liquidity))
        .slice(0, 10);
    let table = "";
    table += "| Rank | Owner | Positions | Total Liquidity | Share |\n";
    table += "|------|-------|-----------|-----------------|-------|\n";
    // Calculate total liquidity
    let totalLiquidity = new bn_js_1.default(0);
    positions.forEach((p) => (totalLiquidity = totalLiquidity.add(p.liquidity)));
    topProviders.forEach((provider, index) => {
        const share = totalLiquidity.isZero()
            ? "0.00"
            : ((provider.liquidity.toNumber() / totalLiquidity.toNumber()) *
                100).toFixed(2);
        const ownerDisplay = provider.owner === "Unknown" ? "Unknown" : provider.owner;
        table += `| ${index + 1} | ${ownerDisplay} | ${provider.count} | ${provider.liquidity.toString()} | ${share}% |\n`;
    });
    table += "\n";
    return table;
}
/**
 * Generate volume and fees section
 */
function generateVolumeAndFeesSection(pool) {
    let section = "";
    section += "### Cumulative Volume\n\n";
    section += "| Direction | Token 0 (SOL) | Token 1 (FRAGME) |\n";
    section += "|-----------|---------------|------------------|\n";
    section += `| Swap In | ${(0, bnUtils_1.addDecimalPoint)(pool.volume.swapInToken0, pool.token0.decimals)} | ${(0, bnUtils_1.addDecimalPoint)(pool.volume.swapInToken1, pool.token1.decimals)} |\n`;
    section += `| Swap Out | ${(0, bnUtils_1.addDecimalPoint)(pool.volume.swapOutToken0, pool.token0.decimals)} | ${(0, bnUtils_1.addDecimalPoint)(pool.volume.swapOutToken1, pool.token1.decimals)} |\n`;
    section += "\n";
    section += "### Fees Collected\n\n";
    section += "| Type | Token 0 (SOL) | Token 1 (FRAGME) |\n";
    section += "|------|---------------|------------------|\n";
    section += `| Total Fees | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.totalToken0, pool.token0.decimals)} | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.totalToken1, pool.token1.decimals)} |\n`;
    section += `| Claimed Fees | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.claimedToken0, pool.token0.decimals)} | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.claimedToken1, pool.token1.decimals)} |\n`;
    section += `| Unclaimed Fees | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.totalToken0.sub(pool.fees.claimedToken0), pool.token0.decimals)} | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.totalToken1.sub(pool.fees.claimedToken1), pool.token1.decimals)} |\n`;
    section += `| Protocol Fees | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.protocolToken0, pool.token0.decimals)} | ${(0, bnUtils_1.addDecimalPoint)(pool.fees.protocolToken1, pool.token1.decimals)} |\n`;
    section += "\n";
    return section;
}
/**
 * Save report to file
 */
function saveReportToFile(report, outputPath) {
    try {
        // Ensure directory exists
        const dir = path_1.default.dirname(outputPath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        // Write file
        fs_1.default.writeFileSync(outputPath, report, "utf8");
        console.log(`\nReport saved to: ${outputPath}`);
    }
    catch (error) {
        console.error(`Error saving report: ${error}`);
    }
}
/**
 * Generate report filename with timestamp
 */
function generateReportFilename() {
    const now = new Date();
    const timestamp = now
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, -5); // Remove milliseconds and Z
    return `pool_analysis_report_${timestamp}.md`;
}
