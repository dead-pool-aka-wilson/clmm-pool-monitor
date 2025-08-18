import axios from "axios";
import { PoolInfo } from "./fetchPool";
import { PersonalPosition } from "./fetchPositions";
import { TokenPricesUSD, formatUSDPrice } from "./fetchPrices";
import { tickRangeToPriceRange, formatPrice } from "./tickToPrice";
import { addDecimalPoint } from "./bnUtils";
import BN from "bn.js";

// Target wallets to track (configure in .env or here)
const TARGET_WALLETS = [
  "Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6"
  // Add more wallet addresses to track
];

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface ReportSummary {
  poolAddress: string;
  notionPageUrl: string;
  timestamp: Date;
  currentPrices: {
    solPriceUSD: number;
    fragmePriceUSD: number;
    fragmePerSol: number;
    priceChangePercent?: number; // 24h change if available
  };
  tvl: {
    totalUSD: number;
    solAmount: number;
    fragmeAmount: number;
  };
  poolMetrics: {
    totalPositions: number;
    activePositions: number;
    utilizationRate: number;
  };
  targetWalletPositions: WalletPositionSummary[];
}

export interface WalletPositionSummary {
  walletAddress: string;
  walletLabel?: string; // Optional friendly name
  totalPositions: number;
  activePositions: number;
  inactivePositions: number;
  totalLiquidity: string;
  positions: PositionDetail[];
}

export interface PositionDetail {
  nftMint: string;
  isActive: boolean;
  tickRange: {
    lower: number;
    upper: number;
  };
  priceRange: {
    lower: string;
    upper: string;
  };
  liquidity: string;
  currentPrice: string;
  rangeStatus: "IN_RANGE" | "ABOVE_RANGE" | "BELOW_RANGE";
}

/**
 * Generate report summary for Slack
 */
export function generateReportSummary(
  pool: PoolInfo,
  positions: PersonalPosition[],
  priceData: TokenPricesUSD | null,
  notionPageUrl: string
): ReportSummary {
  // Calculate TVL
  const token0AmountSOL = parseFloat(
    addDecimalPoint(pool.token0.amount, pool.token0.decimals)
  );
  const token1AmountFRAGME = parseFloat(
    addDecimalPoint(pool.token1.amount, pool.token1.decimals)
  );

  const tvlData = priceData
    ? {
        totalUSD:
          token0AmountSOL * priceData.solPriceUSD +
          token1AmountFRAGME * priceData.fragmePriceUSD,
        solAmount: token0AmountSOL,
        fragmeAmount: token1AmountFRAGME
      }
    : {
        totalUSD: 0,
        solAmount: token0AmountSOL,
        fragmeAmount: token1AmountFRAGME
      };

  // Pool metrics
  const activePositions = positions.filter(
    (p) =>
      pool.currentTick >= p.tickLowerIndex &&
      pool.currentTick < p.tickUpperIndex
  );

  const utilizationRate =
    positions.length > 0
      ? (activePositions.length / positions.length) * 100
      : 0;

  // Analyze target wallet positions
  const targetWalletPositions = analyzeTargetWalletPositions(
    positions,
    pool,
    TARGET_WALLETS
  );

  return {
    poolAddress: pool.poolAddress,
    notionPageUrl,
    timestamp: new Date(),
    currentPrices: priceData
      ? {
          solPriceUSD: priceData.solPriceUSD,
          fragmePriceUSD: priceData.fragmePriceUSD,
          fragmePerSol: priceData.fragmePerSol
        }
      : {
          solPriceUSD: 0,
          fragmePriceUSD: 0,
          fragmePerSol: parseFloat(pool.currentPrice)
        },
    tvl: tvlData,
    poolMetrics: {
      totalPositions: positions.length,
      activePositions: activePositions.length,
      utilizationRate
    },
    targetWalletPositions
  };
}

/**
 * Analyze positions for target wallets
 */
