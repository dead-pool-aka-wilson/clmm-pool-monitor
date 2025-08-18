import { Client } from "@notionhq/client";
import { QueryDatabaseResponse } from "@notionhq/client/build/src/api-endpoints";

export interface PreviousPriceData {
  timestamp: Date;
  price: number;
  tvl: string;
  pageId: string;
}

export interface PriceChangeAnalysis {
  previousPrice: number;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  timeDiff: number; // hours
  isIncrease: boolean;
  trend: "surge" | "rise" | "stable" | "fall" | "crash";
  trendEmoji: string;
}

/**
 * Fetch the most recent price data from Notion database
 */
export async function fetchLatestPriceFromNotion(
  apiKey: string,
  databaseId: string
): Promise<PreviousPriceData | null> {
  try {
    const notion = new Client({ auth: apiKey });

    // Query database for the most recent entry
    const response: QueryDatabaseResponse = await notion.databases.query({
      database_id: databaseId,
      sorts: [
        {
          property: "Date",
          direction: "descending"
        }
      ],
      page_size: 1
    });

    if (response.results.length === 0) {
      console.log("📊 No previous data found in Notion");
      return null;
    }

    const latestPage = response.results[0] as any;

    // Extract properties
    const dateProperty = latestPage.properties["Date"]?.date?.start;
    const priceProperty =
      latestPage.properties["Current Price"]?.rich_text?.[0]?.text?.content;
    const tvlProperty =
      latestPage.properties["TVL"]?.rich_text?.[0]?.text?.content;

    if (!dateProperty || !priceProperty) {
      console.log("⚠️ Incomplete data in previous record");
      return null;
    }

    // Parse price (remove any formatting)
    const price = parseFloat(priceProperty.replace(/[^0-9.-]/g, ""));

    return {
      timestamp: new Date(dateProperty),
      price: price,
      tvl: tvlProperty || "",
      pageId: latestPage.id
    };
  } catch (error) {
    console.error("❌ Error fetching previous data from Notion:", error);
    return null;
  }
}

/**
 * Fetch multiple recent price entries for trend analysis
 */
export async function fetchRecentPriceHistory(
  apiKey: string,
  databaseId: string,
  limit: number = 10
): Promise<PreviousPriceData[]> {
  try {
    const notion = new Client({ auth: apiKey });

    const response: QueryDatabaseResponse = await notion.databases.query({
      database_id: databaseId,
      sorts: [
        {
          property: "Date",
          direction: "descending"
        }
      ],
      page_size: limit
    });

    const priceHistory: PreviousPriceData[] = [];

    for (const page of response.results) {
      const pageData = page as any;

      const dateProperty = pageData.properties["Date"]?.date?.start;
      const priceProperty =
        pageData.properties["Current Price"]?.rich_text?.[0]?.text?.content;
      const tvlProperty =
        pageData.properties["TVL"]?.rich_text?.[0]?.text?.content;

      if (dateProperty && priceProperty) {
        const price = parseFloat(priceProperty.replace(/[^0-9.-]/g, ""));

        priceHistory.push({
          timestamp: new Date(dateProperty),
          price: price,
          tvl: tvlProperty || "",
          pageId: pageData.id
        });
      }
    }

    return priceHistory;
  } catch (error) {
    console.error("❌ Error fetching price history from Notion:", error);
    return [];
  }
}

/**
 * Analyze price change between two data points
 */
export function analyzePriceChange(
  previousData: PreviousPriceData,
  currentPrice: number | string
): PriceChangeAnalysis {
  // Convert current price to number if string
  const currentPriceNum =
    typeof currentPrice === "string" ? parseFloat(currentPrice) : currentPrice;

  const priceChange = currentPriceNum - previousData.price;
  const priceChangePercent = (priceChange / previousData.price) * 100;

  // Calculate time difference in hours
  const timeDiff =
    (Date.now() - previousData.timestamp.getTime()) / (1000 * 60 * 60);

  // Determine trend based on percentage change
  let trend: PriceChangeAnalysis["trend"];
  let trendEmoji: string;

  const absPercent = Math.abs(priceChangePercent);

  if (priceChangePercent > 20) {
    trend = "surge";
    trendEmoji = "🚀";
  } else if (priceChangePercent > 5) {
    trend = "rise";
    trendEmoji = "📈";
  } else if (priceChangePercent > -5) {
    trend = "stable";
    trendEmoji = "➡️";
  } else if (priceChangePercent > -20) {
    trend = "fall";
    trendEmoji = "📉";
  } else {
    trend = "crash";
    trendEmoji = "💥";
  }

  return {
    previousPrice: previousData.price,
    currentPrice: currentPriceNum,
    priceChange,
    priceChangePercent,
    timeDiff,
    isIncrease: priceChange > 0,
    trend,
    trendEmoji
  };
}

/**
 * Calculate moving averages from price history
 */
