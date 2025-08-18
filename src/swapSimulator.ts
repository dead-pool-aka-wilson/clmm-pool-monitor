import BN from "bn.js";
import { PersonalPosition } from "./fetchPositions";
import { PoolInfo } from "./fetchPool";
import { addDecimalPoint, formatBN } from "./bnUtils";

// Constants
const Q64 = new BN(2).pow(new BN(64));
const Q128 = new BN(2).pow(new BN(128));
const FEE_RATE = 2000; // 0.2% = 2000/1000000
const FEE_DENOMINATOR = 1000000;

export interface TickLiquidity {
  tick: number;
  liquidityNet: BN; // Change in liquidity at this tick
  liquidityGross: BN; // Total liquidity referencing this tick
}

export interface SwapSimulationResult {
  amountIn: BN;
  amountOut: BN;
  priceImpact: number; // Percentage
  slippage: number; // Percentage
  finalPrice: BN; // Final sqrt price X64
  finalTick: number;
  crossedTicks: number;
  averagePrice: number;
  executionPrice: number;
  direction: "token0ToToken1" | "token1ToToken0";
}

export interface SlippageAnalysis {
  direction: "SOL → FRAGME" | "FRAGME → SOL";
  swapSizes: SwapSizeAnalysis[];
}

export interface SwapSizeAnalysis {
  inputAmount: BN;
  inputAmountFormatted: string;
  outputAmount: BN;
  outputAmountFormatted: string;
  slippage: number;
  priceImpact: number;
  executionPrice: number;
  averagePrice: number;
  crossedTicks: number;
}

/**
 * Build tick liquidity map from positions
 */
export function buildTickLiquidityMap(
  positions: PersonalPosition[]
): Map<number, TickLiquidity> {
  const tickMap = new Map<number, TickLiquidity>();

  positions.forEach((pos) => {
    // Add liquidity at lower tick
    const lowerTick = tickMap.get(pos.tickLowerIndex) || {
      tick: pos.tickLowerIndex,
      liquidityNet: new BN(0),
      liquidityGross: new BN(0)
    };
    lowerTick.liquidityNet = lowerTick.liquidityNet.add(pos.liquidity);
    lowerTick.liquidityGross = lowerTick.liquidityGross.add(pos.liquidity);
    tickMap.set(pos.tickLowerIndex, lowerTick);

    // Remove liquidity at upper tick
    const upperTick = tickMap.get(pos.tickUpperIndex) || {
      tick: pos.tickUpperIndex,
      liquidityNet: new BN(0),
      liquidityGross: new BN(0)
    };
    upperTick.liquidityNet = upperTick.liquidityNet.sub(pos.liquidity);
    upperTick.liquidityGross = upperTick.liquidityGross.add(pos.liquidity);
    tickMap.set(pos.tickUpperIndex, upperTick);
  });

  return tickMap;
}

/**
 * Get next initialized tick in direction
 */
function getNextTick(
  tickMap: Map<number, TickLiquidity>,
  currentTick: number,
  direction: boolean, // true = up, false = down
  tickSpacing: number
): number | null {
  const sortedTicks = Array.from(tickMap.keys()).sort((a, b) => a - b);

  if (direction) {
    // Moving up (token1 -> token0)
    for (const tick of sortedTicks) {
      if (tick > currentTick) {
        return tick;
      }
    }
  } else {
    // Moving down (token0 -> token1)
    for (let i = sortedTicks.length - 1; i >= 0; i--) {
      if (sortedTicks[i] <= currentTick) {
        return sortedTicks[i];
      }
    }
  }

  return null;
}

/**
 * Calculate sqrt price from tick
 */
