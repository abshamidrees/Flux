// lib/swap/aggregator.ts
// Route-agnostic fan-out + ranking. Every enabled adapter is quoted in parallel
// with a per-route timeout; one route failing never blocks the others. Ranks by
// NET output: output value in USDC terms minus estimated gas cost in USDC (Arc
// pays gas in USDC, so this is honest). A route with no real quote becomes a
// disabled row with a specific reason — never a fabricated number (spec §6).

import type { AggregateResult, Quote, QuoteParams, RankedQuote, RouteAdapter, RouteFailure } from "./types";
import type { TokenInfo } from "./tokens";
import { ROUTE_TIMEOUT_MS } from "./constants";
import { RouteQuoteError } from "./adapters/errors";

export interface RankOptions {
  tokenOut: TokenInfo;
  /** USD price for a token. */
  usdPrice: (token: TokenInfo) => number;
  /** USDC cost per unit of gas (gasPrice in USDC base units ÷ 1e6). */
  gasPriceUsdc: number;
}

function toNumber(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export function netOutUsdc(quote: Quote, opts: RankOptions): number {
  const outUsd = toNumber(quote.amountOut, opts.tokenOut.decimals) * opts.usdPrice(opts.tokenOut);
  const gasUsdc = Number(quote.estimatedGas) * opts.gasPriceUsdc;
  return outUsd - gasUsdc;
}

export function rankQuotes(quotes: Quote[], opts: RankOptions): RankedQuote[] {
  if (quotes.length === 0) return [];
  const scored = quotes.map((quote) => ({ quote, netOutUsdc: netOutUsdc(quote, opts) }));
  scored.sort((a, b) => b.netOutUsdc - a.netOutUsdc);
  const bestNet = scored[0].netOutUsdc;
  return scored.map((s, i) => ({
    quote: s.quote,
    netOutUsdc: s.netOutUsdc,
    isBest: i === 0,
    deltaBps: i === 0 || bestNet === 0 ? 0 : ((s.netOutUsdc - bestNet) / bestNet) * 10_000,
  }));
}

export function pickBest(ranked: RankedQuote[]): Quote | null {
  return ranked.find((r) => r.isBest)?.quote ?? null;
}

const TIMEOUT = Symbol("route-timeout");

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((res) => setTimeout(() => res(TIMEOUT), ms))]);
}

/**
 * Quote every adapter in parallel and rank the results. `adapters` should already
 * be filtered to the user's enabled set.
 *
 * `onUpdate` fires after EACH adapter settles (success, no-liquidity, timeout, or
 * error) with the re-ranked state so far — so a fast route (XyloNet) renders the
 * instant it resolves instead of waiting on a slow or failing one (Synthra,
 * Circle without a wallet). The awaited return value is the same final result,
 * for callers that only need the end state (e.g. the pre-signature re-quote).
 */
export async function runAggregator(
  adapters: RouteAdapter[],
  params: QuoteParams,
  rank: RankOptions,
  onUpdate?: (partial: AggregateResult) => void,
): Promise<AggregateResult> {
  const quotes: Quote[] = [];
  const failures: RouteFailure[] = [];

  const emit = () => {
    if (!onUpdate) return;
    const ranked = rankQuotes(quotes, rank);
    onUpdate({ ranked, failures: [...failures], best: pickBest(ranked) });
  };

  await Promise.allSettled(
    adapters.map(async (adapter) => {
      // Not-yet-wired / errored routes show their own reason, no network call.
      if (adapter.status !== "ready") {
        failures.push({ routeId: adapter.id, displayName: adapter.displayName, status: adapter.status, reason: adapter.statusReason ?? "Unavailable" });
        emit();
        return;
      }
      if (!adapter.supports(params.tokenIn, params.tokenOut)) {
        failures.push({ routeId: adapter.id, displayName: adapter.displayName, status: "no-liquidity", reason: "Pair not supported" });
        emit();
        return;
      }
      try {
        const result = await raceTimeout(adapter.quote(params), ROUTE_TIMEOUT_MS);
        if (result === TIMEOUT) {
          failures.push({ routeId: adapter.id, displayName: adapter.displayName, status: "error", reason: "Quote timed out" });
        } else if (result === null) {
          failures.push({ routeId: adapter.id, displayName: adapter.displayName, status: "no-liquidity", reason: "No liquidity for this pair" });
        } else {
          quotes.push(result);
        }
      } catch (e) {
        // An adapter can throw RouteQuoteError with a specific, honest reason
        // (e.g. "Connect a wallet to see Circle quotes") — surfaced verbatim
        // instead of the generic fallback for a truly unexpected failure.
        const reason = e instanceof RouteQuoteError ? e.reason : "Quote failed";
        failures.push({ routeId: adapter.id, displayName: adapter.displayName, status: "error", reason });
      }
      emit();
    }),
  );

  const ranked = rankQuotes(quotes, rank);
  return { ranked, failures, best: pickBest(ranked) };
}
