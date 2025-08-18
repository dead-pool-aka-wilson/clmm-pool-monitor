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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLatestPriceFromNotion = fetchLatestPriceFromNotion;
exports.fetchRecentPriceHistory = fetchRecentPriceHistory;
exports.analyzePriceChange = analyzePriceChange;
exports.calculateMovingAverages = calculateMovingAverages;
exports.generatePriceAlerts = generatePriceAlerts;
exports.formatPriceChange = formatPriceChange;
exports.generatePriceTrendSummary = generatePriceTrendSummary;
const client_1 = require("@notionhq/client");
/**
 * Fetch the most recent price data from Notion database
 */
function fetchLatestPriceFromNotion(apiKey, databaseId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        try {
            const notion = new client_1.Client({ auth: apiKey });
            // Query database for the most recent entry
            const response = yield notion.databases.query({
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
            const latestPage = response.results[0];
            // Extract properties
            const dateProperty = (_b = (_a = latestPage.properties["Date"]) === null || _a === void 0 ? void 0 : _a.date) === null || _b === void 0 ? void 0 : _b.start;
            const priceProperty = (_f = (_e = (_d = (_c = latestPage.properties["Current Price"]) === null || _c === void 0 ? void 0 : _c.rich_text) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) === null || _f === void 0 ? void 0 : _f.content;
            const tvlProperty = (_k = (_j = (_h = (_g = latestPage.properties["TVL"]) === null || _g === void 0 ? void 0 : _g.rich_text) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.text) === null || _k === void 0 ? void 0 : _k.content;
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
        }
        catch (error) {
            console.error("❌ Error fetching previous data from Notion:", error);
            return null;
        }
    });
}
/**
 * Fetch multiple recent price entries for trend analysis
 */
function fetchRecentPriceHistory(apiKey_1, databaseId_1) {
    return __awaiter(this, arguments, void 0, function* (apiKey, databaseId, limit = 10) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        try {
            const notion = new client_1.Client({ auth: apiKey });
            const response = yield notion.databases.query({
                database_id: databaseId,
                sorts: [
                    {
                        property: "Date",
                        direction: "descending"
                    }
                ],
                page_size: limit
            });
            const priceHistory = [];
            for (const page of response.results) {
                const pageData = page;
                const dateProperty = (_b = (_a = pageData.properties["Date"]) === null || _a === void 0 ? void 0 : _a.date) === null || _b === void 0 ? void 0 : _b.start;
                const priceProperty = (_f = (_e = (_d = (_c = pageData.properties["Current Price"]) === null || _c === void 0 ? void 0 : _c.rich_text) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) === null || _f === void 0 ? void 0 : _f.content;
                const tvlProperty = (_k = (_j = (_h = (_g = pageData.properties["TVL"]) === null || _g === void 0 ? void 0 : _g.rich_text) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.text) === null || _k === void 0 ? void 0 : _k.content;
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
        }
        catch (error) {
            console.error("❌ Error fetching price history from Notion:", error);
            return [];
        }
    });
}
/**
 * Analyze price change between two data points
 */
function analyzePriceChange(previousData, currentPrice) {
    // Convert current price to number if string
    const currentPriceNum = typeof currentPrice === "string" ? parseFloat(currentPrice) : currentPrice;
    const priceChange = currentPriceNum - previousData.price;
    const priceChangePercent = (priceChange / previousData.price) * 100;
    // Calculate time difference in hours
    const timeDiff = (Date.now() - previousData.timestamp.getTime()) / (1000 * 60 * 60);
    // Determine trend based on percentage change
    let trend;
    let trendEmoji;
    const absPercent = Math.abs(priceChangePercent);
    if (priceChangePercent > 20) {
        trend = "surge";
        trendEmoji = "🚀";
    }
    else if (priceChangePercent > 5) {
        trend = "rise";
        trendEmoji = "📈";
    }
    else if (priceChangePercent > -5) {
        trend = "stable";
        trendEmoji = "➡️";
    }
    else if (priceChangePercent > -20) {
        trend = "fall";
        trendEmoji = "📉";
    }
    else {
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
function calculateMovingAverages(priceHistory) {
    if (priceHistory.length === 0) {
        return { ma3: null, ma7: null, ma24h: null };
    }
    const now = Date.now();
    const prices3h = [];
    const prices7h = [];
    const prices24h = [];
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
    const calculateMA = (prices) => {
        if (prices.length === 0)
            return null;
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
function generatePriceAlerts(analysis) {
    const alerts = [];
    const absPercent = Math.abs(analysis.priceChangePercent);
    if (absPercent > 50) {
        alerts.push(`⚠️ EXTREME PRICE MOVEMENT: ${analysis.priceChangePercent.toFixed(2)}% in ${analysis.timeDiff.toFixed(1)} hours!`);
    }
    else if (absPercent > 30) {
        alerts.push(`🔔 Significant price ${analysis.isIncrease ? "surge" : "drop"}: ${analysis.priceChangePercent.toFixed(2)}%`);
    }
    else if (absPercent > 20) {
        alerts.push(`📢 Notable price ${analysis.isIncrease ? "increase" : "decrease"}: ${analysis.priceChangePercent.toFixed(2)}%`);
    }
    // Add velocity alert if change is rapid
    const changePerHour = Math.abs(analysis.priceChangePercent) / analysis.timeDiff;
    if (changePerHour > 10) {
        alerts.push(`⚡ Rapid price movement: ${changePerHour.toFixed(2)}% per hour`);
    }
    return alerts;
}
/**
 * Format price change for display
 */
function formatPriceChange(analysis, includeEmoji = true) {
    const sign = analysis.isIncrease ? "+" : "";
    const emoji = includeEmoji ? ` ${analysis.trendEmoji}` : "";
    return `${sign}${analysis.priceChangePercent.toFixed(2)}%${emoji}`;
}
/**
 * Generate price trend summary
 */
function generatePriceTrendSummary(currentAnalysis, priceHistory, movingAverages) {
    let summary = "";
    // Current trend
    summary += `## Price Trend Analysis\n\n`;
    summary += `### Current Status: ${currentAnalysis.trendEmoji} ${currentAnalysis.trend.toUpperCase()}\n\n`;
    // Price change details
    summary += `| Metric | Value |\n`;
    summary += `|--------|-------|\n`;
    summary += `| Previous Price | ${currentAnalysis.previousPrice.toFixed(6)} FRAGME/SOL |\n`;
    summary += `| Current Price | ${currentAnalysis.currentPrice.toFixed(6)} FRAGME/SOL |\n`;
    summary += `| Change | ${formatPriceChange(currentAnalysis)} |\n`;
    summary += `| Time Period | ${currentAnalysis.timeDiff.toFixed(1)} hours |\n`;
    // Moving averages if available
    if (movingAverages.ma3 || movingAverages.ma7 || movingAverages.ma24h) {
        summary += `\n### Moving Averages\n\n`;
        summary += `| Period | Average Price | vs Current |\n`;
        summary += `|--------|--------------|------------|\n`;
        if (movingAverages.ma3) {
            const diff = ((currentAnalysis.currentPrice - movingAverages.ma3) /
                movingAverages.ma3) *
                100;
            summary += `| 3 Hour | ${movingAverages.ma3.toFixed(6)} | ${diff > 0 ? "+" : ""}${diff.toFixed(2)}% |\n`;
        }
        if (movingAverages.ma7) {
            const diff = ((currentAnalysis.currentPrice - movingAverages.ma7) /
                movingAverages.ma7) *
                100;
            summary += `| 7 Hour | ${movingAverages.ma7.toFixed(6)} | ${diff > 0 ? "+" : ""}${diff.toFixed(2)}% |\n`;
        }
        if (movingAverages.ma24h) {
            const diff = ((currentAnalysis.currentPrice - movingAverages.ma24h) /
                movingAverages.ma24h) *
                100;
            summary += `| 24 Hour | ${movingAverages.ma24h.toFixed(6)} | ${diff > 0 ? "+" : ""}${diff.toFixed(2)}% |\n`;
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