function tickToSqrtPriceX64(tick: number): BN {
  try {
    const sqrtPrice = Math.pow(1.0001, tick / 2);

    // Check for invalid values
    if (!isFinite(sqrtPrice) || sqrtPrice <= 0) {
      console.warn(`Invalid sqrtPrice for tick ${tick}: ${sqrtPrice}`);
      // Return a default value for edge cases
      return new BN(2).pow(new BN(64)); // Return 2^64 as default (price = 1)
    }

    // Convert to X64 format
    const sqrtPriceX64 = sqrtPrice * Math.pow(2, 64);

    // Use BigInt to avoid scientific notation
    const bigIntValue = BigInt(Math.floor(sqrtPriceX64));
    return new BN(bigIntValue.toString());
  } catch (error) {
    console.error(`Error calculating sqrt price for tick ${tick}:`, error);
    // Return default value on error
    return new BN(2).pow(new BN(64));
  }
}

/**
 * Calculate amount0 delta for liquidity and price range
 */
function getAmount0Delta(
  sqrtPriceLowerX64: BN,
  sqrtPriceUpperX64: BN,
  liquidity: BN,
  roundUp: boolean
): BN {
  if (sqrtPriceLowerX64.gt(sqrtPriceUpperX64)) {
    [sqrtPriceLowerX64, sqrtPriceUpperX64] = [
      sqrtPriceUpperX64,
      sqrtPriceLowerX64
    ];
  }

  // amount0 = liquidity * (1/sqrtPriceLower - 1/sqrtPriceUpper)
  // = liquidity * (sqrtPriceUpper - sqrtPriceLower) / (sqrtPriceLower * sqrtPriceUpper)

  const numerator = liquidity.mul(sqrtPriceUpperX64.sub(sqrtPriceLowerX64));
  const denominator = sqrtPriceLowerX64.mul(sqrtPriceUpperX64).div(Q64);

  if (denominator.isZero()) return new BN(0);

  return numerator.mul(Q64).div(denominator);
}

/**
 * Calculate amount1 delta for liquidity and price range
 */
function getAmount1Delta(
  sqrtPriceLowerX64: BN,
  sqrtPriceUpperX64: BN,
  liquidity: BN,
  roundUp: boolean
): BN {
  if (sqrtPriceLowerX64.gt(sqrtPriceUpperX64)) {
    [sqrtPriceLowerX64, sqrtPriceUpperX64] = [
      sqrtPriceUpperX64,
      sqrtPriceLowerX64
    ];
  }

  // amount1 = liquidity * (sqrtPriceUpper - sqrtPriceLower)
  return liquidity.mul(sqrtPriceUpperX64.sub(sqrtPriceLowerX64)).div(Q64);
}

/**
 * Simulate swap with specific amount
 */
