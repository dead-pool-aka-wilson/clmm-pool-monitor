"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tickToSqrtPriceX64 = tickToSqrtPriceX64;
exports.sqrtPriceX64ToTick = sqrtPriceX64ToTick;
exports.sqrtPriceX64ToPrice = sqrtPriceX64ToPrice;
exports.tickToPrice = tickToPrice;
exports.tickRangeToPriceRange = tickRangeToPriceRange;
exports.formatPrice = formatPrice;
exports.displayPriceRange = displayPriceRange;
exports.analyzeLiquidityDistribution = analyzeLiquidityDistribution;
const bn_js_1 = __importDefault(require("bn.js"));
const bnUtils_1 = require("./bnUtils");
// Constants for calculations
const Q64 = new bn_js_1.default(2).pow(new bn_js_1.default(64));
const Q96 = new bn_js_1.default(2).pow(new bn_js_1.default(96));
const TICK_BASE = 1.0001; // This remains as float for tick calculations
/**
 * Convert tick to sqrt price X64 using BN
 */
function tickToSqrtPriceX64(tick) {
    // For tick to sqrt price, we still need to use Math for the power calculation
    // But we convert to BN immediately after
    const sqrtPrice = Math.pow(TICK_BASE, tick / 2);
    // Convert to X64 format (multiply by 2^64)
    const sqrtPriceScaled = sqrtPrice * Math.pow(2, 64);
    // Convert to string without scientific notation
    // Use BigInt to handle large numbers, then convert to BN
    if (!isFinite(sqrtPriceScaled)) {
        throw new Error(`Invalid sqrtPriceScaled for tick ${tick}`);
    }
    // Use BigInt for intermediate conversion to avoid scientific notation
    try {
        const bigIntValue = BigInt(Math.floor(sqrtPriceScaled));
        return new bn_js_1.default(bigIntValue.toString());
    }
    catch (e) {
        // Fallback for edge cases
        const str = Math.floor(sqrtPriceScaled).toLocaleString("fullwide", {
            useGrouping: false
        });
        return new bn_js_1.default(str);
    }
}
/**
 * Convert sqrt price X64 to tick
 */
function sqrtPriceX64ToTick(sqrtPriceX64) {
    // Convert from X64 to regular number for logarithm calculation
    const sqrtPrice = parseFloat((0, bnUtils_1.divBNToString)(sqrtPriceX64, Q64, 18));
    const tick = Math.floor(Math.log(sqrtPrice * sqrtPrice) / Math.log(TICK_BASE));
    return tick;
}
/**
 * Convert sqrt price X64 to actual price using BN
 */
function sqrtPriceX64ToPrice(sqrtPriceX64, decimals0, decimals1) {
    // Handle zero case
    if (sqrtPriceX64.isZero()) {
        return "0";
    }
    // Square the sqrt price: (sqrtPrice)^2
    // Since sqrtPriceX64 is scaled by 2^64, squaring it gives us price scaled by 2^128
    const priceX128 = sqrtPriceX64.mul(sqrtPriceX64);
    // Divide by 2^128 to get the actual price ratio
    const scale128 = new bn_js_1.default(2).pow(new bn_js_1.default(128));
    // Adjust for decimal differences
    const decimalDiff = decimals1 - decimals0;
    let adjustedPrice;
    if (decimalDiff === 0) {
        // No adjustment needed
        adjustedPrice = priceX128;
    }
    else if (decimalDiff > 0) {
        // Token1 has more decimals, multiply by 10^diff
        const adjustment = new bn_js_1.default(10).pow(new bn_js_1.default(decimalDiff));
        adjustedPrice = priceX128.mul(adjustment);
    }
    else {
        // Token0 has more decimals, divide by 10^(-diff)
        const adjustment = new bn_js_1.default(10).pow(new bn_js_1.default(Math.abs(decimalDiff)));
        adjustedPrice = priceX128.div(adjustment);
    }
    // Convert to decimal string
    // We use 18 decimals for internal precision
    const result = (0, bnUtils_1.divBNToString)(adjustedPrice, scale128, 18);
    // Clean up trailing zeros
    const cleaned = result.replace(/\.?0+$/, "");
    return cleaned || "0";
}
/**
 * Convert tick to actual price using BN
 * Returns price as string to maintain precision
 */
function tickToPrice(tick, decimals0, decimals1) {
    // Handle edge cases
    if (tick === 0) {
        const decimalAdjustment = decimals1 - decimals0;
        if (decimalAdjustment === 0)
            return "1";
        return Math.pow(10, decimalAdjustment).toString();
    }
    try {
        const sqrtPriceX64 = tickToSqrtPriceX64(tick);
        return sqrtPriceX64ToPrice(sqrtPriceX64, decimals0, decimals1);
    }
    catch (e) {
        // Fallback: use direct calculation for problematic ticks
        const price = Math.pow(TICK_BASE, tick);
        const decimalAdjustment = Math.pow(10, decimals1 - decimals0);
        const adjustedPrice = price * decimalAdjustment;
        return adjustedPrice.toString();
    }
}
/**
 * Convert tick range to price range using BN
 */