function analyzeTargetWalletPositions(
  positions: PersonalPosition[],
  pool: PoolInfo,
  targetWallets: string[]
): WalletPositionSummary[] {
  const summaries: WalletPositionSummary[] = [];

  for (const wallet of targetWallets) {
    const walletPositions = positions.filter(
      (p) => p.positionOwnerAddress === wallet
    );

    if (walletPositions.length === 0) continue;

    let totalLiquidity = new BN(0);
    let activeCount = 0;
    const positionDetails: PositionDetail[] = [];

    walletPositions.forEach((pos) => {
      totalLiquidity = totalLiquidity.add(pos.liquidity);

      const isActive =
        pool.currentTick >= pos.tickLowerIndex &&
        pool.currentTick < pos.tickUpperIndex;

      if (isActive) activeCount++;

      const priceRange = tickRangeToPriceRange(
        pos.tickLowerIndex,
        pos.tickUpperIndex,
        pool.poolState.mintDecimals0,
        pool.poolState.mintDecimals1,
        pool.currentTick,
        pool.poolState.sqrtPriceX64
      );

      // Determine range status
      let rangeStatus: "IN_RANGE" | "ABOVE_RANGE" | "BELOW_RANGE";
      if (isActive) {
        rangeStatus = "IN_RANGE";
      } else if (pool.currentTick < pos.tickLowerIndex) {
        rangeStatus = "ABOVE_RANGE"; // Price is below the range
      } else {
        rangeStatus = "BELOW_RANGE"; // Price is above the range
      }

      positionDetails.push({
        nftMint: pos.nftMint.toBase58(),
        isActive,
        tickRange: {
          lower: pos.tickLowerIndex,
          upper: pos.tickUpperIndex
        },
        priceRange: {
          lower: priceRange.priceLower,
          upper: priceRange.priceUpper
        },
        liquidity: pos.liquidity.toString(),
        currentPrice: pool.currentPrice,
        rangeStatus
      });
    });

    summaries.push({
      walletAddress: wallet,
      walletLabel: getWalletLabel(wallet), // Optional: add friendly names
      totalPositions: walletPositions.length,
      activePositions: activeCount,
      inactivePositions: walletPositions.length - activeCount,
      totalLiquidity: totalLiquidity.toString(),
      positions: positionDetails
    });
  }

  return summaries;
}

/**
 * Get friendly label for wallet address (optional)
 */
function getWalletLabel(address: string): string | undefined {
  const labels: Record<string, string> = {
    Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6: "Main Wallet"
    // Add more labels as needed
  };
  return labels[address];
}

/**
 * Format summary as Slack message
 */
function formatSlackMessage(summary: ReportSummary): any {
  const timestamp = Math.floor(summary.timestamp.getTime() / 1000);

  // Main message blocks
  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📊 Byreal CLMM Pool Analysis Report",
        emoji: true
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Generated:*\n<!date^${timestamp}^{date_pretty} at {time}|${summary.timestamp.toISOString()}>`
        },
        {
          type: "mrkdwn",
          text: `*Pool Address:*\n\`${summary.poolAddress.slice(0, 12)}...\``
        }
      ]
    },
    {
      type: "divider"
    }
  ];

  // Price Information
  const priceChangeEmoji = summary.currentPrices.priceChangePercent
    ? summary.currentPrices.priceChangePercent >= 0
      ? "📈"
      : "📉"
    : "➡️";

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*💰 Current Prices*`
    },
    fields: [
      {
        type: "mrkdwn",
        text: `*SOL:* ${formatUSDPrice(summary.currentPrices.solPriceUSD)}`
      },
      {
        type: "mrkdwn",
        text: `*FRAGME:* ${formatUSDPrice(
          summary.currentPrices.fragmePriceUSD
        )} ${priceChangeEmoji}`
      },
      {
        type: "mrkdwn",
        text: `*Pool Rate:* ${formatPrice(
          summary.currentPrices.fragmePerSol.toString()
        )} FRAGME/SOL`
      },
      {
        type: "mrkdwn",
        text: `*TVL:* ${formatUSDPrice(summary.tvl.totalUSD)}`
      }
    ]
  });

  // Pool Metrics
  blocks.push(
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📊 Pool Metrics*`
      },
      fields: [
        {
          type: "mrkdwn",
          text: `*Total Positions:* ${summary.poolMetrics.totalPositions}`
        },
        {
          type: "mrkdwn",
          text: `*Active:* ${
            summary.poolMetrics.activePositions
          } (${summary.poolMetrics.utilizationRate.toFixed(1)}%)`
        }
      ]
    }
  );

  // Target Wallet Positions
  if (summary.targetWalletPositions.length > 0) {
    blocks.push(
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🎯 Tracked Wallet Positions*`
        }
      }
    );

    summary.targetWalletPositions.forEach((wallet) => {
      const walletName =
        wallet.walletLabel || `Wallet ${wallet.walletAddress.slice(0, 8)}...`;

      // Create position status summary
      const activeEmoji = "🟢";
      const inactiveEmoji = "🔴";

      let positionSummary = `*${walletName}*\n`;
      positionSummary += `Total: ${wallet.totalPositions} | `;
      positionSummary += `Active: ${wallet.activePositions} ${activeEmoji} | `;
      positionSummary += `Inactive: ${wallet.inactivePositions} ${inactiveEmoji}\n`;

      // Add top 3 positions with their ranges
      const topPositions = wallet.positions
        .sort((a, b) => parseInt(b.liquidity) - parseInt(a.liquidity))
        .slice(0, 3);

      if (topPositions.length > 0) {
        positionSummary += `*Top Positions:*\n`;
        topPositions.forEach((pos, idx) => {
          const statusEmoji = pos.isActive ? "✅" : "❌";
          const lowerPrice = formatPrice(pos.priceRange.lower, {
            maxDecimals: 2
          });
          const upperPrice = formatPrice(pos.priceRange.upper, {
            maxDecimals: 2
          });
          positionSummary += `${
            idx + 1
          }. ${statusEmoji} Range: [${lowerPrice} - ${upperPrice}] FRAGME/SOL\n`;

          // Add range status indicator
          if (pos.rangeStatus === "ABOVE_RANGE") {
            positionSummary += `   ⬆️ _Price below range - waiting for price to rise_\n`;
          } else if (pos.rangeStatus === "BELOW_RANGE") {
            positionSummary += `   ⬇️ _Price above range - waiting for price to fall_\n`;
          }
        });
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: positionSummary
        }
      });
    });
  }

  // Action buttons
  blocks.push(
    {
      type: "divider"
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📄 View Full Report",
            emoji: true
          },
          url: summary.notionPageUrl,
          style: "primary"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🔍 View on Solscan",
            emoji: true
          },
          url: `https://solscan.io/account/${summary.poolAddress}`
        }
      ]
    }
  );

  return {
    blocks,
    text: `Pool Analysis Report - TVL: ${formatUSDPrice(
      summary.tvl.totalUSD
    )} | FRAGME: ${formatUSDPrice(summary.currentPrices.fragmePriceUSD)}`
  };
}