export function simulateSwapExactAmount(
  pool: PoolInfo,
  positions: PersonalPosition[],
  amountIn: BN,
  direction: "token0ToToken1" | "token1ToToken0"
): SwapSimulationResult {
  try {
    const tickMap = buildTickLiquidityMap(positions);

    let currentTick = pool.currentTick;
    let currentSqrtPrice = new BN(pool.poolState.sqrtPriceX64);
    let currentLiquidity = new BN(pool.poolState.liquidity);
    const initialSqrtPrice = new BN(pool.poolState.sqrtPriceX64);

    let remainingAmountIn = new BN(amountIn);
    let totalAmountOut = new BN(0);
    let crossedTicks = 0;

    const isToken0ToToken1 = direction === "token0ToToken1";

    // Simulate swap tick by tick
    while (remainingAmountIn.gt(new BN(0))) {
      // Find next tick
      const nextTick = getNextTick(
        tickMap,
        currentTick,
        !isToken0ToToken1,
        pool.poolState.tickSpacing
      );

      if (!nextTick || currentLiquidity.isZero()) {
        break; // No more liquidity
      }

      // Protect against extreme ticks
      if (Math.abs(nextTick) > 443636) {
        break;
      }

      const targetTick = nextTick;
      const targetSqrtPrice = tickToSqrtPriceX64(targetTick);

      // Calculate max swap in this range
      let maxAmountIn: BN;
      let correspondingAmountOut: BN;

      if (isToken0ToToken1) {
        maxAmountIn = getAmount0Delta(
          targetSqrtPrice,
          currentSqrtPrice,
          currentLiquidity,
          true
        );
        correspondingAmountOut = getAmount1Delta(
          targetSqrtPrice,
          currentSqrtPrice,
          currentLiquidity,
          false
        );
      } else {
        maxAmountIn = getAmount1Delta(
          currentSqrtPrice,
          targetSqrtPrice,
          currentLiquidity,
          true
        );
        correspondingAmountOut = getAmount0Delta(
          currentSqrtPrice,
          targetSqrtPrice,
          currentLiquidity,
          false
        );
      }

      // Apply fees to max amount
      const feeAmount = maxAmountIn.muln(FEE_RATE).divn(FEE_DENOMINATOR);
      const maxAmountInAfterFee = maxAmountIn.sub(feeAmount);

      if (remainingAmountIn.gte(maxAmountInAfterFee)) {
        // Use entire tick range
        remainingAmountIn = remainingAmountIn.sub(maxAmountInAfterFee);
        totalAmountOut = totalAmountOut.add(correspondingAmountOut);

        // Update state
        currentTick = targetTick;
        currentSqrtPrice = targetSqrtPrice;
        crossedTicks++;

        // Update liquidity
        const tickData = tickMap.get(targetTick);
        if (tickData) {
          if (isToken0ToToken1) {
            currentLiquidity = currentLiquidity.sub(tickData.liquidityNet);
          } else {
            currentLiquidity = currentLiquidity.add(tickData.liquidityNet);
          }
          if (currentLiquidity.isNeg()) {
            currentLiquidity = new BN(0);
          }
        }
      } else {
        // Partial tick consumption
        const ratio = remainingAmountIn
          .mul(new BN(1000000))
          .div(maxAmountInAfterFee);
        const partialAmountOut = correspondingAmountOut
          .mul(ratio)
          .div(new BN(1000000));

        totalAmountOut = totalAmountOut.add(partialAmountOut);
        remainingAmountIn = new BN(0);

        // Update sqrt price proportionally
        const priceDiff = targetSqrtPrice.sub(currentSqrtPrice);
        const partialPriceDiff = priceDiff.mul(ratio).div(new BN(1000000));
        currentSqrtPrice = currentSqrtPrice.add(partialPriceDiff);
      }
    }

    // Calculate metrics
    const actualAmountIn = amountIn.sub(remainingAmountIn);
    const averagePrice = totalAmountOut.isZero()
      ? 0
      : parseFloat(totalAmountOut.toString()) /
        parseFloat(actualAmountIn.toString());

    const executionPrice = totalAmountOut.isZero()
      ? 0
      : isToken0ToToken1
      ? parseFloat(totalAmountOut.toString()) /
        parseFloat(actualAmountIn.toString())
      : parseFloat(actualAmountIn.toString()) /
        parseFloat(totalAmountOut.toString());

    // Calculate slippage
    const spotPrice = calculateSpotPrice(
      initialSqrtPrice,
      pool.poolState.mintDecimals0,
      pool.poolState.mintDecimals1
    );
    const slippage = calculateSlippage(
      spotPrice,
      executionPrice,
      isToken0ToToken1
    );

    const priceImpact = calculatePriceImpact(
      initialSqrtPrice,
      currentSqrtPrice,
      !isToken0ToToken1
    );

    return {
      amountIn: actualAmountIn,
      amountOut: totalAmountOut,
      priceImpact,
      slippage,
      finalPrice: currentSqrtPrice,
      finalTick: currentTick,
      crossedTicks,
      averagePrice,
      executionPrice,
      direction
    };
  } catch (error) {
    console.error(`Error in swap simulation:`, error);
    return {
      amountIn: new BN(0),
      amountOut: new BN(0),
      priceImpact: 0,
      slippage: 0,
      finalPrice: pool.poolState.sqrtPriceX64,
      finalTick: pool.currentTick,
      crossedTicks: 0,
      averagePrice: 0,
      executionPrice: 0,
      direction
    };
  }
}

