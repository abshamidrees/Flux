// lib/swap/adapters/uniswapV3.ts
// Shared adapter factory for any classic Uniswap V3 fork (Phase G §3 — "don't
// duplicate the quoting logic twice"). UnitFlow V3 instantiates this now;
// Synthra (also a V3 fork) instantiates it once its addresses are confirmed —
// same quoting/ranking logic, different router/quoter/factory/fee tiers.
//
// Verified empirically (Phase G): the Quoter's quoteExactInputSingle is a V1
// shape (single uint256, not a QuoterV2 struct) and viem's readContract calls
// it cleanly despite the nonpayable mutability annotation — no simulateContract
// fallback needed, but confirm this per-fork before assuming it holds.

import { encodeFunctionData, type PublicClient } from "viem";
import type { Quote, QuoteParams, RouteAdapter, RouteId } from "../types";
import { isSameToken, type TokenInfo } from "../tokens";
import { QUOTE_TTL_MS } from "../constants";
import { UNISWAP_V3_QUOTER_ABI, UNISWAP_V3_ROUTER_ABI } from "../abis";

export interface UniswapV3AdapterConfig {
  id: RouteId;
  displayName: string;
  router: `0x${string}`; // approval spender
  quoter: `0x${string}`;
  /** Fee tiers to probe, in priority order — the first with a real, non-zero
   *  quote wins. Probed in parallel, not sequentially. */
  feeTiers: readonly number[];
  estimatedGas: bigint;
}

async function quoteAtFee(
  client: PublicClient,
  quoter: `0x${string}`,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  fee: number,
  amountIn: bigint,
): Promise<bigint> {
  const out = await client.readContract({
    address: quoter,
    abi: UNISWAP_V3_QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [tokenIn.address, tokenOut.address, fee, amountIn, 0n],
  });
  return out as bigint;
}

export function createUniswapV3Adapter(client: PublicClient, config: UniswapV3AdapterConfig): RouteAdapter {
  return {
    id: config.id,
    displayName: config.displayName,
    status: "ready",

    supports(tokenIn: TokenInfo, tokenOut: TokenInfo) {
      return !isSameToken(tokenIn, tokenOut);
    },

    async quote(params: QuoteParams): Promise<Quote | null> {
      const { tokenIn, tokenOut, amountIn, slippageBps, recipient, deadline } = params;
      if (amountIn <= 0n || isSameToken(tokenIn, tokenOut)) return null;

      // Probe every configured fee tier in parallel (lands in one batched HTTP
      // round trip per app/providers.tsx's transport). A tier with no pool
      // reverts — caught individually, never blocks the others.
      const attempts = await Promise.allSettled(
        config.feeTiers.map((fee) => quoteAtFee(client, config.quoter, tokenIn, tokenOut, fee, amountIn)),
      );

      let amountOut = 0n;
      let fee = 0;
      for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        if (a.status === "fulfilled" && a.value > 0n) {
          amountOut = a.value;
          fee = config.feeTiers[i];
          break;
        }
      }
      // No configured fee tier has a usable pool — honest "no liquidity", not
      // a fabricated number, and never silently substituted with a different
      // pair (e.g. a wrapped-native pool) that isn't what the user asked for.
      if (amountOut === 0n) return null;

      // Price impact: spot-vs-execution at the same winning fee tier, same
      // method as the other adapters. Never blocks the main quote.
      let priceImpactBps = 0;
      const refIn = 10n ** BigInt(tokenIn.decimals);
      if (amountIn > refIn) {
        try {
          const refOut = await quoteAtFee(client, config.quoter, tokenIn, tokenOut, fee, refIn);
          const spot = Number(refOut) / Number(refIn);
          const exec = Number(amountOut) / Number(amountIn);
          if (spot > 0) priceImpactBps = Math.max(0, Math.round((1 - exec / spot) * 10_000));
        } catch {
          /* impact stays 0 */
        }
      }

      const minAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

      return {
        routeId: config.id,
        amountIn,
        amountOut,
        minAmountOut,
        feeBps: fee / 100, // uint24 fee is in hundredths of a bip (3000 = 0.30%)
        priceImpactBps,
        estimatedGas: config.estimatedGas,
        path: [tokenIn.address, tokenOut.address],
        spender: config.router,
        buildTx: () => ({
          to: config.router,
          data: encodeFunctionData({
            abi: UNISWAP_V3_ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [{
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              fee,
              recipient,
              deadline: BigInt(deadline),
              amountIn,
              amountOutMinimum: minAmountOut,
              sqrtPriceLimitX96: 0n,
            }],
          }),
        }),
        expiresAt: Date.now() + QUOTE_TTL_MS,
      };
    },
  };
}
