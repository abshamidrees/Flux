// lib/swap/adapters/circle.ts
// Circle @circle-fin/swap-kit adapter (pinned 1.5.0 / adapter-viem-v2 1.14.1).
//
// Verified from the package's real .d.ts (not the doc site, which omitted the
// execution model): `Blockchain.Arc_Testnet` is a real, whitelisted testnet
// enum member. The SDK's execution model is fundamentally different from
// XyloNet/UnitFlow — it does not hand back raw calldata for a connected wallet
// to sign; instead `swap()` drives signing itself through a `ViemAdapter`
// configured with a `getWalletClient` getter. To fit this into the shared
// RouteAdapter shape, `buildTx()` is unused for this route; `kitExecute` on
// the Quote carries the swap-kit flow instead, and useSwapExecution branches
// on its presence.
//
// Phase G diagnosis (root cause, not a guess — confirmed via real reproduction
// and code inspection): the recurring "No browser wallet available" error was
// a WIRING BUG, not a token-support gap. This adapter's getWalletClient getter
// only checked window.ethereum, but Flux's actual wallet stack is Privy — an
// embedded/email wallet never populates window.ethereum, and even an external
// wallet connected through Privy's own connector doesn't route through it.
// window.ethereum is confirmed undefined in this app's normal session even
// with a wallet genuinely connected. estimate() ALSO calls getWalletClient
// internally (to resolve a from-address), not just swap() — so this broke
// quoting, not just execution. Fixed by resolving the wallet client through
// @wagmi/core's getWalletClient(wagmiConfig) — the exact same resolution path
// useSendTransaction/useWriteContract already use successfully elsewhere in
// this app for XyloNet/UnitFlow execution, so it correctly follows whichever
// connector (Privy embedded, injected, WalletConnect) is actually active.
// EURC itself is a real, catalogued token in the SDK's type system — ruled
// out as the cause.
//
// Per Phase 0 docs: Arc Testnet swap-kit support is USDC/EURC/cirBTC only —
// USYC is out of scope here and correctly falls through to "Pair not supported".

import type { PublicClient } from "viem";
import { getWalletClient } from "@wagmi/core";
import {
  Blockchain,
  createSwapKitContext,
  estimate,
  getChainByEnum,
  getErrorMessage,
  swap as kitSwap,
  waitForSwap,
  type SwapKitContext,
} from "@circle-fin/swap-kit";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import type { Quote, QuoteParams, RouteAdapter } from "../types";
import { USDC, EURC, isSameToken, type TokenInfo } from "../tokens";
import { QUOTE_TTL_MS } from "../constants";
import { RouteQuoteError } from "./errors";
import { wagmiConfig } from "../../../app/providers";

const EST_GAS = 210_000n; // conservative fixed estimate for ranking only
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function tokenSymbol(t: TokenInfo): string {
  return t.symbol; // 'USDC' | 'EURC' — matches SupportedSwapToken directly
}

let cached: { context: SwapKitContext; adapter: ViemAdapter } | null = null;

/** Lazily build the SDK context + wallet adapter once, per their documented pattern. */
function getKit(client: PublicClient) {
  if (cached) return cached;
  const adapter = new ViemAdapter(
    {
      getPublicClient: () => client,
      // Resolves through wagmi's actual connected connector — not a raw
      // window.ethereum check, which Privy's wallets never populate.
      getWalletClient: async ({ chain }) => {
        try {
          return await getWalletClient(wagmiConfig, { chainId: chain.id });
        } catch {
          throw new Error("No connected wallet available for the Circle route.");
        }
      },
    },
    { addressContext: "user-controlled", supportedChains: [getChainByEnum(Blockchain.Arc_Testnet)] },
  );
  const context = createSwapKitContext();
  cached = { context, adapter };
  return cached;
}