/**
 * Calculate spot price from sqrt price
 */
function calculateSpotPrice(
  sqrtPriceX64: BN,
  decimals0: number,
  decimals1: number
): number {
  const sqrtPrice = parseFloat(sqrtPriceX64.toString()) / Math.pow(2, 64);
  const price = sqrtPrice * sqrtPrice;
  const decimalAdjustment = Math.pow(10, decimals1 - decimals0);
  return price * decimalAdjustment;
}

/**
 * Calculate slippage percentage
 */
function calculateSlippage(
  spotPrice: number,
  executionPrice: number,
  isToken0ToToken1: boolean
): number {
  if (spotPrice === 0 || executionPrice === 0) return 0;

  const slippage = isToken0ToToken1
    ? ((executionPrice - spotPrice) / spotPrice) * 100
    : ((spotPrice - executionPrice) / spotPrice) * 100;

  return Math.abs(slippage);
}

/**
 * Calculate price impact percentage
 */
function calculatePriceImpact(
  startSqrtPrice: BN,
  endSqrtPrice: BN,
  isIncreasing: boolean
): number {
  const startPrice = startSqrtPrice.mul(startSqrtPrice).div(Q128);
  const endPrice = endSqrtPrice.mul(endSqrtPrice).div(Q128);

  if (startPrice.isZero()) return 0;

  const priceDiff = isIncreasing
    ? endPrice.sub(startPrice)
    : startPrice.sub(endPrice);

  const impact = priceDiff.muln(10000).div(startPrice).toNumber() / 100;
  return Math.abs(impact);
}

/**
 * Analyze slippage for different swap sizes
 */
export function analyzeSlippageForSizes(
  pool: PoolInfo,
  positions: PersonalPosition[],
  direction: "token0ToToken1" | "token1ToToken0",
  swapSizes: BN[]
): SlippageAnalysis {
  const results: SwapSizeAnalysis[] = [];
  const decimalsIn =
    direction === "token0ToToken1"
      ? pool.poolState.mintDecimals0
      : pool.poolState.mintDecimals1;
  const decimalsOut =
    direction === "token0ToToken1"
      ? pool.poolState.mintDecimals1
      : pool.poolState.mintDecimals0;
  const tokenIn = direction === "token0ToToken1" ? "SOL" : "FRAGME";
  const tokenOut = direction === "token0ToToken1" ? "FRAGME" : "SOL";

  swapSizes.forEach((size) => {
    const result = simulateSwapExactAmount(pool, positions, size, direction);

    results.push({
      inputAmount: result.amountIn,
      inputAmountFormatted: `${addDecimalPoint(
        result.amountIn,
        decimalsIn
      )} ${tokenIn}`,
      outputAmount: result.amountOut,
      outputAmountFormatted: `${addDecimalPoint(
        result.amountOut,
        decimalsOut
      )} ${tokenOut}`,
      slippage: result.slippage,
      priceImpact: result.priceImpact,
      executionPrice: result.executionPrice,
      averagePrice: result.averagePrice,
      crossedTicks: result.crossedTicks
    });
  });

  return {
    direction: direction === "token0ToToken1" ? "SOL → FRAGME" : "FRAGME → SOL",
    swapSizes: results
  };
}

/**
 * Generate standard swap sizes based on pool TVL
 */
