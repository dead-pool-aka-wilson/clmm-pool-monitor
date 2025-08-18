"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeBN = void 0;
exports.addDecimalPoint = addDecimalPoint;
exports.stringToBN = stringToBN;
exports.formatBN = formatBN;
exports.mulBNByFloat = mulBNByFloat;
exports.divBNToString = divBNToString;
exports.calculatePercentage = calculatePercentage;
exports.compareBNWithDecimals = compareBNWithDecimals;
const bn_js_1 = __importDefault(require("bn.js"));
/**
 * String manipulation for decimals
 * Adds decimal point to a string number based on decimals
 */
function addDecimalPoint(value, decimals) {
    const str = value.toString();
    if (decimals === 0)
        return str;
    // Pad with zeros if needed
    const padded = str.padStart(decimals + 1, "0");
    // Insert decimal point
    const beforeDecimal = padded.slice(0, -decimals) || "0";
    const afterDecimal = padded.slice(-decimals);
    // Remove trailing zeros after decimal
    const trimmed = afterDecimal.replace(/0+$/, "");
    if (trimmed === "") {
        return beforeDecimal;
    }
    return `${beforeDecimal}.${trimmed}`;
}
/**
 * Remove decimal point and convert to BN
 * "123.456" with 9 decimals -> BN("123456000000")
 */
function stringToBN(value, decimals) {
    const [whole, fraction = ""] = value.split(".");
    // Pad or trim fraction to match decimals
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    // Combine and convert to BN
    const combined = whole + paddedFraction;
    return new bn_js_1.default(combined);
}
/**
 * Format BN with commas and decimals
 */
function formatBN(value, decimals, options) {
    const { commaSeparator = false, maxDecimals = decimals, minDecimals = 0 } = options || {};
    // Convert BN to string with decimal point
    let result = addDecimalPoint(value, decimals);
    // Handle decimal places
    const [whole, fraction = ""] = result.split(".");
    // Apply min/max decimals
    let finalFraction = fraction;
    if (fraction.length > maxDecimals) {
        finalFraction = fraction.slice(0, maxDecimals);
    }
    else if (fraction.length < minDecimals) {
        finalFraction = fraction.padEnd(minDecimals, "0");
    }
    // Add comma separators if requested
    let finalWhole = whole;
    if (commaSeparator) {
        finalWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    if (finalFraction) {
        return `${finalWhole}.${finalFraction}`;
    }
    return finalWhole;
}
/**
 * Multiply BN by a decimal number safely
 * Uses precision multiplier to avoid floating point errors
 */
function mulBNByFloat(bn, multiplier, precision = 6) {
    const precisionBN = new bn_js_1.default(10).pow(new bn_js_1.default(precision));
    const multiplierBN = new bn_js_1.default(Math.floor(multiplier * Math.pow(10, precision)));
    return bn.mul(multiplierBN).div(precisionBN);
}
/**
 * Divide two BNs and get decimal result as string
 */
function divBNToString(numerator, denominator, decimals) {
    if (denominator.isZero())
        return "0";
    // Scale up numerator for precision
    const scaled = numerator.mul(new bn_js_1.default(10).pow(new bn_js_1.default(decimals)));
    const result = scaled.div(denominator);
    return addDecimalPoint(result, decimals);
}
/**
 * Calculate percentage between two BNs
 */
function calculatePercentage(part, total, precision = 2) {
    if (total.isZero())
        return "0";
    const hundred = new bn_js_1.default(100);
    const precisionBN = new bn_js_1.default(10).pow(new bn_js_1.default(precision));
    const percentage = part.mul(hundred).mul(precisionBN).div(total);
    return addDecimalPoint(percentage, precision);
}
/**
 * Compare two BNs considering decimals
 */
function compareBNWithDecimals(a, aDecimals, b, bDecimals) {
    // Normalize to same decimals
    const maxDecimals = Math.max(aDecimals, bDecimals);
    const aNormalized = a.mul(new bn_js_1.default(10).pow(new bn_js_1.default(maxDecimals - aDecimals)));
    const bNormalized = b.mul(new bn_js_1.default(10).pow(new bn_js_1.default(maxDecimals - bDecimals)));
    return aNormalized.cmp(bNormalized);
}
/**
 * Safe BN operations with overflow checking
 */
class SafeBN {
    static add(a, b) {
        const result = a.add(b);
        if (result.lt(a) && b.gt(new bn_js_1.default(0))) {
            throw new Error("BN addition overflow");
        }
        return result;
    }
    static sub(a, b) {
        if (a.lt(b)) {
            throw new Error("BN subtraction underflow");
        }
        return a.sub(b);
    }
    static mul(a, b) {
        if (a.isZero() || b.isZero())
            return new bn_js_1.default(0);
        const result = a.mul(b);
        if (!result.div(a).eq(b)) {
            throw new Error("BN multiplication overflow");
        }
        return result;
    }
    static div(a, b) {
        if (b.isZero()) {
            throw new Error("Division by zero");
        }
        return a.div(b);
    }
}
exports.SafeBN = SafeBN;
