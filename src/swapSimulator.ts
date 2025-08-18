import BN from "bn.js";
import { PersonalPosition } from "./fetchPositions";
import { PoolInfo } from "./fetchPool";
import { addDecimalPoint, formatBN } from "./bnUtils";
import { formatPrice } from "./tickToPrice";

// Constants
const Q64 = new BN(2).pow(new BN(64));
const BASE_FEE_RATE = 2000; // 0.2% base fee
const ADDITIONAL_FEE_RATE = 500; // 0.05% additional fee
const FEE_RATE = BASE_FEE_RATE + ADDITIONAL_FEE_RATE; // 0.25% total = 2500/1000000
const FEE_DENOMINATOR = 1000000;

export interface TickLiquidity {
  tick: number;
  liquidityNet: BN;
  liquidityGross: BN;
}

export interface LiquidityBreakpoint {
  tick: number;
  liquidityBefore: BN;
  liquidityAfter: BN;
  liquidityChange: BN;
  swapAmountToReach: BN;
  expectedOutput: BN;
  priceAtTick: string;
  priceImpact: number;
  slippage: number;
  isAccessible: boolean;
}

/**
 * Build tick liquidity map from positions
 */
export function buildTickLiquidityMap(
  positions: PersonalPosition[]
): Map<number, TickLiquidity> {
  const tickMap = new Map<number, TickLiquidity>();

  positions.forEach((pos) => {
    // Lower tick: liquidity enters
    const lowerTick = tickMap.get(pos.tickLowerIndex) || {
      tick: pos.tickLowerIndex,
      liquidityNet: new BN(0),
      liquidityGross: new BN(0)
    };
    lowerTick.liquidityNet = lowerTick.liquidityNet.add(pos.liquidity);
    lowerTick.liquidityGross = lowerTick.liquidityGross.add(pos.liquidity);
    tickMap.set(pos.tickLowerIndex, lowerTick);

    // Upper tick: liquidity exits
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
 * Calculate liquidity at a specific tick
 */
function calculateLiquidityAtTick(
  positions: PersonalPosition[],
  tick: number
): BN {
  let liquidity = new BN(0);

  positions.forEach((pos) => {
    if (tick >= pos.tickLowerIndex && tick < pos.tickUpperIndex) {
      liquidity = liquidity.add(pos.liquidity);
    }
  });

  return liquidity;
}

/**
 * Convert tick to sqrt price X64 (Raydium formula)
 */
function tickToSqrtPriceX64(tick: number): BN {
  if (tick < -443636 || tick > 443636) {
    throw new Error(`Tick ${tick} out of bounds`);
  }

  // Calculate sqrt(1.0001^tick) = 1.0001^(tick/2)
  const sqrtPrice = Math.pow(1.0001, tick / 2);

  // Check for overflow/underflow
  if (!isFinite(sqrtPrice) || sqrtPrice <= 0) {
    throw new Error(`Invalid sqrt price for tick ${tick}`);
  }

  // Convert to X64 fixed point
  const sqrtPriceX64Value = sqrtPrice * Math.pow(2, 64);

  // Check if the value is too large for JavaScript number
  if (sqrtPriceX64Value > Number.MAX_SAFE_INTEGER) {
    // For very large numbers, use string representation
    const str = sqrtPriceX64Value.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 0
    });

    // Remove any decimal points or scientific notation
    const cleanStr = str.split(".")[0].replace(/[eE].*/g, "");

    try {
      return new BN(cleanStr);
    } catch (e) {
      // If still fails, use BigInt
      const bigIntValue = BigInt(Math.floor(sqrtPriceX64Value));
      return new BN(bigIntValue.toString());
    }
  }

  // For normal sized numbers, use direct conversion
  try {
    const bigIntValue = BigInt(Math.floor(sqrtPriceX64Value));
    return new BN(bigIntValue.toString());
  } catch (e) {
    // Fallback: convert to string first
    return new BN(Math.floor(sqrtPriceX64Value).toString());
  }
}

/**
 * Raydium's get_delta_amount_0_unsigned function
 * amount_0 = liquidity * (sqrt_price_b - sqrt_price_a) / (sqrt_price_a * sqrt_price_b)
 */
function getDeltaAmount0(
  sqrtPrice0X64: BN,
  sqrtPrice1X64: BN,
  liquidity: BN,
  roundUp: boolean
): BN {
  let [sqrtPriceA, sqrtPriceB] = sqrtPrice0X64.lte(sqrtPrice1X64)
    ? [sqrtPrice0X64, sqrtPrice1X64]
    : [sqrtPrice1X64, sqrtPrice0X64];

  if (liquidity.isZero() || sqrtPriceA.eq(sqrtPriceB)) {
    return new BN(0);
  }

  try {
    // Raydium's actual formula:
    // amount0 = liquidity * (1/sqrtPriceA - 1/sqrtPriceB) * 2^64
    // = liquidity * 2^64 * (sqrtPriceB - sqrtPriceA) / (sqrtPriceA * sqrtPriceB)

    // Method 1: Calculate with higher precision
    const priceDelta = sqrtPriceB.sub(sqrtPriceA);

    // Scale up liquidity by 2^128 for precision
    const liquidityX128 = liquidity.shln(128);

    // amount0 = liquidityX128 / sqrtPriceA - liquidityX128 / sqrtPriceB
    const amount0A = liquidityX128.div(sqrtPriceA);
    const amount0B = liquidityX128.div(sqrtPriceB);

    // The difference, then scale down by 2^64
    let amount0 = amount0A.sub(amount0B).shrn(64);

    // Handle rounding
    if (roundUp) {
      const rem = amount0A.sub(amount0B).maskn(64);
      if (!rem.isZero()) {
        amount0 = amount0.add(new BN(1));
      }
    }

    return amount0;
  } catch (e) {
    console.error("Error in getDeltaAmount0:", e);
    return new BN(0);
  }
}

/**
 * Raydium's get_delta_amount_1_unsigned function
 * amount_1 = liquidity * (sqrt_price_b - sqrt_price_a) / 2^64
 */
function getDeltaAmount1(
  sqrtPrice0X64: BN,
  sqrtPrice1X64: BN,
  liquidity: BN,
  roundUp: boolean
): BN {
  let [sqrtPriceA, sqrtPriceB] = sqrtPrice0X64.lte(sqrtPrice1X64)
    ? [sqrtPrice0X64, sqrtPrice1X64]
    : [sqrtPrice1X64, sqrtPrice0X64];

  if (liquidity.isZero() || sqrtPriceA.eq(sqrtPriceB)) {
    return new BN(0);
  }

  try {
    const priceDelta = sqrtPriceB.sub(sqrtPriceA);

    // amount1 = liquidity * priceDelta / 2^64
    // Be more precise with the division
    const product = liquidity.mul(priceDelta);
    let amount1 = product.shrn(64);

    // More accurate rounding
    if (roundUp) {
      // Check if there's a remainder
      const remainder = product.maskn(64);
      if (!remainder.isZero()) {
        amount1 = amount1.add(new BN(1));
      }
    }

    return amount1;
  } catch (e) {
    console.error("Error in getDeltaAmount1:", e);
    return new BN(0);
  }
}

/**
 * Calculate the actual swap output after fees (Raydium's exact method)
 */
function calculateSwapWithFees(
  amountIn: BN,
  sqrtPriceStart: BN,
  sqrtPriceEnd: BN,
  liquidity: BN,
  isToken0ToToken1: boolean
): { amountIn: BN; amountOut: BN; feeAmount: BN } {
  // Calculate the theoretical amounts without fees first
  let theoreticalAmountIn: BN;
  let theoreticalAmountOut: BN;

  if (isToken0ToToken1) {
    // Selling token0 for token1
    theoreticalAmountIn = getDeltaAmount0(
      sqrtPriceEnd,
      sqrtPriceStart,
      liquidity,
      true
    );
    theoreticalAmountOut = getDeltaAmount1(
      sqrtPriceEnd,
      sqrtPriceStart,
      liquidity,
      false
    );
  } else {
    // Selling token1 for token0
    theoreticalAmountIn = getDeltaAmount1(
      sqrtPriceStart,
      sqrtPriceEnd,
      liquidity,
      true
    );
    theoreticalAmountOut = getDeltaAmount0(
      sqrtPriceStart,
      sqrtPriceEnd,
      liquidity,
      false
    );
  }

  // In Raydium CLMM, fees are applied as:
  // actualAmountIn = theoreticalAmountIn / (1 - feeRate)
  // This means we need MORE input to account for fees

  // Calculate with higher precision to avoid rounding errors
  const numerator = theoreticalAmountIn.mul(new BN(FEE_DENOMINATOR));
  const denominator = new BN(FEE_DENOMINATOR - FEE_RATE);

  // Add 1 for rounding up to ensure we have enough input
  let actualAmountIn = numerator.div(denominator);
  if (!numerator.mod(denominator).isZero()) {
    actualAmountIn = actualAmountIn.add(new BN(1));
  }

  const feeAmount = actualAmountIn.sub(theoreticalAmountIn);

  // Output remains the same as theoretical
  const actualAmountOut = theoreticalAmountOut;

  return {
    amountIn: actualAmountIn,
    amountOut: actualAmountOut,
    feeAmount
  };
}

/**
 * Calculate price impact - the actual price movement caused by the swap
 */
function calculatePriceImpact(
  startPrice: string,
  endPrice: string,
  isToken0ToToken1: boolean
): number {
  const start = parseFloat(startPrice);
  const end = parseFloat(endPrice);

  if (start === 0) return 0;

  // For token0 to token1 (selling SOL for FRAGME):
  // - Price decreases (less FRAGME per SOL after swap)
  // - Impact should be negative
  // For token1 to token0 (selling FRAGME for SOL):
  // - Price increases (more FRAGME per SOL after swap)
  // - Impact should be positive

  const priceChange = ((end - start) / start) * 100;

  // Return the actual price change percentage
  return priceChange;
}

/**
 * Find liquidity breakpoints with Raydium formulas
 */
export function findLiquidityBreakpoints(
  pool: PoolInfo,
  positions: PersonalPosition[],
  direction: "token0ToToken1" | "token1ToToken0",
  maxBreakpoints: number = 20
): LiquidityBreakpoint[] {
  const tickMap = buildTickLiquidityMap(positions);
  const sortedTicks = Array.from(tickMap.keys()).sort((a, b) => a - b);

  const currentTick = pool.currentTick;
  const currentSqrtPriceX64 = new BN(pool.poolState.sqrtPriceX64);
  const currentLiquidity = calculateLiquidityAtTick(positions, currentTick);
  const initialPrice = pool.currentPrice;

  console.log(`\n=== Liquidity Breakpoint Analysis ===`);
  console.log(`Direction: ${direction}`);
  console.log(`Current tick: ${currentTick}`);
  console.log(`Current sqrt price X64: ${currentSqrtPriceX64.toString()}`);
  console.log(`Current liquidity: ${currentLiquidity.toString()}`);
  console.log(`Current price: ${initialPrice} FRAGME/SOL`);
  console.log(
    `Fee rate: ${FEE_RATE / 10000}% (Base: ${
      BASE_FEE_RATE / 10000
    }% + Additional: ${ADDITIONAL_FEE_RATE / 10000}%)`
  );

  const isToken0ToToken1 = direction === "token0ToToken1";
  const breakpoints: LiquidityBreakpoint[] = [];

  // Get relevant ticks
  const relevantTicks = isToken0ToToken1
    ? sortedTicks.filter((t) => t < currentTick).reverse()
    : sortedTicks.filter((t) => t > currentTick);

  let cumulativeSwapAmount = new BN(0);
  let cumulativeOutput = new BN(0);
  let cumulativeFees = new BN(0);
  let simulatedLiquidity = new BN(currentLiquidity);
  let simulatedTick = currentTick;
  let simulatedSqrtPrice = new BN(currentSqrtPriceX64);

  for (const targetTick of relevantTicks.slice(0, maxBreakpoints)) {
    const tickData = tickMap.get(targetTick);
    if (!tickData || simulatedLiquidity.isZero()) continue;

    try {
      const targetSqrtPrice = tickToSqrtPriceX64(targetTick);

      console.log(`\nTarget tick ${targetTick}:`);
      console.log(`  Current sqrt: ${simulatedSqrtPrice.toString()}`);
      console.log(`  Target sqrt: ${targetSqrtPrice.toString()}`);
      console.log(`  Liquidity: ${simulatedLiquidity.toString()}`);

      // Calculate swap with fees
      const swap = calculateSwapWithFees(
        new BN(0), // We calculate the full range
        simulatedSqrtPrice,
        targetSqrtPrice,
        simulatedLiquidity,
        isToken0ToToken1
      );

      console.log(`  Swap amount (with fee): ${swap.amountIn.toString()}`);
      console.log(`  Output (after fee): ${swap.amountOut.toString()}`);
      console.log(`  Fee amount: ${swap.feeAmount.toString()}`);

      cumulativeSwapAmount = cumulativeSwapAmount.add(swap.amountIn);
      cumulativeOutput = cumulativeOutput.add(swap.amountOut);
      cumulativeFees = cumulativeFees.add(swap.feeAmount);

      // Display correct values based on direction
      if (isToken0ToToken1) {
        console.log(
          `  Cumulative swap: ${addDecimalPoint(
            cumulativeSwapAmount,
            pool.poolState.mintDecimals0
          )} SOL`
        );
        console.log(
          `  Cumulative output: ${addDecimalPoint(
            cumulativeOutput,
            pool.poolState.mintDecimals1
          )} FRAGME`
        );
        console.log(
          `  Cumulative fees: ${addDecimalPoint(
            cumulativeFees,
            pool.poolState.mintDecimals0
          )} SOL`
        );
      } else {
        console.log(
          `  Cumulative swap: ${addDecimalPoint(
            cumulativeSwapAmount,
            pool.poolState.mintDecimals1
          )} FRAGME`
        );
        console.log(
          `  Cumulative output: ${addDecimalPoint(
            cumulativeOutput,
            pool.poolState.mintDecimals0
          )} SOL`
        );
        console.log(
          `  Cumulative fees: ${addDecimalPoint(
            cumulativeFees,
            pool.poolState.mintDecimals1
          )} FRAGME`
        );
      }

      // Update liquidity
      const liquidityBefore = new BN(simulatedLiquidity);
      const liquidityChange = isToken0ToToken1
        ? tickData.liquidityNet.neg()
        : tickData.liquidityNet;
      const liquidityAfter = simulatedLiquidity.add(liquidityChange);

      // Calculate price at tick
      const priceAtTick = calculatePriceAtTick(
        targetTick,
        pool.poolState.mintDecimals0,
        pool.poolState.mintDecimals1
      );

      // Calculate price impact (change in price from start to end)
      const priceImpact = calculatePriceImpact(
        initialPrice,
        priceAtTick,
        isToken0ToToken1
      );

      // Calculate slippage (difference between execution price and initial price)
      let slippage = 0;
      let executionPrice = 0;
      if (!cumulativeSwapAmount.isZero() && !cumulativeOutput.isZero()) {
        if (isToken0ToToken1) {
          // SOL → FRAGME: execution price = FRAGME out / SOL in
          executionPrice =
            parseFloat(
              addDecimalPoint(cumulativeOutput, pool.poolState.mintDecimals1)
            ) /
            parseFloat(
              addDecimalPoint(
                cumulativeSwapAmount,
                pool.poolState.mintDecimals0
              )
            );
        } else {
          // FRAGME → SOL: execution price = FRAGME in / SOL out
          executionPrice =
            parseFloat(
              addDecimalPoint(
                cumulativeSwapAmount,
                pool.poolState.mintDecimals1
              )
            ) /
            parseFloat(
              addDecimalPoint(cumulativeOutput, pool.poolState.mintDecimals0)
            );
        }

        const spotPrice = parseFloat(initialPrice);
        slippage = Math.abs((executionPrice - spotPrice) / spotPrice) * 100;
      }

      console.log(`  Price at tick: ${priceAtTick}`);
      console.log(`  Execution price: ${executionPrice.toFixed(2)} FRAGME/SOL`);
      console.log(`  Price impact: ${priceImpact.toFixed(2)}%`);
      console.log(`  Slippage: ${slippage.toFixed(2)}%`);

      breakpoints.push({
        tick: targetTick,
        liquidityBefore,
        liquidityAfter: liquidityAfter.isNeg() ? new BN(0) : liquidityAfter,
        liquidityChange,
        swapAmountToReach: new BN(cumulativeSwapAmount),
        expectedOutput: new BN(cumulativeOutput),
        priceAtTick,
        priceImpact,
        slippage,
        isAccessible: true
      });

      // Update state
      simulatedLiquidity = liquidityAfter.isNeg() ? new BN(0) : liquidityAfter;
      simulatedTick = targetTick;
      simulatedSqrtPrice = targetSqrtPrice;

      if (simulatedLiquidity.isZero()) {
        console.log("  Liquidity depleted, stopping");
        break;
      }
    } catch (e) {
      console.error(`Error calculating for tick ${targetTick}:`, e);
      continue;
    }
  }

  console.log(`\n=== Analysis Complete ===\n`);

  return breakpoints;
}

/**
 * Calculate price at a specific tick
 */
function calculatePriceAtTick(
  tick: number,
  decimals0: number,
  decimals1: number
): string {
  try {
    const price = Math.pow(1.0001, tick);
    const decimalAdjustment = Math.pow(10, decimals1 - decimals0);
    const adjustedPrice = price * decimalAdjustment;
    return formatPrice(adjustedPrice.toString());
  } catch {
    return "N/A";
  }
}

/**
 * Generate liquidity breakpoint report
 */
export function generateLiquidityBreakpointReport(
  pool: PoolInfo,
  positions: PersonalPosition[]
): string {
  let report = "## Liquidity Breakpoint Analysis\n\n";
  report +=
    "This analysis shows the exact swap amounts needed to reach each liquidity change point.\n";
  report += `Fee Rate: ${FEE_RATE / 10000}% (Base: ${
    BASE_FEE_RATE / 10000
  }% + Additional: ${
    ADDITIONAL_FEE_RATE / 10000
  }%) | Current Price: ${formatPrice(pool.currentPrice)} FRAGME/SOL\n\n`;

  const decimals0 = pool.poolState.mintDecimals0;
  const decimals1 = pool.poolState.mintDecimals1;

  // SOL → FRAGME Analysis
  const sol2fragme = findLiquidityBreakpoints(
    pool,
    positions,
    "token0ToToken1",
    10
  );

  report += "### SOL → FRAGME (Sell SOL)\n\n";
  report +=
    "| Tick | Swap Amount | Output | Price Impact | Slippage | Liquidity Change | Status |\n";
  report +=
    "|------|-------------|--------|--------------|----------|------------------|--------|\n";

  sol2fragme.forEach((bp) => {
    const swapAmt = bp.isAccessible
      ? formatBN(bp.swapAmountToReach, decimals0, { maxDecimals: 4 }) + " SOL"
      : "N/A";
    const output = bp.isAccessible
      ? formatBN(bp.expectedOutput, decimals1, { maxDecimals: 2 }) + " FRAGME"
      : "N/A";
    const impact = bp.isAccessible ? bp.priceImpact.toFixed(2) + "%" : "N/A";
    const slippage = bp.isAccessible ? bp.slippage.toFixed(2) + "%" : "N/A";
    const liqChange = bp.liquidityChange.isNeg()
      ? `-${bp.liquidityChange.neg().toString()}`
      : `+${bp.liquidityChange.toString()}`;
    const status = bp.isAccessible ? "✅" : "❌";

    report += `| ${bp.tick} | ${swapAmt} | ${output} | ${impact} | ${slippage} | ${liqChange} | ${status} |\n`;
  });

  // FRAGME → SOL Analysis
  const fragme2sol = findLiquidityBreakpoints(
    pool,
    positions,
    "token1ToToken0",
    10
  );

  report += "\n### FRAGME → SOL (Sell FRAGME)\n\n";
  report +=
    "| Tick | Swap Amount | Output | Price Impact | Slippage | Liquidity Change | Status |\n";
  report +=
    "|------|-------------|--------|--------------|----------|------------------|--------|\n";

  fragme2sol.forEach((bp) => {
    const swapAmt = bp.isAccessible
      ? formatBN(bp.swapAmountToReach, decimals1, { maxDecimals: 2 }) +
        " FRAGME"
      : "N/A";
    const output = bp.isAccessible
      ? formatBN(bp.expectedOutput, decimals0, { maxDecimals: 4 }) + " SOL"
      : "N/A";
    const impact = bp.isAccessible ? bp.priceImpact.toFixed(2) + "%" : "N/A";
    const slippage = bp.isAccessible ? bp.slippage.toFixed(2) + "%" : "N/A";
    const liqChange = bp.liquidityChange.isNeg()
      ? `-${bp.liquidityChange.neg().toString()}`
      : `+${bp.liquidityChange.toString()}`;
    const status = bp.isAccessible ? "✅" : "❌";

    report += `| ${bp.tick} | ${swapAmt} | ${output} | ${impact} | ${slippage} | ${liqChange} | ${status} |\n`;
  });

  // Key insights
  report += "\n### Key Insights\n\n";

  // Find max swap capacity
  const maxSwapSOL =
    sol2fragme.length > 0 ? sol2fragme[sol2fragme.length - 1] : null;
  const maxSwapFRAGME =
    fragme2sol.length > 0 ? fragme2sol[fragme2sol.length - 1] : null;

  if (maxSwapSOL && maxSwapSOL.isAccessible) {
    const maxAmt = formatBN(maxSwapSOL.swapAmountToReach, decimals0, {
      maxDecimals: 4
    });
    const maxOut = formatBN(maxSwapSOL.expectedOutput, decimals1, {
      maxDecimals: 2
    });
    report += `- **Max SOL → FRAGME swap**: ${maxAmt} SOL for ${maxOut} FRAGME\n`;
    report += `  - Price Impact: ${maxSwapSOL.priceImpact.toFixed(2)}%\n`;
    report += `  - Slippage: ${maxSwapSOL.slippage.toFixed(2)}%\n`;
  }

  if (maxSwapFRAGME && maxSwapFRAGME.isAccessible) {
    const maxAmt = formatBN(maxSwapFRAGME.swapAmountToReach, decimals1, {
      maxDecimals: 2
    });
    const maxOut = formatBN(maxSwapFRAGME.expectedOutput, decimals0, {
      maxDecimals: 4
    });
    report += `- **Max FRAGME → SOL swap**: ${maxAmt} FRAGME for ${maxOut} SOL\n`;
    report += `  - Price Impact: ${maxSwapFRAGME.priceImpact.toFixed(2)}%\n`;
    report += `  - Slippage: ${maxSwapFRAGME.slippage.toFixed(2)}%\n`;
  }

  // Find safe swap sizes (within 1% slippage)
  const safeSizeSOL = sol2fragme.find(
    (bp) => bp.isAccessible && bp.slippage > 1.0
  );
  const safeSizeFRAGME = fragme2sol.find(
    (bp) => bp.isAccessible && bp.slippage > 1.0
  );

  if (safeSizeSOL) {
    const safeAmt = formatBN(safeSizeSOL.swapAmountToReach, decimals0, {
      maxDecimals: 4
    });
    report += `\n- **Safe SOL swap size (<1% slippage)**: Up to ${safeAmt} SOL\n`;
  }

  if (safeSizeFRAGME) {
    const safeAmt = formatBN(safeSizeFRAGME.swapAmountToReach, decimals1, {
      maxDecimals: 2
    });
    report += `- **Safe FRAGME swap size (<1% slippage)**: Up to ${safeAmt} FRAGME\n`;
  }

  report += `\n*All calculations include ${
    FEE_RATE / 10000
  }% total swap fees (${BASE_FEE_RATE / 10000}% base + ${
    ADDITIONAL_FEE_RATE / 10000
  }% additional).*\n`;

  return report;
}

/**
 * Wrapper for compatibility
 */
export function generateSwapCapacitySection(
  pool: PoolInfo,
  positions: PersonalPosition[]
): string {
  return generateLiquidityBreakpointReport(pool, positions);
}

/**
 * Simulate exact swap amount (for validation with UI)
 */
export function simulateExactSwap(
  pool: PoolInfo,
  positions: PersonalPosition[],
  exactAmountIn: BN,
  direction: "token0ToToken1" | "token1ToToken0"
): { amountOut: BN; priceImpact: number; executionPrice: number } {
  const tickMap = buildTickLiquidityMap(positions);
  const sortedTicks = Array.from(tickMap.keys()).sort((a, b) => a - b);

  const currentTick = pool.currentTick;
  const currentSqrtPriceX64 = new BN(pool.poolState.sqrtPriceX64);
  let currentLiquidity = calculateLiquidityAtTick(positions, currentTick);

  const isToken0ToToken1 = direction === "token0ToToken1";
  const initialPrice = parseFloat(pool.currentPrice);

  // Get relevant ticks
  const relevantTicks = isToken0ToToken1
    ? sortedTicks.filter((t) => t < currentTick).reverse()
    : sortedTicks.filter((t) => t > currentTick);

  let remainingInput = new BN(exactAmountIn);
  let totalOutput = new BN(0);
  let simulatedSqrtPrice = new BN(currentSqrtPriceX64);
  let simulatedTick = currentTick;
  let simulatedLiquidity = new BN(currentLiquidity);

  // Apply fees upfront
  const feeAmount = remainingInput
    .mul(new BN(FEE_RATE))
    .div(new BN(FEE_DENOMINATOR));
  remainingInput = remainingInput.sub(feeAmount);

  console.log(
    `\nExact swap simulation: ${addDecimalPoint(
      exactAmountIn,
      isToken0ToToken1
        ? pool.poolState.mintDecimals0
        : pool.poolState.mintDecimals1
    )} ${isToken0ToToken1 ? "SOL" : "FRAGME"}`
  );
  console.log(
    `After fees: ${addDecimalPoint(
      remainingInput,
      isToken0ToToken1
        ? pool.poolState.mintDecimals0
        : pool.poolState.mintDecimals1
    )}`
  );

  for (const targetTick of relevantTicks) {
    if (remainingInput.isZero() || simulatedLiquidity.isZero()) break;

    const tickData = tickMap.get(targetTick);
    if (!tickData) continue;

    const targetSqrtPrice = tickToSqrtPriceX64(targetTick);

    // Calculate max swap in this range
    let maxInput: BN;
    let maxOutput: BN;

    if (isToken0ToToken1) {
      maxInput = getDeltaAmount0(
        targetSqrtPrice,
        simulatedSqrtPrice,
        simulatedLiquidity,
        false
      );
      maxOutput = getDeltaAmount1(
        targetSqrtPrice,
        simulatedSqrtPrice,
        simulatedLiquidity,
        false
      );
    } else {
      maxInput = getDeltaAmount1(
        simulatedSqrtPrice,
        targetSqrtPrice,
        simulatedLiquidity,
        false
      );
      maxOutput = getDeltaAmount0(
        simulatedSqrtPrice,
        targetSqrtPrice,
        simulatedLiquidity,
        false
      );
    }

    if (remainingInput.lte(maxInput)) {
      // Partial consumption of this tick range
      const ratio = remainingInput.mul(new BN(1000000)).div(maxInput);
      const partialOutput = maxOutput.mul(ratio).div(new BN(1000000));

      totalOutput = totalOutput.add(partialOutput);
      remainingInput = new BN(0);

      console.log(
        `  Partial swap in tick range to ${targetTick}: output ${addDecimalPoint(
          partialOutput,
          isToken0ToToken1
            ? pool.poolState.mintDecimals1
            : pool.poolState.mintDecimals0
        )}`
      );
      break;
    } else {
      // Full consumption of this tick range
      totalOutput = totalOutput.add(maxOutput);
      remainingInput = remainingInput.sub(maxInput);

      console.log(
        `  Full swap through tick ${targetTick}: output ${addDecimalPoint(
          maxOutput,
          isToken0ToToken1
            ? pool.poolState.mintDecimals1
            : pool.poolState.mintDecimals0
        )}`
      );

      // Update liquidity for next iteration
      const liquidityChange = isToken0ToToken1
        ? tickData.liquidityNet.neg()
        : tickData.liquidityNet;
      simulatedLiquidity = simulatedLiquidity.add(liquidityChange);
      if (simulatedLiquidity.isNeg()) simulatedLiquidity = new BN(0);

      simulatedTick = targetTick;
      simulatedSqrtPrice = targetSqrtPrice;
    }
  }

  console.log(
    `Total output: ${addDecimalPoint(
      totalOutput,
      isToken0ToToken1
        ? pool.poolState.mintDecimals1
        : pool.poolState.mintDecimals0
    )}`
  );

  // Calculate metrics
  const executionPrice = isToken0ToToken1
    ? parseFloat(addDecimalPoint(totalOutput, pool.poolState.mintDecimals1)) /
      parseFloat(addDecimalPoint(exactAmountIn, pool.poolState.mintDecimals0))
    : parseFloat(addDecimalPoint(exactAmountIn, pool.poolState.mintDecimals1)) /
      parseFloat(addDecimalPoint(totalOutput, pool.poolState.mintDecimals0));

  const priceImpact =
    Math.abs((executionPrice - initialPrice) / initialPrice) * 100;

  return {
    amountOut: totalOutput,
    priceImpact,
    executionPrice
  };
}

export function displaySwapSimulation(
  result: any,
  decimals0: number,
  decimals1: number
): void {
  console.log("Swap simulation (legacy) - use breakpoint analysis instead");
}