export function calculateMovingAverages(priceHistory: PreviousPriceData[]): {
  ma3: number | null;
  ma7: number | null;
  ma24h: number | null;
} {
  if (priceHistory.length === 0) {
    return { ma3: null, ma7: null, ma24h: null };
  }

  const now = Date.now();
  const prices3h: number[] = [];
  const prices7h: number[] = [];
  const prices24h: number[] = [];

  for (const data of priceHistory) {
    const hoursAgo = (now - data.timestamp.getTime()) / (1000 * 60 * 60);

    if (hoursAgo <= 3) {
      prices3h.push(data.price);
    }
    if (hoursAgo <= 7) {
      prices7h.push(data.price);
    }
    if (hoursAgo <= 24) {
      prices24h.push(data.price);
    }
  }

  const calculateMA = (prices: number[]) => {
    if (prices.length === 0) return null;
    return prices.reduce((sum, p) => sum + p, 0) / prices.length;
  };

  return {
    ma3: calculateMA(prices3h),
    ma7: calculateMA(prices7h),
    ma24h: calculateMA(prices24h)
  };
}

/**
 * Generate price alert messages
 */
export function generatePriceAlerts(analysis: PriceChangeAnalysis): string[] {
  const alerts: string[] = [];
  const absPercent = Math.abs(analysis.priceChangePercent);

  if (absPercent > 50) {
    alerts.push(
      `⚠️ EXTREME PRICE MOVEMENT: ${analysis.priceChangePercent.toFixed(
        2
      )}% in ${analysis.timeDiff.toFixed(1)} hours!`
    );
  } else if (absPercent > 30) {
    alerts.push(
      `🔔 Significant price ${
        analysis.isIncrease ? "surge" : "drop"
      }: ${analysis.priceChangePercent.toFixed(2)}%`
    );
  } else if (absPercent > 20) {
    alerts.push(
      `📢 Notable price ${
        analysis.isIncrease ? "increase" : "decrease"
      }: ${analysis.priceChangePercent.toFixed(2)}%`
    );
  }

  // Add velocity alert if change is rapid
  const changePerHour =
    Math.abs(analysis.priceChangePercent) / analysis.timeDiff;
  if (changePerHour > 10) {
    alerts.push(
      `⚡ Rapid price movement: ${changePerHour.toFixed(2)}% per hour`
    );
  }

  return alerts;
}

/**
 * Format price change for display
 */
export function formatPriceChange(
  analysis: PriceChangeAnalysis,
  includeEmoji: boolean = true
): string {
  const sign = analysis.isIncrease ? "+" : "";
  const emoji = includeEmoji ? ` ${analysis.trendEmoji}` : "";

  return `${sign}${analysis.priceChangePercent.toFixed(2)}%${emoji}`;
}

/**
 * Generate price trend summary
 */
export function generatePriceTrendSummary(
  currentAnalysis: PriceChangeAnalysis,
  priceHistory: PreviousPriceData[],
  movingAverages: ReturnType<typeof calculateMovingAverages>
): string {
  let summary = "";

  // Current trend
  summary += `## Price Trend Analysis\n\n`;
  summary += `### Current Status: ${
    currentAnalysis.trendEmoji
  } ${currentAnalysis.trend.toUpperCase()}\n\n`;

  // Price change details
  summary += `| Metric | Value |\n`;
  summary += `|--------|-------|\n`;
  summary += `| Previous Price | ${currentAnalysis.previousPrice.toFixed(
    6
  )} FRAGME/SOL |\n`;
  summary += `| Current Price | ${currentAnalysis.currentPrice.toFixed(
    6
  )} FRAGME/SOL |\n`;
  summary += `| Change | ${formatPriceChange(currentAnalysis)} |\n`;
  summary += `| Time Period | ${currentAnalysis.timeDiff.toFixed(1)} hours |\n`;

  // Moving averages if available
  if (movingAverages.ma3 || movingAverages.ma7 || movingAverages.ma24h) {
    summary += `\n### Moving Averages\n\n`;
    summary += `| Period | Average Price | vs Current |\n`;
    summary += `|--------|--------------|------------|\n`;

    if (movingAverages.ma3) {
      const diff =
        ((currentAnalysis.currentPrice - movingAverages.ma3) /
          movingAverages.ma3) *
        100;
      summary += `| 3 Hour | ${movingAverages.ma3.toFixed(6)} | ${
        diff > 0 ? "+" : ""
      }${diff.toFixed(2)}% |\n`;
    }
    if (movingAverages.ma7) {
      const diff =
        ((currentAnalysis.currentPrice - movingAverages.ma7) /
          movingAverages.ma7) *
        100;
      summary += `| 7 Hour | ${movingAverages.ma7.toFixed(6)} | ${
        diff > 0 ? "+" : ""
      }${diff.toFixed(2)}% |\n`;
    }
    if (movingAverages.ma24h) {
      const diff =
        ((currentAnalysis.currentPrice - movingAverages.ma24h) /
          movingAverages.ma24h) *
        100;
      summary += `| 24 Hour | ${movingAverages.ma24h.toFixed(6)} | ${
        diff > 0 ? "+" : ""
      }${diff.toFixed(2)}% |\n`;
    }
  }

  // Historical volatility
  if (priceHistory.length > 1) {
    const prices = priceHistory.map((p) => p.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const volatility = ((maxPrice - minPrice) / minPrice) * 100;

    summary += `\n### Recent Volatility\n\n`;
    summary += `| Metric | Value |\n`;
    summary += `|--------|-------|\n`;
    summary += `| Highest Price | ${maxPrice.toFixed(6)} FRAGME/SOL |\n`;
    summary += `| Lowest Price | ${minPrice.toFixed(6)} FRAGME/SOL |\n`;
    summary += `| Price Range | ${volatility.toFixed(2)}% |\n`;
  }

  return summary;
}
