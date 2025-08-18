import axios from "axios";

export interface PriceData {
  solPriceUSD: number;
  timestamp: Date;
  source: string;
}

/**
 * Fetch SOL price from CoinGecko API (free tier)
 */
export async function fetchSOLPriceFromCoinGecko(): Promise<number> {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: "solana",
          vs_currencies: "usd"
        }
      }
    );

    if (response.data && response.data.solana && response.data.solana.usd) {
      return response.data.solana.usd;
    }

    throw new Error("Invalid response from CoinGecko");
  } catch (error) {
    console.error("Error fetching SOL price from CoinGecko:", error);
    throw error;
  }
}

/**
 * Fetch SOL price from Jupiter Price API (Solana native)
 */
export async function fetchSOLPriceFromJupiter(): Promise<number> {
  try {
    // SOL mint address
    const SOL_MINT = "So11111111111111111111111111111111111111112";

    const response = await axios.get(
      `https://price.jup.ag/v4/price?ids=${SOL_MINT}`
    );

    if (response.data && response.data.data && response.data.data[SOL_MINT]) {
      return response.data.data[SOL_MINT].price;
    }

    throw new Error("Invalid response from Jupiter");
  } catch (error) {
    console.error("Error fetching SOL price from Jupiter:", error);
    throw error;
  }
}

/**
 * Fetch SOL price with fallback sources
 */
export async function fetchSOLPrice(): Promise<PriceData> {
  let solPrice: number | null = null;
  let source = "";

  // Try CoinGecko first
  try {
    solPrice = await fetchSOLPriceFromCoinGecko();
    source = "CoinGecko";
    console.log(`✅ SOL price fetched from CoinGecko: $${solPrice}`);
  } catch (error) {
    console.log("⚠️ CoinGecko failed, trying Jupiter...");

    // Fallback to Jupiter
    try {
      solPrice = await fetchSOLPriceFromJupiter();
      source = "Jupiter";
      console.log(`✅ SOL price fetched from Jupiter: $${solPrice}`);
    } catch (jupiterError) {
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
}

/**
 * Calculate USD prices for FRAGME/SOL pair
 */
export interface TokenPricesUSD {
  solPriceUSD: number;
  fragmePerSol: number; // FRAGME/SOL price
  fragmePriceUSD: number; // FRAGME price in USD
  priceSource: string;
  calculatedAt: Date;
}

/**
 * Calculate all USD prices
 */
export function calculateUSDPrices(
  fragmePerSol: number | string,
  solPriceUSD: number
): TokenPricesUSD {
  // Convert string to number if needed
  const fragmePerSolNum =
    typeof fragmePerSol === "string" ? parseFloat(fragmePerSol) : fragmePerSol;

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
export function formatUSDPrice(price: number): string {
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  } else if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  } else if (price >= 0.0001) {
    return `$${price.toFixed(6)}`;
  } else {
    return `$${price.toExponential(4)}`;
  }
}