export function generateStandardSwapSizes(
  pool: PoolInfo,
  isToken0: boolean
): BN[] {
  const decimals = isToken0
    ? pool.poolState.mintDecimals0
    : pool.poolState.mintDecimals1;
  const multiplier = new BN(10).pow(new BN(decimals));

  if (isToken0) {
    // SOL amounts: 0.1, 0.5, 1, 5, 10, 50, 100, 500
    return [
      new BN(0.1 * 1e9), // 0.1 SOL
      new BN(0.5 * 1e9), // 0.5 SOL
      new BN(1 * 1e9), // 1 SOL
      new BN(5 * 1e9), // 5 SOL
      new BN(10 * 1e9), // 10 SOL
      new BN(50 * 1e9), // 50 SOL
      new BN(100 * 1e9), // 100 SOL
      new BN(500 * 1e9) // 500 SOL
    ];
  } else {
    // FRAGME amounts (assuming price ~4000 FRAGME/SOL)
    return [
      new BN(400 * 1e9), // ~0.1 SOL worth
      new BN(2000 * 1e9), // ~0.5 SOL worth
      new BN(4000 * 1e9), // ~1 SOL worth
      new BN(20000 * 1e9), // ~5 SOL worth
      new BN(40000 * 1e9), // ~10 SOL worth
      new BN(200000 * 1e9), // ~50 SOL worth
      new BN(400000 * 1e9), // ~100 SOL worth
      new BN(2000000 * 1e9) // ~500 SOL worth
    ];
  }
}

/**
 * Generate slippage analysis table for report
 */
export function generateSlippageTable(analysis: SlippageAnalysis): string {
  let table = `### ${analysis.direction}\n\n`;
  table +=
    "| Swap Size | Output | Slippage | Price Impact | Execution Price | Ticks Crossed |\n";
  table +=
    "|-----------|--------|----------|--------------|-----------------|---------------|\n";

  analysis.swapSizes.forEach((size) => {
    const slippageStr = size.slippage.toFixed(3) + "%";
    const impactStr = size.priceImpact.toFixed(3) + "%";
    const execPriceStr = size.executionPrice.toFixed(6);

    table += `| ${size.inputAmountFormatted} | ${size.outputAmountFormatted} | ${slippageStr} | ${impactStr} | ${execPriceStr} | ${size.crossedTicks} |\n`;
  });

  table += "\n";
  return table;
}

/**
 * Calculate swap amount to reach a specific tick
 */
export function calculateSwapToTick(
  currentSqrtPrice: BN,
  targetTick: number,
  currentLiquidity: BN,
  direction: "token0ToToken1" | "token1ToToken0"
): { amountIn: BN; amountOut: BN } {
  const targetSqrtPrice = tickToSqrtPriceX64(targetTick);

  if (direction === "token0ToToken1") {
    // Price decreasing
    const amount0 = getAmount0Delta(
      targetSqrtPrice,
      currentSqrtPrice,
      currentLiquidity,
      true
    );
    const amount1 = getAmount1Delta(
      targetSqrtPrice,
      currentSqrtPrice,
      currentLiquidity,
      false
    );

    // Apply fees
    const feeAmount = amount0.muln(FEE_RATE).divn(FEE_DENOMINATOR);
    const amount0AfterFee = amount0.sub(feeAmount);

    return { amountIn: amount0AfterFee, amountOut: amount1 };
  } else {
    // Price increasing
    const amount1 = getAmount1Delta(
      currentSqrtPrice,
      targetSqrtPrice,
      currentLiquidity,
      true
    );
    const amount0 = getAmount0Delta(
      currentSqrtPrice,
      targetSqrtPrice,
      currentLiquidity,
      false
    );

    // Apply fees
    const feeAmount = amount1.muln(FEE_RATE).divn(FEE_DENOMINATOR);
    const amount1AfterFee = amount1.sub(feeAmount);

    return { amountIn: amount1AfterFee, amountOut: amount0 };
  }
}

/**
 * Find liquidity change points and calculate swap amounts
 */
export interface LiquidityChangePoint {
  tick: number;
  liquidityBefore: BN;
  liquidityAfter: BN;
  liquidityChange: BN;
  cumulativeSwapAmount: BN;
  cumulativeOutput: BN;
  slippage: number;
  priceImpact: number;
  executionPrice: number;
  ticksCrossed: number;
}

/**
 * Analyze liquidity change points
 */
