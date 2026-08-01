// lib/swap/format.ts
// Number + copy rules from the build spec §8. Tabular figures are applied in CSS
// (font-variant-numeric: tabular-nums) wherever these strings render.

import { formatUnits } from "viem";

/**
 * Token amounts: up to 6 significant decimals, trailing zeros trimmed,
 * thousands separated. Accepts a bigint (with decimals) or a number.
 */
export function formatTokenAmount(
  value: bigint | number,
  decimals = 6,
  maxDecimals = 6,
): string {
  const n = typeof value === "bigint" ? Number(formatUnits(value, decimals)) : value;
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";

  // Significant-decimal handling for very small amounts.
  const abs = Math.abs(n);
  let dp = maxDecimals;
  if (abs >= 1) dp = Math.min(maxDecimals, 6);
  else if (abs > 0) {
    const leadingZeros = Math.floor(-Math.log10(abs));
    dp = Math.min(maxDecimals + leadingZeros, 12);
  }

  const fixed = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dp,
  });
  return fixed;
}

/** USD values: 2 decimals, $ prefix. */
export function formatUsd(value: number): string {
  if (!isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Percentages: 2 decimals with explicit sign, e.g. −0.14% / +1.20%. */
export function formatSignedPercent(pct: number): string {
  if (!isFinite(pct)) return "0.00%";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : ""; // U+2212 minus
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/** Unsigned percent, 2 decimals. */
export function formatPercent(pct: number): string {
  if (!isFinite(pct)) return "0.00%";
  return `${pct.toFixed(2)}%`;
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Parse a user-typed decimal string into base units for `token.decimals`. */
export function parseTokenAmount(input: string, decimals: number): bigint {
  const cleaned = input.trim().replace(/,/g, "");
  if (!cleaned || isNaN(Number(cleaned))) return 0n;
  const [whole, frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  try {
    return BigInt(digits || "0");
  } catch {
    return 0n;
  }
}

/** Shorten a 0x address for display: 0x4f9d…cBA3. */
export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
