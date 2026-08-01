// lib/swap/adapters/xylonet.ts
// XyloNet StableSwap adapter — the first live route. Verified on-chain (Phase B):
// USDC/EURC pool has deep liquidity; USDC/USYC is empty (quote reverts → the
// aggregator surfaces "No liquidity for this pair"). The router's own priceImpact
// is always 0, so impact is derived here from spot-vs-execution rate.

import { encodeFunctionData, type PublicClient } from "viem";
import type { Quote, QuoteParams, RouteAdapter } from "../types";
import { USDC, isSameToken, type TokenInfo } from "../tokens";
import { XYLONET, QUOTE_TTL_MS } from "../constants";
import { XYLO_ROUTER_ABI } from "../abis";

const ROUTER = XYLONET.router;
/** Conservative fixed estimate for ranking; execution estimates real gas via wagmi. */
const EST_GAS = 190_000n;

/** Direct pool when one side is USDC; otherwise hop through USDC. */
function buildPath(tokenIn: TokenInfo, tokenOut: TokenInfo): readonly `0x${string}`[] {
  if (isSameToken(tokenIn, USDC) || isSameToken(tokenOut, USDC)) return [tokenIn.address, tokenOut.address];
  return [tokenIn.address, USDC.address, tokenOut.address];
}

// Retry lives at the transport level (app/providers.tsx: retryCount/retryDelay
// on the http() transport) so it applies uniformly to every call in the app.
// A second retry loop here would compound with it and make failures slower to
// surface, not faster.
async function routerQuote(client: PublicClient, tokenIn: TokenInfo, tokenOut: TokenInfo, amountIn: bigint): Promise<bigint> {
  const res = (await client.readContract({
    address: ROUTER,
    abi: XYLO_ROUTER_ABI,
    functionName: "quote",
    args: [tokenIn.address, tokenOut.address, amountIn],
  })) as readonly [bigint, bigint];
  return res[0];
}

export function xylonetAdapter(client: PublicClient): RouteAdapter {
  return {
    id: "xylonet",
    displayName: "XyloNet",
    status: "ready",

    supports(tokenIn: TokenInfo, tokenOut: TokenInfo) {
      // Any pair among the registry routes through the USDC-paired pools.
      return !isSameToken(tokenIn, tokenOut);
    },

    async quote(params: QuoteParams): Promise<Quote | null> {
      const { tokenIn, tokenOut, amountIn, slippageBps, recipient, deadline } = params;
      if (amountIn <= 0n || isSameToken(tokenIn, tokenOut)) return null;

      const refIn = 10n ** BigInt(tokenIn.decimals);
      const needsRef = amountIn > refIn;

      // Fire the main quote and the impact-reference quote together — both are
      // independent reads, and issuing them in parallel (not one after the
      // other) is what lets the transport's batch window actually coalesce
      // them into a single HTTP round trip instead of two sequential ones.
      const [amountOut, refOut] = await Promise.all([
        routerQuote(client, tokenIn, tokenOut, amountIn),
        needsRef ? routerQuote(client, tokenIn, tokenOut, refIn).catch(() => 0n) : Promise.resolve(0n),
      ]);
      // Reverts (throws) on an empty pool; the aggregator turns that into a
      // "No liquidity" row.
      if (amountOut === 0n) return null;

      // Price impact = 1 − (execution rate / spot rate), using a 1-token reference.
      let priceImpactBps = 0;
      if (needsRef && refOut > 0n) {
        const spot = Number(refOut) / Number(refIn);
        const exec = Number(amountOut) / Number(amountIn);
        if (spot > 0) priceImpactBps = Math.max(0, Math.round((1 - exec / spot) * 10_000));
      }

      const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
      const path = buildPath(tokenIn, tokenOut);

      return {
        routeId: "xylonet",
        amountIn,
        amountOut,
        minAmountOut,
        feeBps: XYLONET.feeBps,
        priceImpactBps,
        estimatedGas: EST_GAS,
        path,
        spender: ROUTER,
        buildTx: () => ({
          to: ROUTER,
          data: encodeFunctionData({
            abi: XYLO_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountIn, minAmountOut, path, recipient, BigInt(deadline)],
          }),
        }),
        expiresAt: Date.now() + QUOTE_TTL_MS,
      };
    },
  };
}