export function analyzeLiquidityChangePoints(
  pool: PoolInfo,
  positions: PersonalPosition[],
  direction: "token0ToToken1" | "token1ToToken0",
  maxPoints: number = 20
): LiquidityChangePoint[] {
  const tickMap = buildTickLiquidityMap(positions);
  const sortedTicks = Array.from(tickMap.keys()).sort((a, b) => a - b);

  const currentTick = pool.currentTick;
  const initialSqrtPrice = new BN(pool.poolState.sqrtPriceX64);
  const spotPrice = calculateSpotPrice(
    initialSqrtPrice,
    pool.poolState.mintDecimals0,
    pool.poolState.mintDecimals1
  );

  let currentSqrtPrice = new BN(pool.poolState.sqrtPriceX64);
  let currentLiquidity = new BN(pool.poolState.liquidity);
  let cumulativeAmountIn = new BN(0);
  let cumulativeAmountOut = new BN(0);
  let ticksCrossed = 0;

  const results: LiquidityChangePoint[] = [];
  const isIncreasingPrice = direction === "token1ToToken0";

  // Filter relevant ticks based on direction
  const relevantTicks = isIncreasingPrice
    ? sortedTicks.filter((t) => t > currentTick).slice(0, maxPoints)
    : sortedTicks
        .filter((t) => t <= currentTick)
        .reverse()
        .slice(0, maxPoints);

  if (!isIncreasingPrice) {
    relevantTicks.reverse(); // Process in order for decreasing price
  }

  for (const tick of relevantTicks) {
    const tickData = tickMap.get(tick);
    if (!tickData || currentLiquidity.isZero()) continue;

    // Calculate swap to reach this tick
    const swapAmount = calculateSwapToTick(
      currentSqrtPrice,
      tick,
      currentLiquidity,
      direction
    );

    if (swapAmount.amountIn.isZero()) continue;

    // Update cumulative amounts
    cumulativeAmountIn = cumulativeAmountIn.add(swapAmount.amountIn);
    cumulativeAmountOut = cumulativeAmountOut.add(swapAmount.amountOut);
    ticksCrossed++;

    // Calculate new liquidity after crossing this tick
    const liquidityBefore = new BN(currentLiquidity);
    const liquidityChange = isIncreasingPrice
      ? tickData.liquidityNet
      : tickData.liquidityNet.neg();
    const liquidityAfter = currentLiquidity.add(liquidityChange);

    // Calculate metrics
    const executionPrice = cumulativeAmountOut.isZero()
      ? 0
      : direction === "token0ToToken1"
      ? parseFloat(cumulativeAmountOut.toString()) /
        parseFloat(cumulativeAmountIn.toString())
      : parseFloat(cumulativeAmountIn.toString()) /
        parseFloat(cumulativeAmountOut.toString());

    const slippage = calculateSlippage(
      spotPrice,
      executionPrice,
      direction === "token0ToToken1"
    );

    // Calculate price impact
    const newSqrtPrice = tickToSqrtPriceX64(tick);
    const priceImpact = calculatePriceImpact(
      initialSqrtPrice,
      newSqrtPrice,
      isIncreasingPrice
    );

    results.push({
      tick,
      liquidityBefore,
      liquidityAfter,
      liquidityChange,
      cumulativeSwapAmount: new BN(cumulativeAmountIn),
      cumulativeOutput: new BN(cumulativeAmountOut),
      slippage,
      priceImpact,
      executionPrice,
      ticksCrossed
    });

    // Update state for next iteration
    currentLiquidity = liquidityAfter;
    currentSqrtPrice = newSqrtPrice;

    // Stop if liquidity becomes zero or negative
    if (currentLiquidity.lte(new BN(0))) {
      break;
    }
  }

  return results;
}

/**
 * Generate liquidity-based slippage analysis section
 */
