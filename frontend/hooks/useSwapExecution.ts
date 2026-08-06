// hooks/useSwapExecution.ts
// Real execution against wagmi (spec §4.3). Success is reachable from exactly one
// place — a mined receipt with status 'success' — and the displayed amount comes
// from the receipt's Transfer log, not the quote. Approval is the exact amountIn
// and a separate confirmation; a fresh quote is fetched immediately before signing;
// wallet rejection returns quietly to idle.

"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from "wagmi";
import { parseEventLogs } from "viem";
import type { Quote } from "../lib/swap/types";
import type { TokenInfo } from "../lib/swap/tokens";
import { ERC20_ABI } from "../lib/swap/abis";

export type ExecStatus =
  | "idle"
  | "approving"
  | "approve-pending"
  | "re-quoting"
  | "awaiting-signature"
  | "pending"
  | "success"
  | "failed";

export interface ExecState {
  status: ExecStatus;
  txHash: `0x${string}` | null;
  error: string | null;
  /** Realised output parsed from the receipt's Transfer log. */
  realizedOut: bigint | null;
  /**
   * The exact quote that was actually signed, frozen at the moment of signing.
   * The live quote from useQuotes keeps re-quoting (every 15s, or as routes
   * re-rank) while a swap is pending/confirming — reading it directly for the
   * status cards meant the displayed route could silently change mid-flow, or
   * briefly show nothing, if the winner flipped underneath the user. Every
   * post-signature state (pending/success/failed) reads this instead.
   */
  executedQuote: Quote | null;
}

const IDLE: ExecState = { status: "idle", txHash: null, error: null, realizedOut: null, executedQuote: null };

/* eslint-disable @typescript-eslint/no-explicit-any */
function isUserRejection(e: any): boolean {
  const s = (e?.shortMessage || e?.message || "").toLowerCase();
  return (
    e?.name === "UserRejectedRequestError" ||
    e?.cause?.code === 4001 ||
    e?.code === 4001 ||
    s.includes("rejected") ||
    s.includes("denied") ||
    s.includes("user cancel")
  );
}

// A transport/RPC failure (rate-limited, timed out, connection dropped) is a
// completely different failure than an on-chain revert — the transaction
// never reached the chain, vs. the chain rejected it. viem's wrapper errors
// (e.g. ContractFunctionExecutionError) put a generic "the contract function
// ... reverted" in shortMessage even when the underlying cause is transport-
// level, because that message is boilerplate for "the call didn't succeed,"
// not evidence of an actual EVM revert — so shortMessage alone is exactly
// the wrong signal to trust here. Check every layer (top-level and .cause)
// for the concrete transport indicators instead.
function isTransportOrRateLimitError(e: any): boolean {
  if (e?.code === -32005 || e?.cause?.code === -32005) return true;
  const parts = [e?.shortMessage, e?.details, e?.message, e?.cause?.shortMessage, e?.cause?.details, e?.cause?.message]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
  return (
    parts.includes("rate limit") ||
    parts.includes("rate-limit") ||
    parts.includes("rate limited") ||
    parts.includes("too many requests") ||
    parts.includes(" 429") ||
    parts.includes("eth_sendrawtransaction") || // mentioning the RPC method itself means this is a transport-layer report, not a decoded revert reason
    parts.includes("request timed out") ||
    parts.includes("econnreset") ||
    parts.includes("fetch failed") ||
    parts.includes("http request failed")
  );
}

