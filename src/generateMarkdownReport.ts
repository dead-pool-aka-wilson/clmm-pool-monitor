import fs from "fs";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PoolInfo } from "./fetchPool";
import { PersonalPosition } from "./fetchPositions";
import { tickRangeToPriceRange, formatPrice } from "./tickToPrice";
import { addDecimalPoint, formatBN } from "./bnUtils";
import {
  publishReportToNotion as publishToNotionAPI,
  loadNotionConfig,
  createReportMetadata
} from "./publishToNotion";
import {
  fetchSOLPrice,
  calculateUSDPrices,
  formatUSDPrice,
  TokenPricesUSD
} from "./fetchPrices";
import { generateSwapCapacitySection } from "./swapSimulator";
import { notifySlackAfterNotionPublish } from "./slackNotifier";

// Target owner to track specially
const TARGET_OWNER = "Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6";

export interface ReportData {
  pool: PoolInfo;
  positions: PersonalPosition[];
  timestamp: Date;
  priceData?: TokenPricesUSD;
}

/**
 * Generate comprehensive markdown report with Slack notification
 */
export async function generateMarkdownReport(
  data: ReportData,
  outputPath?: string,
  publishToNotion: boolean = false,
  sendSlackNotification: boolean = true // New parameter
): Promise<string> {
  const { pool, positions, timestamp } = data;

  // Fetch SOL price and calculate USD prices
  let priceData: TokenPricesUSD | null = null;
  try {
    console.log("\n💰 Fetching current SOL price...");
    const solPriceData = await fetchSOLPrice();
    priceData = calculateUSDPrices(pool.currentPrice, solPriceData.solPriceUSD);
    console.log(
      `   SOL Price: ${formatUSDPrice(priceData.solPriceUSD)} (${
        solPriceData.source
      })`
    );
    console.log(`   FRAGME Price: ${formatUSDPrice(priceData.fragmePriceUSD)}`);
  } catch (error) {
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
    report += `Example: Current price of ${formatPrice(
      pool.currentPrice
    )} FRAGME/SOL means:\n`;
    report += `- 1 SOL = ${formatPrice(pool.currentPrice)} FRAGME\n`;
    report += `- 1 FRAGME = ${(1 / parseFloat(pool.currentPrice)).toFixed(
      6
    )} SOL\n\n`;
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
  report += generateSwapCapacitySection(pool, positions);

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
  let notionPageUrl: string | null = null;
  if (publishToNotion) {
    const notionConfig = loadNotionConfig();
    if (notionConfig) {
      try {
        const metadata = createReportMetadata(pool, positions, timestamp);
        notionPageUrl = await publishToNotionAPI(
          report,
          metadata,
          notionConfig
        );
        console.log(`\n🔗 Notion Page: ${notionPageUrl}`);

        // Send Slack notification if enabled and Notion publish was successful
        if (sendSlackNotification && notionPageUrl) {
          try {
            await notifySlackAfterNotionPublish(
              pool,
              positions,
              priceData,
              notionPageUrl
            );
          } catch (slackError) {
            console.error("Failed to send Slack notification:", slackError);
            // Don't throw - Slack notification is not critical
          }
        }
      } catch (error) {
        console.error("Failed to publish to Notion:", error);
      }
    } else {
      console.log("⚠️ Notion publishing skipped - configuration not found");
    }
  }

  return report;
}

/**
 * Generate pool overview section
 */
function generatePoolOverviewSection(pool: PoolInfo): string {
  let section = "";

  section += "| Metric | Value |\n";
  section += "|--------|-------|\n";
  section += `| Pool Address | ${pool.poolAddress} |\n`;
  section += `| Token 0 (SOL) | ${pool.token0.mint} |\n`;
  section += `| Token 1 (FRAGME) | ${pool.token1.mint} |\n`;
  section += `| Current Price | ${formatPrice(
    pool.currentPrice
  )} FRAGME/SOL |\n`;
  section += `| Current Tick | ${pool.currentTick} |\n`;
  section += `| Tick Spacing | ${pool.poolState.tickSpacing} |\n`;
  section += `| Status | ${
    pool.poolState.status === 0 ? "Active" : "Paused"
  } |\n`;
  section += `| TVL | ${formatPrice(pool.tvl)} |\n`;
  section += `| Total Liquidity | ${pool.totalLiquidity} |\n`;
  section += "\n";

  return section;
}

/**
 * Generate market metrics section
 */
function generateMarketMetricsSection(
  pool: PoolInfo,
  positions: PersonalPosition[],
  priceData?: TokenPricesUSD | null
): string {
  let section = "";

  const activePositions = positions.filter(
    (p) =>
      pool.currentTick >= p.tickLowerIndex &&
      pool.currentTick < p.tickUpperIndex
  );

  const utilization =
    positions.length > 0
      ? ((activePositions.length / positions.length) * 100).toFixed(2)
      : "0.00";

  // Basic metrics table
  section += "### Pool Metrics\n\n";
  section += "| Metric | Value |\n";
  section += "|--------|-------|\n";
  section += `| Token 0 Balance | ${addDecimalPoint(
    pool.token0.amount,
    pool.token0.decimals
  )} SOL |\n`;
  section += `| Token 1 Balance | ${addDecimalPoint(
    pool.token1.amount,
    pool.token1.decimals
  )} FRAGME |\n`;
  section += `| Total Positions | ${positions.length} |\n`;
  section += `| Active Positions | ${activePositions.length} |\n`;
  section += `| Inactive Positions | ${
    positions.length - activePositions.length
  } |\n`;
  section += `| Utilization Rate | ${utilization}% |\n`;
  section += "\n";

  // Add USD Prices section if available
  if (priceData) {
    section += "### Current Prices (USD)\n\n";
    section += "| Asset | Price (USD) | Notes |\n";
    section += "|-------|-------------|-------|\n";
    section += `| SOL | ${formatUSDPrice(
      priceData.solPriceUSD
    )} | Market price |\n`;
    section += `| FRAGME | ${formatUSDPrice(
      priceData.fragmePriceUSD
    )} | Calculated from pool |\n`;
    section += `| Pool Price | ${formatPrice(
      pool.currentPrice
    )} FRAGME/SOL | Current pool ratio |\n`;
    section += "\n";

    // Calculate TVL in USD with actual SOL price
    const token0AmountSOL = parseFloat(
      addDecimalPoint(pool.token0.amount, pool.token0.decimals)
    );
    const token1AmountFRAGME = parseFloat(
      addDecimalPoint(pool.token1.amount, pool.token1.decimals)
    );

    const token0ValueUSD = token0AmountSOL * priceData.solPriceUSD;
    const token1ValueUSD = token1AmountFRAGME * priceData.fragmePriceUSD;
    const totalTVLUSD = token0ValueUSD + token1ValueUSD;

    section += "### Total Value Locked (TVL)\n\n";
    section += "| Component | Amount | Value (USD) |\n";
    section += "|-----------|--------|-------------|\n";
    section += `| SOL | ${token0AmountSOL.toFixed(4)} | ${formatUSDPrice(
      token0ValueUSD
    )} |\n`;
    section += `| FRAGME | ${token1AmountFRAGME.toFixed(4)} | ${formatUSDPrice(
      token1ValueUSD
    )} |\n`;
    section += `| **Total TVL** | - | **${formatUSDPrice(totalTVLUSD)}** |\n`;
    section += "\n";

    section += `*Price data source: ${
      priceData.priceSource
    } at ${priceData.calculatedAt.toLocaleTimeString()}*\n\n`;
  } else {
    section += "*Note: USD prices unavailable - API connection failed*\n\n";
  }

  return section;
}

/**
 * Generate position statistics section
 */
function generatePositionStatisticsSection(
  positions: PersonalPosition[],
  pool: PoolInfo
): string {
  let section = "";

  // Calculate liquidity distribution
  let totalLiquidity = new BN(0);
  let activeLiquidity = new BN(0);

  positions.forEach((pos) => {
    totalLiquidity = totalLiquidity.add(pos.liquidity);
    const isActive =
      pool.currentTick >= pos.tickLowerIndex &&
      pool.currentTick < pos.tickUpperIndex;
    if (isActive) {
      activeLiquidity = activeLiquidity.add(pos.liquidity);
    }
  });

  const activePercentage = totalLiquidity.isZero()
    ? "0.00"
    : ((activeLiquidity.toNumber() / totalLiquidity.toNumber()) * 100).toFixed(
        2
      );

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
function generateOwnershipAnalysisSection(
  positions: PersonalPosition[]
): string {
  let section = "";

  const ownerMap = new Map<string, { count: number; liquidity: BN }>();

  positions.forEach((pos) => {
    const owner = pos.positionOwnerAddress || "Unknown";
    const existing = ownerMap.get(owner);
    if (existing) {
      existing.count++;
      existing.liquidity = existing.liquidity.add(pos.liquidity);
    } else {
      ownerMap.set(owner, {
        count: 1,
        liquidity: new BN(pos.liquidity)
      });
    }
  });

  const uniqueOwners = ownerMap.size;
  const avgPositionsPerOwner =
    positions.length > 0 ? (positions.length / uniqueOwners).toFixed(2) : "0";

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
function generatePositionsTable(
  positions: PersonalPosition[],
  pool: PoolInfo
): string {
  if (positions.length === 0) {
    return "No positions found.\n\n";
  }

  let table = "";
  table += "| # | Owner | Active | Price Range | Liquidity | NFT Mint |\n";
  table += "|---|-------|--------|-------------|-----------|----------|\n";

  // Sort positions by liquidity (highest first)
  const sortedPositions = [...positions].sort((a, b) =>
    b.liquidity.cmp(a.liquidity)
  );

  sortedPositions.forEach((pos, index) => {
    const owner = pos.positionOwnerAddress
      ? `${pos.positionOwnerAddress.slice(0, 8)}...`
      : "Unknown";

    const isActive =
      pool.currentTick >= pos.tickLowerIndex &&
      pool.currentTick < pos.tickUpperIndex;
    const activeStatus = isActive ? "Yes" : "No";

    const priceRange = tickRangeToPriceRange(
      pos.tickLowerIndex,
      pos.tickUpperIndex,
      pool.poolState.mintDecimals0,
      pool.poolState.mintDecimals1,
      pool.currentTick,
      pool.poolState.sqrtPriceX64
    );

    // Format price range without brackets that might interfere with table
    const priceLower = formatPrice(priceRange.priceLower, { maxDecimals: 4 });
    const priceUpper = formatPrice(priceRange.priceUpper, { maxDecimals: 4 });
    const rangeStr = `${priceLower}-${priceUpper}`;

    const nftMint = `${pos.nftMint.toBase58().slice(0, 8)}...`;

    table += `| ${
      index + 1
    } | ${owner} | ${activeStatus} | ${rangeStr} | ${pos.liquidity.toString()} | ${nftMint} |\n`;
  });

  table += "\n";
  return table;
}

/**
 * Generate target owner positions table
 */
function generateTargetOwnerPositions(
  positions: PersonalPosition[],
  pool: PoolInfo,
  targetOwner: string
): string {
  const targetPositions = positions.filter(
    (p) => p.positionOwnerAddress === targetOwner
  );

  if (targetPositions.length === 0) {
    return `No positions found for owner ${targetOwner}.\n\n`;
  }

  let table = "";
  table += `### Total Positions: ${targetPositions.length}\n\n`;

  // Calculate total liquidity for target owner
  let totalTargetLiquidity = new BN(0);
  let activeTargetLiquidity = new BN(0);

  targetPositions.forEach((pos) => {
    totalTargetLiquidity = totalTargetLiquidity.add(pos.liquidity);
    const isActive =
      pool.currentTick >= pos.tickLowerIndex &&
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
  const sortedTargetPositions = [...targetPositions].sort((a, b) =>
    b.liquidity.cmp(a.liquidity)
  );

  sortedTargetPositions.forEach((pos, index) => {
    const isActive =
      pool.currentTick >= pos.tickLowerIndex &&
      pool.currentTick < pos.tickUpperIndex;
    const activeStatus = isActive ? "Yes" : "No";

    const tickRange = `${pos.tickLowerIndex}-${pos.tickUpperIndex}`;

    const priceRange = tickRangeToPriceRange(
      pos.tickLowerIndex,
      pos.tickUpperIndex,
      pool.poolState.mintDecimals0,
      pool.poolState.mintDecimals1,
      pool.currentTick,
      pool.poolState.sqrtPriceX64
    );

    // Format price range without brackets
    const priceLower = formatPrice(priceRange.priceLower, { maxDecimals: 4 });
    const priceUpper = formatPrice(priceRange.priceUpper, { maxDecimals: 4 });
    const priceRangeStr = `${priceLower}-${priceUpper}`;

    const feesOwed =
      pos.tokenFeesOwed0.gt(new BN(0)) || pos.tokenFeesOwed1.gt(new BN(0))
        ? `T0:${pos.tokenFeesOwed0.toString()} T1:${pos.tokenFeesOwed1.toString()}`
        : "None";

    const nftMint = pos.nftMint.toBase58();

    table += `| ${
      index + 1
    } | ${activeStatus} | ${tickRange} | ${priceRangeStr} | ${pos.liquidity.toString()} | ${feesOwed} | ${nftMint} |\n`;
  });

  table += "\n";
  return table;
}

/**
 * Generate top liquidity providers section
 */
function generateTopLiquidityProviders(positions: PersonalPosition[]): string {
  const ownerMap = new Map<string, { count: number; liquidity: BN }>();

  positions.forEach((pos) => {
    const owner = pos.positionOwnerAddress || "Unknown";
    const existing = ownerMap.get(owner);
    if (existing) {
      existing.count++;
      existing.liquidity = existing.liquidity.add(pos.liquidity);
    } else {
      ownerMap.set(owner, {
        count: 1,
        liquidity: new BN(pos.liquidity)
      });
    }
  });

  // Sort by liquidity
  const topProviders = Array.from(ownerMap.entries())
    .map(([owner, data]) => ({ owner, ...data }))
    .sort((a, b) => b.liquidity.cmp(a.liquidity))
    .slice(0, 10);

  let table = "";
  table += "| Rank | Owner | Positions | Total Liquidity | Share |\n";
  table += "|------|-------|-----------|-----------------|-------|\n";

  // Calculate total liquidity
  let totalLiquidity = new BN(0);
  positions.forEach((p) => (totalLiquidity = totalLiquidity.add(p.liquidity)));

  topProviders.forEach((provider, index) => {
    const share = totalLiquidity.isZero()
      ? "0.00"
      : (
          (provider.liquidity.toNumber() / totalLiquidity.toNumber()) *
          100
        ).toFixed(2);

    const ownerDisplay =
      provider.owner === "Unknown" ? "Unknown" : provider.owner;

    table += `| ${index + 1} | ${ownerDisplay} | ${
      provider.count
    } | ${provider.liquidity.toString()} | ${share}% |\n`;
  });

  table += "\n";
  return table;
}

/**
 * Generate volume and fees section
 */
function generateVolumeAndFeesSection(pool: PoolInfo): string {
  let section = "";

  section += "### Cumulative Volume\n\n";
  section += "| Direction | Token 0 (SOL) | Token 1 (FRAGME) |\n";
  section += "|-----------|---------------|------------------|\n";
  section += `| Swap In | ${addDecimalPoint(
    pool.volume.swapInToken0,
    pool.token0.decimals
  )} | ${addDecimalPoint(pool.volume.swapInToken1, pool.token1.decimals)} |\n`;
  section += `| Swap Out | ${addDecimalPoint(
    pool.volume.swapOutToken0,
    pool.token0.decimals
  )} | ${addDecimalPoint(pool.volume.swapOutToken1, pool.token1.decimals)} |\n`;
  section += "\n";

  section += "### Fees Collected\n\n";
  section += "| Type | Token 0 (SOL) | Token 1 (FRAGME) |\n";
  section += "|------|---------------|------------------|\n";
  section += `| Total Fees | ${addDecimalPoint(
    pool.fees.totalToken0,
    pool.token0.decimals
  )} | ${addDecimalPoint(pool.fees.totalToken1, pool.token1.decimals)} |\n`;
  section += `| Claimed Fees | ${addDecimalPoint(
    pool.fees.claimedToken0,
    pool.token0.decimals
  )} | ${addDecimalPoint(pool.fees.claimedToken1, pool.token1.decimals)} |\n`;
  section += `| Unclaimed Fees | ${addDecimalPoint(
    pool.fees.totalToken0.sub(pool.fees.claimedToken0),
    pool.token0.decimals
  )} | ${addDecimalPoint(
    pool.fees.totalToken1.sub(pool.fees.claimedToken1),
    pool.token1.decimals
  )} |\n`;
  section += `| Protocol Fees | ${addDecimalPoint(
    pool.fees.protocolToken0,
    pool.token0.decimals
  )} | ${addDecimalPoint(pool.fees.protocolToken1, pool.token1.decimals)} |\n`;
  section += "\n";

  return section;
}

/**
 * Save report to file
 */
function saveReportToFile(report: string, outputPath: string): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, report, "utf8");
    console.log(`\nReport saved to: ${outputPath}`);
  } catch (error) {
    console.error(`Error saving report: ${error}`);
  }
}

/**
 * Generate report filename with timestamp
 */
export function generateReportFilename(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, -5); // Remove milliseconds and Z

  return `pool_analysis_report_${timestamp}.md`;
}