export function generateLiquidityBasedSlippageSection(
  pool: PoolInfo,
  positions: PersonalPosition[]
): string {
  let section = "## Liquidity-Based Slippage Analysis\n\n";

  section += "### Overview\n";
  section +=
    "Analysis of slippage at each liquidity change point (where positions enter/exit range)\n\n";

  const decimals0 = pool.poolState.mintDecimals0;
  const decimals1 = pool.poolState.mintDecimals1;

  // Analyze both directions
  const sol2fragme = analyzeLiquidityChangePoints(
    pool,
    positions,
    "token0ToToken1",
    15
  );
  const fragme2sol = analyzeLiquidityChangePoints(
    pool,
    positions,
    "token1ToToken0",
    15
  );

  // SOL → FRAGME Analysis
  section += "### SOL → FRAGME Liquidity Breakpoints\n\n";
  section +=
    "| Tick | Swap Amount | Output | Slippage | Price Impact | Liquidity Change | New Liquidity |\n";
  section +=
    "|------|-------------|--------|----------|--------------|------------------|---------------|\n";

  sol2fragme.forEach((point) => {
    const swapAmount = addDecimalPoint(point.cumulativeSwapAmount, decimals0);
    const output = addDecimalPoint(point.cumulativeOutput, decimals1);
    const slippageStr = point.slippage.toFixed(3) + "%";
    const impactStr = point.priceImpact.toFixed(3) + "%";
    const liqChangeStr = point.liquidityChange.isNeg()
      ? `-${point.liquidityChange.neg().toString()}`
      : `+${point.liquidityChange.toString()}`;

    section += `| ${
      point.tick
    } | ${swapAmount} SOL | ${output} FRAGME | ${slippageStr} | ${impactStr} | ${liqChangeStr} | ${point.liquidityAfter.toString()} |\n`;
  });

  // FRAGME → SOL Analysis
  section += "\n### FRAGME → SOL Liquidity Breakpoints\n\n";
  section +=
    "| Tick | Swap Amount | Output | Slippage | Price Impact | Liquidity Change | New Liquidity |\n";
  section +=
    "|------|-------------|--------|----------|--------------|------------------|---------------|\n";

  fragme2sol.forEach((point) => {
    const swapAmount = addDecimalPoint(point.cumulativeSwapAmount, decimals1);
    const output = addDecimalPoint(point.cumulativeOutput, decimals0);
    const slippageStr = point.slippage.toFixed(3) + "%";
    const impactStr = point.priceImpact.toFixed(3) + "%";
    const liqChangeStr = point.liquidityChange.isNeg()
      ? `-${point.liquidityChange.neg().toString()}`
      : `+${point.liquidityChange.toString()}`;

    section += `| ${
      point.tick
    } | ${swapAmount} FRAGME | ${output} SOL | ${slippageStr} | ${impactStr} | ${liqChangeStr} | ${point.liquidityAfter.toString()} |\n`;
  });

  // Key Observations
  section += "\n### Key Observations\n\n";

  // Find significant liquidity drops
  const significantDropsSOL = sol2fragme.filter(
    (p) =>
      p.liquidityChange.isNeg() &&
      p.liquidityBefore.gt(new BN(0)) &&
      p.liquidityChange.neg().mul(new BN(100)).div(p.liquidityBefore).gtn(20)
  );

  const significantDropsFRAGME = fragme2sol.filter(
    (p) =>
      p.liquidityChange.isNeg() &&
      p.liquidityBefore.gt(new BN(0)) &&
      p.liquidityChange.neg().mul(new BN(100)).div(p.liquidityBefore).gtn(20)
  );

  if (significantDropsSOL.length > 0) {
    section += "**SOL → FRAGME Direction:**\n";
    significantDropsSOL.forEach((drop) => {
      const swapAmount = addDecimalPoint(drop.cumulativeSwapAmount, decimals0);
      const dropPercent = drop.liquidityChange
        .neg()
        .mul(new BN(100))
        .div(drop.liquidityBefore)
        .toNumber();
      section += `- At ${swapAmount} SOL: ${dropPercent.toFixed(
        1
      )}% liquidity drop causing ${drop.slippage.toFixed(2)}% slippage\n`;
    });
    section += "\n";
  }

  if (significantDropsFRAGME.length > 0) {
    section += "**FRAGME → SOL Direction:**\n";
    significantDropsFRAGME.forEach((drop) => {
      const swapAmount = addDecimalPoint(drop.cumulativeSwapAmount, decimals1);
      const dropPercent = drop.liquidityChange
        .neg()
        .mul(new BN(100))
        .div(drop.liquidityBefore)
        .toNumber();
      section += `- At ${swapAmount} FRAGME: ${dropPercent.toFixed(
        1
      )}% liquidity drop causing ${drop.slippage.toFixed(2)}% slippage\n`;
    });
    section += "\n";
  }

  // Find slippage thresholds based on actual liquidity
  section += "### Recommended Trade Sizes by Slippage Tolerance\n\n";
  section += "| Slippage Tolerance | SOL → FRAGME | FRAGME → SOL |\n";
  section += "|-------------------|--------------|---------------|\n";

  const slippageThresholds = [0.1, 0.25, 0.5, 1.0, 2.0, 5.0];

  slippageThresholds.forEach((threshold) => {
    const sol2fragmePoint = sol2fragme.find((p) => p.slippage >= threshold);
    const fragme2solPoint = fragme2sol.find((p) => p.slippage >= threshold);

    const sol2fragmeAmount = sol2fragmePoint
      ? `< ${addDecimalPoint(
          sol2fragmePoint.cumulativeSwapAmount,
          decimals0
        )} SOL`
      : "No limit";

    const fragme2solAmount = fragme2solPoint
      ? `< ${addDecimalPoint(
          fragme2solPoint.cumulativeSwapAmount,
          decimals1
        )} FRAGME`
      : "No limit";

    section += `| ${threshold}% | ${sol2fragmeAmount} | ${fragme2solAmount} |\n`;
  });

  section +=
    "\n*Note: Slippage increases significantly at liquidity boundaries where large positions exit the active range.*\n\n";

  return section;
}

