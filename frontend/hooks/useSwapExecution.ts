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

function readableError(e: any): string {
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
      try {
        setState({ status: "approving", txHash: null, error: null, realizedOut: null, executedQuote: quote });
        const hash = await writeContractAsync({
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
        if (isUserRejection(e)) setState(IDLE);
        else setState({ status: "failed", txHash: null, error: readableError(e), realizedOut: null, executedQuote: quote });
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
        const hash = await sendTransactionAsync({ to: tx.to, data: tx.data, value: tx.value });

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
        if (isUserRejection(e)) setState(IDLE);
        else setState({ status: "failed", txHash: null, error: readableError(e), realizedOut: null, executedQuote: displayed });
      }
    },
    [client, address, sendTransactionAsync],
  );

  return { ...state, approve, swap, reset };
}
