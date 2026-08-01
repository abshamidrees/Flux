// hooks/useQuotes.ts
// Real quoting: fans out to the live RouteAdapters via the aggregator, ranks by
// net output, and re-quotes every 15s while the form is valid. No mock source.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Quote, RankedQuote, RouteFailure, RouteId } from "../lib/swap/types";
import { isSameToken, type TokenInfo } from "../lib/swap/tokens";
import { runAggregator } from "../lib/swap/aggregator";
import { buildAdapters } from "../lib/swap/adapters/registry";
import { REQUOTE_INTERVAL_MS } from "../lib/swap/constants";
import { useTokenPrices } from "./useTokenPrices";

export interface UseQuotesArgs {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: bigint;
  slippageBps: number;
  recipient?: `0x${string}`;
  enabledRoutes: Set<RouteId>;
  pinnedRoute: RouteId | null;
}

export interface UseQuotesResult {
  loading: boolean;
  ranked: RankedQuote[];
  failures: RouteFailure[];
  selected: RankedQuote | null;
  pinnedFellBack: boolean;
  quotedAt: number | null;
  refresh: () => Promise<void>;
  /** Fresh quote for one route with the real recipient + deadline (pre-signature re-quote). */
  quoteRoute: (routeId: RouteId, recipient: `0x${string}`, deadlineSec: number) => Promise<Quote | null>;
  /** USDC cost per unit of gas — for the network-fee row and route breakdown. */
  gasPriceUsdc: number;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function useQuotes(args: UseQuotesArgs): UseQuotesResult {
  const { tokenIn, tokenOut, amountIn, slippageBps, recipient, enabledRoutes, pinnedRoute } = args;

  const client = usePublicClient();
  const { priceOf } = useTokenPrices();

  const adapters = useMemo(() => (client ? buildAdapters(client) : []), [client]);

  // Arc gas price (USDC base units per gas) → USDC cost per gas for ranking.
  const { data: gasPriceUsdc = 0 } = useQuery({
    queryKey: ["arc-gas-price"],
    enabled: !!client,
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        // Arc's native gas token is 18-decimal (verified on-chain) and pegged ~1:1
        // to USD, so gas cost in USD ≈ gasUnits × gasPrice / 1e18.
        const gp = await client!.getGasPrice();
        return Number(gp) / 1e18;
      } catch {
        return 0;
      }
    },
  });

  const [loading, setLoading] = useState(false);
  const [ranked, setRanked] = useState<RankedQuote[]>([]);
  const [failures, setFailures] = useState<RouteFailure[]>([]);
  const [quotedAt, setQuotedAt] = useState<number | null>(null);
  const reqId = useRef(0);

  const valid = !!client && amountIn > 0n && !isSameToken(tokenIn, tokenOut) && enabledRoutes.size > 0;

  const run = useCallback(async () => {
    if (!valid) {
      setRanked([]);
      setFailures([]);
      setQuotedAt(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);

    const enabled = adapters.filter((a) => enabledRoutes.has(a.id));
    const result = await runAggregator(
      enabled,
      {
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps,
        recipient: recipient ?? ZERO,
        deadline: Math.floor(Date.now() / 1000) + 20 * 60,
      },
      { tokenOut, usdPrice: (t) => priceOf(t) ?? 1, gasPriceUsdc },
      // Fires as each route settles — a fast route (XyloNet) renders immediately
      // instead of waiting on a slow or failing one. Only clear `loading` once
      // there's an actual quote to show; if the first routes to settle are all
      // failures, keep showing "Finding best route…" rather than flash "No route"
      // and then flip back the moment the real winner lands.
      (partial) => {
        if (id !== reqId.current) return; // superseded by a newer request
        setRanked(partial.ranked);
        setFailures(partial.failures);
        if (partial.ranked.length > 0) setLoading(false);
      },
    );

    if (id !== reqId.current) return; // superseded by a newer request

    setRanked(result.ranked);
    setFailures(result.failures);
    setQuotedAt(Date.now());
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, adapters, tokenIn, tokenOut, amountIn, slippageBps, recipient, enabledRoutes, gasPriceUsdc]);

  useEffect(() => { run(); }, [run]);

  // Fresh single-route quote for the pre-signature re-quote (spec §4.3).
  const quoteRoute = useCallback(
    async (routeId: RouteId, recipientReal: `0x${string}`, deadlineSec: number): Promise<Quote | null> => {
      const a = adapters.find((x) => x.id === routeId);
      if (!a || a.status !== "ready") return null;
      return a.quote({ tokenIn, tokenOut, amountIn, slippageBps, recipient: recipientReal, deadline: deadlineSec });
    },
    [adapters, tokenIn, tokenOut, amountIn, slippageBps],
  );

  useEffect(() => {
    if (!valid) return;
    const t = setInterval(run, REQUOTE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [valid, run]);

  let selected: RankedQuote | null = null;
  let pinnedFellBack = false;
  if (pinnedRoute) {
    selected = ranked.find((r) => r.quote.routeId === pinnedRoute) ?? null;
    if (!selected && ranked.length > 0) {
      selected = ranked.find((r) => r.isBest) ?? null;
      pinnedFellBack = true;
    }
  } else {
    selected = ranked.find((r) => r.isBest) ?? null;
  }

  return { loading, ranked, failures, selected, pinnedFellBack, quotedAt, refresh: run, quoteRoute, gasPriceUsdc };
}