/**
 * Generate comprehensive swap capacity section
 */
export function generateSwapCapacitySection(
  pool: PoolInfo,
  positions: PersonalPosition[]
): string {
  let section = "## Swap Capacity Analysis\n\n";

  section += "### Price Convention\n";
  section +=
    "All prices shown as **FRAGME/SOL** (how many FRAGME per 1 SOL)\n\n";

  // Add the new liquidity-based analysis
  const liquiditySection = generateLiquidityBasedSlippageSection(
    pool,
    positions
  );

  // Replace the old section with the new one
  return liquiditySection;
}

/**
 * Display swap simulation results
 */
export function displaySwapSimulation(
  result: SwapSimulationResult,
  decimals0: number,
  decimals1: number
): void {
  const direction =
    result.direction === "token0ToToken1" ? "SOL → FRAGME" : "FRAGME → SOL";

  const tokenIn = result.direction === "token0ToToken1" ? "SOL" : "FRAGME";
  const tokenOut = result.direction === "token0ToToken1" ? "FRAGME" : "SOL";
  const decimalsIn =
    result.direction === "token0ToToken1" ? decimals0 : decimals1;
  const decimalsOut =
    result.direction === "token0ToToken1" ? decimals1 : decimals0;

  console.log(`\n🔄 Swap Simulation: ${direction}`);
  console.log(
    `   Input: ${addDecimalPoint(result.amountIn, decimalsIn)} ${tokenIn}`
  );
  console.log(
    `   Output: ${addDecimalPoint(result.amountOut, decimalsOut)} ${tokenOut}`
  );
  console.log(`   Slippage: ${result.slippage.toFixed(3)}%`);
  console.log(`   Price Impact: ${result.priceImpact.toFixed(3)}%`);
  console.log(`   Execution Price: ${result.executionPrice.toFixed(6)}`);
  console.log(`   Average Price: ${result.averagePrice.toFixed(6)}`);
  console.log(`   Ticks Crossed: ${result.crossedTicks}`);
}
