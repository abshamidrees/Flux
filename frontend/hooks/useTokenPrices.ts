// hooks/useTokenPrices.ts
// USD prices for the Sell/Receive USD-equivalent microline ONLY — display
// pricing, never a route quote (spec: Circle's getTokenRates must never leak
// into the route breakdown as if it were Circle's actual swap output).
//
// Priority: Circle's getTokenRates (cached real market data, wallet-free —
// Phase G) first, falling back to XyloNet's live pool-derived rate for any
// token Circle doesn't cover (e.g. USYC, which swap-kit doesn't route). A
// token covered by neither resolves to null and shows no USD value rather
// than a fabricated one.

"use client";

import { useCallback } from "react";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Blockchain, createSwapKitContext, getTokenRates } from "@circle-fin/swap-kit";
import { TOKENS, USDC, isSameToken, type TokenInfo } from "../lib/swap/tokens";
import { XYLONET } from "../lib/swap/constants";
import { XYLO_ROUTER_ABI } from "../lib/swap/abis";

export function useTokenPrices() {
  const client = usePublicClient();
  const others = TOKENS.filter((t) => !isSameToken(t, USDC));

  const { data } = useQuery({
    queryKey: ["token-prices", XYLONET.router],
    enabled: !!client,
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      const prices: Record<string, number | null> = { [USDC.address.toLowerCase()]: 1 };

      // Circle's cached USD rates — wallet-free, real market data. Best-effort:
      // its own failure (or simply not covering a token) never blocks pricing,
      // since the pool-derived fallback below covers the rest.
      const circleRates: Record<string, string> = {};
      try {
        const context = createSwapKitContext();
        const { rates } = await getTokenRates(context, {
          chain: Blockchain.Arc_Testnet,
          tokens: TOKENS.map((t) => t.address.toLowerCase()),
        });
        const chainRates = rates[Blockchain.Arc_Testnet] ?? {};
        for (const [addr, rate] of Object.entries(chainRates)) {
          if (rate?.priceUSD) circleRates[addr.toLowerCase()] = rate.priceUSD;
        }
      } catch {
        // Circle rates are best-effort display pricing — never block on this.
      }

      // Pool-derived fallback (and USYC, which swap-kit doesn't route at all).
      // Fired together, not in a sequential loop — with transport batching
      // (app/providers.tsx) these land in one HTTP round trip instead of N.
      const results = await Promise.all(
        others.map((t) =>
          client!
            .readContract({
              address: XYLONET.router,
              abi: XYLO_ROUTER_ABI,
              functionName: "quote",
              args: [t.address, USDC.address, 10n ** BigInt(t.decimals)],
            })
            .then((res) => (res as readonly [bigint, bigint])[0])
            .catch(() => null),
        ),
      );

      others.forEach((t, i) => {
        const addr = t.address.toLowerCase();
        const circlePrice = circleRates[addr];
        if (circlePrice != null && isFinite(Number(circlePrice))) {
          prices[addr] = Number(circlePrice);
          return;
        }
        const out = results[i];
        prices[addr] = out && out > 0n ? Number(out) / 1e6 : null;
      });
      return prices;
    },
  });

  // Stable reference (keyed on data, not re-created every render) — a consumer
  // that puts priceOf in a useEffect dependency array would otherwise re-fire
  // that effect on every render, not just when prices actually change.
  const priceOf = useCallback(
    (t: TokenInfo): number | null => {
      if (isSameToken(t, USDC)) return 1;
      return data?.[t.address.toLowerCase()] ?? null;
    },
    [data],
  );

  return { prices: data ?? {}, priceOf };
}