function tickRangeToPriceRange(tickLower, tickUpper, decimals0, decimals1, currentTick, currentSqrtPriceX64) {
    const priceLower = tickToPrice(tickLower, decimals0, decimals1);
    const priceUpper = tickToPrice(tickUpper, decimals0, decimals1);
    const result = {
        tickLower,
        tickUpper,
        priceLower,
        priceUpper
    };
    if (currentTick !== undefined) {
        result.isActive = currentTick >= tickLower && currentTick < tickUpper;
    }
    if (currentSqrtPriceX64) {
        result.currentPrice = sqrtPriceX64ToPrice(currentSqrtPriceX64, decimals0, decimals1);
    }
    return result;
}
/**
 * Format price string for display
 */
function formatPrice(priceString, options) {
    const { maxDecimals = 6, minDecimals = 2, useScientific = true } = options || {};
    const price = parseFloat(priceString);
    if (price === 0)
        return "0";
    // Very small numbers
    if (price < 0.000001 && useScientific) {
        return price.toExponential(maxDecimals - 1);
    }
    // Small numbers
    if (price < 1) {
        const decimals = Math.min(maxDecimals, Math.max(minDecimals, -Math.floor(Math.log10(price)) + 2));
        return price.toFixed(decimals).replace(/\.?0+$/, "");
    }
    // Normal numbers
    if (price < 1000) {
        return price.toFixed(Math.min(maxDecimals, 4)).replace(/\.?0+$/, "");
    }
    // Large numbers with commas
    return price.toLocaleString("en-US", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: Math.min(maxDecimals, 2)
    });
}
/**
 * Display price range information
 */
function displayPriceRange(range, token0Symbol = "SOL", token1Symbol = "FRAGME") {
    const status = range.isActive ? "✅ Active" : "❌ Inactive";
    const currentPriceStr = range.currentPrice
        ? `\n   Current Price: ${formatPrice(range.currentPrice)} ${token1Symbol}/${token0Symbol}`
        : "";
    return `
   Tick Range: [${range.tickLower}, ${range.tickUpper}]
   Price Range: [${formatPrice(range.priceLower)}, ${formatPrice(range.priceUpper)}] ${token1Symbol}/${token0Symbol}${currentPriceStr}
   Status: ${status}`;
}
/**
 * Analyze liquidity distribution using BN
 */
function analyzeLiquidityDistribution(positions, decimals0, decimals1, currentTick, currentSqrtPriceX64) {
    let totalLiquidity = new bn_js_1.default(0);
    let activeLiquidity = new bn_js_1.default(0);
    let inactiveLiquidity = new bn_js_1.default(0);
    const distributions = [];
    // Calculate total liquidity first
    positions.forEach((pos) => {
        totalLiquidity = totalLiquidity.add(pos.liquidity);
    });
    // Calculate distributions
    positions.forEach((pos) => {
        const priceRange = tickRangeToPriceRange(pos.tickLowerIndex, pos.tickUpperIndex, decimals0, decimals1, currentTick, currentSqrtPriceX64);
        // Calculate percentage using BN
        const percentage = totalLiquidity.isZero()
            ? "0"
            : calculatePercentageBN(pos.liquidity, totalLiquidity);
        distributions.push({
            priceRange,
            liquidity: pos.liquidity,
            liquidityString: pos.liquidity.toString(),
            percentage
        });
        if (priceRange.isActive) {
            activeLiquidity = activeLiquidity.add(pos.liquidity);
        }
        else {
            inactiveLiquidity = inactiveLiquidity.add(pos.liquidity);
        }
    });
    // Sort by liquidity (highest first)
    distributions.sort((a, b) => b.liquidity.cmp(a.liquidity));
    // Calculate percentages
    const activePercentage = totalLiquidity.isZero()
        ? "0"
        : calculatePercentageBN(activeLiquidity, totalLiquidity);
    const inactivePercentage = totalLiquidity.isZero()
        ? "0"
        : calculatePercentageBN(inactiveLiquidity, totalLiquidity);
    return {
        distributions,
        totalLiquidity,
        totalLiquidityString: totalLiquidity.toString(),
        activeLiquidity,
        activeLiquidityString: activeLiquidity.toString(),
        inactiveLiquidity,
        inactiveLiquidityString: inactiveLiquidity.toString(),
        activePercentage,
        inactivePercentage
    };
}
/**
 * Calculate percentage with BN
 */
function calculatePercentageBN(part, total, decimals = 2) {
    if (total.isZero())
        return "0";
    // Multiply by 100 * 10^decimals for precision
    const scale = new bn_js_1.default(100).mul(new bn_js_1.default(10).pow(new bn_js_1.default(decimals)));
    const scaled = part.mul(scale).div(total);
    return (0, bnUtils_1.addDecimalPoint)(scaled, decimals);
}