/**
 * Send report summary to Slack
 */
export async function sendSlackNotification(
  summary: ReportSummary,
  config: SlackConfig
): Promise<void> {
  try {
    console.log("\n📮 Sending notification to Slack...");

    const message = formatSlackMessage(summary);

    // Add optional configuration
    if (config.username) {
      message.username = config.username;
    }
    if (config.iconEmoji) {
      message.icon_emoji = config.iconEmoji;
    }
    if (config.channel) {
      message.channel = config.channel;
    }

    const response = await axios.post(config.webhookUrl, message);

    if (response.status === 200) {
      console.log("✅ Slack notification sent successfully!");
    } else {
      console.warn(`⚠️ Slack responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Failed to send Slack notification:", error);
    throw error;
  }
}

/**
 * Load Slack configuration from environment
 */
export function loadSlackConfig(): SlackConfig | null {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("⚠️ Slack webhook URL not found in environment variables");
    console.warn("   Required: SLACK_WEBHOOK_URL");
    return null;
  }

  return {
    webhookUrl,
    channel: process.env.SLACK_CHANNEL,
    username: process.env.SLACK_USERNAME || "Byreal Pool Bot",
    iconEmoji: process.env.SLACK_ICON_EMOJI || ":chart_with_upwards_trend:"
  };
}

/**
 * Main function to handle Slack notification after Notion publish
 */
export async function notifySlackAfterNotionPublish(
  pool: PoolInfo,
  positions: PersonalPosition[],
  priceData: TokenPricesUSD | null,
  notionPageUrl: string
): Promise<void> {
  const slackConfig = loadSlackConfig();

  if (!slackConfig) {
    console.log("⚠️ Slack notification skipped - configuration not found");
    return;
  }

  const summary = generateReportSummary(
    pool,
    positions,
    priceData,
    notionPageUrl
  );

  await sendSlackNotification(summary, slackConfig);
}

/**
 * Format percentage change with emoji
 */
function formatPercentageChange(change: number): string {
  const emoji = change >= 0 ? "📈" : "📉";
  const color = change >= 0 ? "green" : "red";
  return `${emoji} ${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

/**
 * Get tracked wallets from environment or config
 */
export function getTrackedWallets(): string[] {
  const envWallets = process.env.TRACKED_WALLETS;
  if (envWallets) {
    return envWallets.split(",").map((w) => w.trim());
  }
  return TARGET_WALLETS;
}