function readableError(e: any): string {
  if (isTransportOrRateLimitError(e)) {
    return "Network is busy (RPC rate limited). Wait a moment and try again.";
  }
  const msg = e?.shortMessage || e?.details || e?.message || "Transaction failed";
  if (/insufficient output|min.*out|slippage|INSUFFICIENT_OUTPUT/i.test(msg)) {
    return "Swap failed: insufficient output amount. The price moved beyond your slippage tolerance. Try again or raise slippage in settings.";
  }
  return `Swap failed: ${msg}`;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useSwapExecution() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<ExecState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  // Approve the EXACT amountIn to the route's spender (spec §4.3 — no MaxUint256).
  const approve = useCallback(
    async (quote: Quote) => {
      if (!client) return;
      // Tracked outside the try so the catch block can tell "the send itself
      // never went through" (hash never assigned — genuinely safe to retry)
      // apart from "it WAS broadcast and something failed afterward" (e.g. a
      // rate-limited receipt poll) — those two cases must not be handled the
      // same way, or a retry can double-submit a transaction that already
      // landed.
      let hash: `0x${string}` | undefined;
      try {
        setState({ status: "approving", txHash: null, error: null, realizedOut: null, executedQuote: quote });
        hash = await writeContractAsync({
          address: quote.path[0],
          abi: ERC20_ABI,
          functionName: "approve",
          args: [quote.spender, quote.amountIn],
        });
        setState({ status: "approve-pending", txHash: hash, error: null, realizedOut: null, executedQuote: quote });
        const rcpt = await client.waitForTransactionReceipt({ hash });
        // Do NOT auto-chain into the swap — return to idle and let the user confirm.
        if (rcpt.status === "success") setState(IDLE);
        else setState({ status: "failed", txHash: hash, error: "Approval failed. Please try again.", realizedOut: null, executedQuote: quote });
      } catch (e) {
        if (isUserRejection(e)) { setState(IDLE); return; }
        if (hash) {
          // Already broadcast — the failure happened while waiting for
          // confirmation (a rate-limited poll is the common case here), not
          // in the send itself. Check the real receipt before reporting
          // anything, so a transaction that actually landed is never shown
          // as "failed," and the hash is never lost.
          try {
            const rcpt = await client.getTransactionReceipt({ hash });
            if (rcpt.status === "success") { setState(IDLE); return; }
            setState({ status: "failed", txHash: hash, error: "Approval failed. Please try again.", realizedOut: null, executedQuote: quote });
          } catch {
            setState({ status: "failed", txHash: hash, error: readableError(e), realizedOut: null, executedQuote: quote });
          }
          return;
        }
        setState({ status: "failed", txHash: null, error: readableError(e), realizedOut: null, executedQuote: quote });
      }
    },
    [client, writeContractAsync],
  );

  const swap = useCallback(
    async (opts: {
      displayed: Quote;
      tokenOut: TokenInfo;
      getFreshQuote: () => Promise<Quote | null>;
    }) => {
      if (!client || !address) return;
      const { displayed, tokenOut, getFreshQuote } = opts;
      // Same rationale as approve() above: only set once sendTransactionAsync
      // actually returns a hash, so the catch block can tell a genuinely
      // unsent attempt (safe to retry) apart from one that was broadcast and
      // then failed while waiting for confirmation (must not be silently
      // retried without checking whether it already landed).
      let hash: `0x${string}` | undefined;
      try {
        // Re-quote immediately before signing; never sign against a stale quote.
        setState({ status: "re-quoting", txHash: null, error: null, realizedOut: null, executedQuote: displayed });
        const fresh = await getFreshQuote();
        if (!fresh) {
          setState({ status: "failed", txHash: null, error: "Could not refresh the quote. Please try again.", realizedOut: null, executedQuote: displayed });
          return;
        }
        if (fresh.amountOut < displayed.minAmountOut) {
          setState({
            status: "failed",
            txHash: null,
            error: "Swap cancelled: the price moved beyond your slippage tolerance. Try again or raise slippage in settings.",
            realizedOut: null,
            executedQuote: displayed,
          });
          return;
        }

        // From here on, `fresh` is the quote that will actually be signed —
        // freeze it in state so every subsequent card (confirm/pending/success)
        // reflects THIS route, not whatever useQuotes has re-ranked to since.
        const executedQuote = fresh;

        // Routes that can't hand back raw calldata (Circle swap-kit) drive
        // their own signing; everything else goes through wagmi directly.
        if (fresh.kitExecute) {
          setState({ status: "awaiting-signature", txHash: null, error: null, realizedOut: null, executedQuote });
          const { txHash, amountOut } = await fresh.kitExecute();
          setState({ status: "success", txHash, error: null, realizedOut: amountOut, executedQuote });
          return;
        }

        const tx = fresh.buildTx();
        setState({ status: "awaiting-signature", txHash: null, error: null, realizedOut: null, executedQuote });
        hash = await sendTransactionAsync({ to: tx.to, data: tx.data, value: tx.value });

        setState({ status: "pending", txHash: hash, error: null, realizedOut: null, executedQuote });
        const rcpt = await client.waitForTransactionReceipt({ hash });
        if (rcpt.status !== "success") {
          setState({ status: "failed", txHash: hash, error: "Swap reverted on-chain. Open the transaction on ArcScan for the reason.", realizedOut: null, executedQuote });
          return;
        }

        // Realised output = sum of tokenOut Transfer logs to the user.
        let realized: bigint | null = null;
        try {
          const logs = parseEventLogs({ abi: ERC20_ABI, eventName: "Transfer", logs: rcpt.logs });
          realized = logs
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((l) => l.address.toLowerCase() === tokenOut.address.toLowerCase() && (l.args as any).to?.toLowerCase() === address.toLowerCase())
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .reduce((sum, l) => sum + ((l.args as any).value as bigint), 0n);
          if (realized === 0n) realized = null;
        } catch {
          /* fall back to the fresh quote's amountOut for display */
        }
        setState({ status: "success", txHash: hash, error: null, realizedOut: realized ?? fresh.amountOut, executedQuote });
      } catch (e) {
        if (isUserRejection(e)) { setState(IDLE); return; }
        if (hash) {
          // Broadcast succeeded (we have a hash) — the failure happened
          // afterward, most commonly a rate-limited receipt poll, not the
          // swap itself failing. Re-check the real receipt before reporting
          // "failed," so a swap that actually landed is never misreported,
          // and the hash is preserved either way (never silently dropped) —
          // that's what lets the UI show it and stops a retry from
          // double-submitting.
          try {
            const rcpt = await client.getTransactionReceipt({ hash });
            if (rcpt.status === "success") {
              let realized: bigint | null = null;
              try {
                const logs = parseEventLogs({ abi: ERC20_ABI, eventName: "Transfer", logs: rcpt.logs });
                realized = logs
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .filter((l) => l.address.toLowerCase() === tokenOut.address.toLowerCase() && (l.args as any).to?.toLowerCase() === address.toLowerCase())
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .reduce((sum, l) => sum + ((l.args as any).value as bigint), 0n);
                if (realized === 0n) realized = null;
              } catch { /* fall back to the displayed quote for the amount */ }
              setState({ status: "success", txHash: hash, error: null, realizedOut: realized ?? displayed.amountOut, executedQuote: displayed });
              return;
            }
            setState({ status: "failed", txHash: hash, error: "Swap reverted on-chain. Open the transaction on ArcScan for the reason.", realizedOut: null, executedQuote: displayed });
          } catch {
            setState({ status: "failed", txHash: hash, error: readableError(e), realizedOut: null, executedQuote: displayed });
          }
          return;
        }
        setState({ status: "failed", txHash: null, error: readableError(e), realizedOut: null, executedQuote: displayed });
      }
    },
    [client, address, sendTransactionAsync],
  );

  return { ...state, approve, swap, reset };
}
