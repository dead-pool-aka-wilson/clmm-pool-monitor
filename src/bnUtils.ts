import BN from "bn.js";

/**
 * String manipulation for decimals
 * Adds decimal point to a string number based on decimals
 */
export function addDecimalPoint(value: string | BN, decimals: number): string {
  const str = value.toString();

  if (decimals === 0) return str;

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
export function stringToBN(value: string, decimals: number): BN {
  const [whole, fraction = ""] = value.split(".");

  // Pad or trim fraction to match decimals
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);

  // Combine and convert to BN
  const combined = whole + paddedFraction;
  return new BN(combined);
}

/**
 * Format BN with commas and decimals
 */
export function formatBN(
  value: BN,
  decimals: number,
  options?: {
    commaSeparator?: boolean;
    maxDecimals?: number;
    minDecimals?: number;
  }
): string {
  const {
    commaSeparator = false,
    maxDecimals = decimals,
    minDecimals = 0
  } = options || {};

  // Convert BN to string with decimal point
  let result = addDecimalPoint(value, decimals);

  // Handle decimal places
  const [whole, fraction = ""] = result.split(".");

  // Apply min/max decimals
  let finalFraction = fraction;
  if (fraction.length > maxDecimals) {
    finalFraction = fraction.slice(0, maxDecimals);
  } else if (fraction.length < minDecimals) {
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
export function mulBNByFloat(
  bn: BN,
  multiplier: number,
  precision: number = 6
): BN {
  const precisionBN = new BN(10).pow(new BN(precision));
  const multiplierBN = new BN(Math.floor(multiplier * Math.pow(10, precision)));

  return bn.mul(multiplierBN).div(precisionBN);
}

/**
 * Divide two BNs and get decimal result as string
 */
export function divBNToString(
  numerator: BN,
  denominator: BN,
  decimals: number
): string {
  if (denominator.isZero()) return "0";

  // Scale up numerator for precision
  const scaled = numerator.mul(new BN(10).pow(new BN(decimals)));
  const result = scaled.div(denominator);

  return addDecimalPoint(result, decimals);
}

/**
 * Calculate percentage between two BNs
 */
export function calculatePercentage(
  part: BN,
  total: BN,
  precision: number = 2
): string {
  if (total.isZero()) return "0";

  const hundred = new BN(100);
  const precisionBN = new BN(10).pow(new BN(precision));

  const percentage = part.mul(hundred).mul(precisionBN).div(total);

  return addDecimalPoint(percentage, precision);
}

/**
 * Compare two BNs considering decimals
 */
export function compareBNWithDecimals(
  a: BN,
  aDecimals: number,
  b: BN,
  bDecimals: number
): number {
  // Normalize to same decimals
  const maxDecimals = Math.max(aDecimals, bDecimals);
  const aNormalized = a.mul(new BN(10).pow(new BN(maxDecimals - aDecimals)));
  const bNormalized = b.mul(new BN(10).pow(new BN(maxDecimals - bDecimals)));

  return aNormalized.cmp(bNormalized);
}

/**
 * Safe BN operations with overflow checking
 */
export class SafeBN {
  static add(a: BN, b: BN): BN {
    const result = a.add(b);
    if (result.lt(a) && b.gt(new BN(0))) {
      throw new Error("BN addition overflow");
    }
    return result;
  }

  static sub(a: BN, b: BN): BN {
    if (a.lt(b)) {
      throw new Error("BN subtraction underflow");
    }
    return a.sub(b);
  }

  static mul(a: BN, b: BN): BN {
    if (a.isZero() || b.isZero()) return new BN(0);

    const result = a.mul(b);
    if (!result.div(a).eq(b)) {
      throw new Error("BN multiplication overflow");
    }
    return result;
  }

  static div(a: BN, b: BN): BN {
    if (b.isZero()) {
      throw new Error("Division by zero");
    }
    return a.div(b);
  }
}
