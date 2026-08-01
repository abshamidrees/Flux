// lib/swap/types.ts
// Route-layer contracts for the Flux swap aggregator.
// The aggregator knows nothing route-specific — every DEX route implements
// RouteAdapter, and the aggregator only ever sees Quote objects.
//
// Hybrid routing (confirmed Phase 0): custom on-chain adapters (XyloNet, UnitFlow)
// + Synthra (API) + Circle swap-kit ('circle'). Adapters are added in Phase 2;
// Phase 1 renders the UI against a clearly-labelled mock quote source.

import type { TokenInfo } from "./tokens";

/** Stable identifier for each route. 'circle' = @circle-fin/swap-kit. */
export type RouteId = "xylonet" | "synthra" | "unitflow" | "circle";

/**
 * ready         — adapter configured, quoting live
 * unconfigured  — no verified address / endpoint yet; render disabled with reason
 * no-liquidity  — configured, but this pair has no usable pool
 * error         — quote attempt failed / timed out
 */
export type RouteStatus = "ready" | "unconfigured" | "no-liquidity" | "error";

/** Minimal transaction request an adapter hands back — decoupled from viem. */
export interface SwapTxRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

export interface QuoteParams {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: bigint;
  /** User slippage tolerance in basis points (e.g. 50 = 0.50%). */
  slippageBps: number;
  recipient: `0x${string}`;
  /** Unix seconds after which the swap tx should revert. */
  deadline: number;
}

export interface Quote {
  routeId: RouteId;
  amountIn: bigint;
  /** Pre-slippage expected output. */
  amountOut: bigint;
  /** amountOut after the user's slippage tolerance. */
  minAmountOut: bigint;
  /** Route's own fee, in basis points. */
  feeBps: number;
  priceImpactBps: number;
  /** Estimated gas in units; Arc pays gas in USDC (6dp) so this converts honestly. */
  estimatedGas: bigint;
  path: readonly `0x${string}`[];
  /** Approval target for tokenIn. */
  spender: `0x${string}`;
  buildTx: () => SwapTxRequest;
  /**
   * Present only for adapters that cannot hand back raw calldata for the
   * connected wallet to sign (e.g. Circle swap-kit, which drives its own
   * signing through a wallet-client adapter). When set, useSwapExecution
   * calls this instead of buildTx() + sendTransaction, and treats its
   * resolved txHash as the mined result.
   */
  kitExecute?: () => Promise<{ txHash: `0x${string}`; amountOut: bigint }>;
  /** Epoch ms after which this quote is stale (~20s). */
  expiresAt: number;
}

export interface RouteAdapter {
  id: RouteId;
  displayName: string;
  status: RouteStatus;
  /** Reason shown in the route row when status !== 'ready'. */
  statusReason?: string;
  supports(tokenIn: TokenInfo, tokenOut: TokenInfo): boolean;
  quote(params: QuoteParams): Promise<Quote | null>;
}

/** A quote decorated with aggregator ranking metadata for the UI. */
export interface RankedQuote {
  quote: Quote;
  /** Output converted to USDC terms, minus estimated gas in USDC. */
  netOutUsdc: number;
  isBest: boolean;
  /** Signed delta vs. the winner's netOut, in basis points (0 for the winner). */
  deltaBps: number;
}

/** What the aggregator surfaces for a route that could not produce a quote. */
export interface RouteFailure {
  routeId: RouteId;
  displayName: string;
  status: Exclude<RouteStatus, "ready">;
  reason: string;
}

export interface AggregateResult {
  ranked: RankedQuote[];
  failures: RouteFailure[];
  /** Convenience: the winning quote, or null if every route failed. */
  best: Quote | null;
}
