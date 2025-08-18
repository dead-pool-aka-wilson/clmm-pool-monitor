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
exports.fetchSOLPriceFromCoinGecko = fetchSOLPriceFromCoinGecko;
exports.fetchSOLPriceFromJupiter = fetchSOLPriceFromJupiter;
exports.fetchSOLPrice = fetchSOLPrice;
exports.calculateUSDPrices = calculateUSDPrices;
exports.formatUSDPrice = formatUSDPrice;
const axios_1 = __importDefault(require("axios"));
/**
 * Fetch SOL price from CoinGecko API (free tier)
 */
function fetchSOLPriceFromCoinGecko() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get("https://api.coingecko.com/api/v3/simple/price", {
                params: {
                    ids: "solana",
                    vs_currencies: "usd"
                }
            });
            if (response.data && response.data.solana && response.data.solana.usd) {
                return response.data.solana.usd;
            }
            throw new Error("Invalid response from CoinGecko");
        }
        catch (error) {
            console.error("Error fetching SOL price from CoinGecko:", error);
            throw error;
        }
    });
}
/**
 * Fetch SOL price from Jupiter Price API (Solana native)
 */
function fetchSOLPriceFromJupiter() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // SOL mint address
            const SOL_MINT = "So11111111111111111111111111111111111111112";
            const response = yield axios_1.default.get(`https://price.jup.ag/v4/price?ids=${SOL_MINT}`);
            if (response.data && response.data.data && response.data.data[SOL_MINT]) {
                return response.data.data[SOL_MINT].price;
            }
            throw new Error("Invalid response from Jupiter");
        }
        catch (error) {
            console.error("Error fetching SOL price from Jupiter:", error);
            throw error;
        }
    });
}
/**
 * Fetch SOL price with fallback sources
 */
function fetchSOLPrice() {
    return __awaiter(this, void 0, void 0, function* () {
        let solPrice = null;
        let source = "";
        // Try CoinGecko first
        try {
            solPrice = yield fetchSOLPriceFromCoinGecko();
            source = "CoinGecko";
            console.log(`✅ SOL price fetched from CoinGecko: $${solPrice}`);
        }
        catch (error) {
            console.log("⚠️ CoinGecko failed, trying Jupiter...");
            // Fallback to Jupiter
            try {
                solPrice = yield fetchSOLPriceFromJupiter();
                source = "Jupiter";
                console.log(`✅ SOL price fetched from Jupiter: $${solPrice}`);
            }
            catch (jupiterError) {
                console.log("⚠️ Jupiter failed, using default price...");
                // Final fallback - use a default/cached price
                solPrice = 100; // Default price if APIs fail
                source = "Default (API unavailable)";
                console.log(`⚠️ Using default SOL price: $${solPrice}`);
            }
        }
        return {
            solPriceUSD: solPrice,
            timestamp: new Date(),
            source
        };
    });
}
/**
 * Calculate all USD prices
 */
function calculateUSDPrices(fragmePerSol, solPriceUSD) {
    // Convert string to number if needed
    const fragmePerSolNum = typeof fragmePerSol === "string" ? parseFloat(fragmePerSol) : fragmePerSol;
    // Calculate FRAGME price in USD
    // If 1 SOL = X FRAGME, then 1 FRAGME = 1/X SOL
    // So FRAGME price in USD = (1/X) * SOL price in USD
    const fragmePriceUSD = solPriceUSD / fragmePerSolNum;
    return {
        solPriceUSD,
        fragmePerSol: fragmePerSolNum,
        fragmePriceUSD,
        priceSource: "Calculated",
        calculatedAt: new Date()
    };
}
/**
 * Format USD price for display
 */
function formatUSDPrice(price) {
    if (price >= 1) {
        return `$${price.toFixed(2)}`;
    }
    else if (price >= 0.01) {
        return `$${price.toFixed(4)}`;
    }
    else if (price >= 0.0001) {
        return `$${price.toFixed(6)}`;
    }
    else {
        return `$${price.toExponential(4)}`;
    }
}