export function circleAdapter(client: PublicClient): RouteAdapter {
  return {
    id: "circle",
    displayName: "Circle",
    status: "ready",

    supports(tokenIn: TokenInfo, tokenOut: TokenInfo) {
      const isUsdcEurc = (a: TokenInfo, b: TokenInfo) =>
        (isSameToken(a, USDC) && isSameToken(b, EURC)) || (isSameToken(a, EURC) && isSameToken(b, USDC));
      return isUsdcEurc(tokenIn, tokenOut);
    },

    async quote(params: QuoteParams): Promise<Quote | null> {
      const { tokenIn, tokenOut, amountIn, slippageBps, recipient } = params;
      if (!this.supports(tokenIn, tokenOut) || amountIn <= 0n) return null;
      // Unlike XyloNet/UnitFlow (pure on-chain view calls), swap-kit's estimate()
      // itself needs to resolve a from-address, so Circle genuinely cannot quote
      // without a connected wallet — this is a real constraint, not a bug, and
      // deserves an honest reason rather than a generic "Quote failed".
      if (!recipient || recipient.toLowerCase() === ZERO_ADDRESS) {
        throw new RouteQuoteError("Connect a wallet to see Circle quotes");
      }

      const { context, adapter } = getKit(client);
      const amountInStr = (Number(amountIn) / 10 ** tokenIn.decimals).toString();

      let est;
      try {
        est = await estimate(context, {
          from: { adapter, chain: Blockchain.Arc_Testnet },
          tokenIn: tokenSymbol(tokenIn),
          tokenOut: tokenSymbol(tokenOut),
          amountIn: amountInStr,
          config: { slippageBps },
        });
      } catch (e) {
        // Surface swap-kit's own message (e.g. a real token-support gap) via
        // its SDK-provided extractor, instead of collapsing to "Quote failed".
        throw new RouteQuoteError(`Circle: ${getErrorMessage(e)}`);
      }

      const outNum = Number(est.estimatedOutput.amount);
      if (!isFinite(outNum) || outNum <= 0) return null;
      const amountOut = BigInt(Math.round(outNum * 10 ** tokenOut.decimals));
      const minOutNum = Number(est.stopLimit.amount);
      const minAmountOut = isFinite(minOutNum)
        ? BigInt(Math.round(minOutNum * 10 ** tokenOut.decimals))
        : (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

      return {
        routeId: "circle",
        amountIn,
        amountOut,
        minAmountOut,
        feeBps: 0, // fee (if any) is embedded server-side in the estimate; nothing separate to surface
        priceImpactBps: 0, // swap-kit does not expose a spot-vs-execution impact figure
        estimatedGas: EST_GAS,
        path: [tokenIn.address, tokenOut.address],
        spender: "0x0000000000000000000000000000000000000000", // swap-kit manages its own allowance strategy
        buildTx: () => {
          throw new Error("Circle route executes via swap-kit — see Quote.kitExecute, not buildTx().");
        },
        kitExecute: async () => {
          const result = await kitSwap(context, {
            from: { adapter, chain: Blockchain.Arc_Testnet },
            tokenIn: tokenSymbol(tokenIn),
            tokenOut: tokenSymbol(tokenOut),
            amountIn: amountInStr,
            to: recipient ? { recipientAddress: recipient } : undefined,
            config: { slippageBps, allowanceStrategy: "approve" },
          });
          // Same-chain swaps usually resolve inline; poll only if still pending.
          const finalResult = result.progress.status === "PENDING" ? await waitForSwap({ result }) : result;
          if (finalResult.progress.status !== "DONE") {
            throw new Error(`Circle swap did not complete: ${finalResult.progress.status}`);
          }
          const realizedOut = "amountOut" in finalResult && finalResult.amountOut
            ? BigInt(Math.round(Number(finalResult.amountOut) * 10 ** tokenOut.decimals))
            : amountOut;
          return { txHash: result.txHash as `0x${string}`, amountOut: realizedOut };
        },
        expiresAt: Date.now() + QUOTE_TTL_MS,
      };
    },
  };
}
