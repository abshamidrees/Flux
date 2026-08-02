// components/swap/SwapStatus.tsx
// Post-submit card replacement (spec §7.6 states 1-6; Phase F §6 live cards).
// Every phase of the execution state machine gets its own centred card instead
// of the form staying visible with just a helper line — approve, confirm,
// pending, success, failure. Every transaction surfaces an ArcScan link the
// instant it exists. Errors state what failed + next step. Success is reached
// only via the receipt-verified state already enforced in useSwapExecution.

"use client";

import Link from "next/link";
import type { Quote, RouteId } from "../../lib/swap/types";
import type { TokenInfo } from "../../lib/swap/tokens";
import { explorerLink } from "../../lib/arc";
import { formatTokenAmount } from "../../lib/swap/format";
import { IconCheck, IconAlert, IconExternal, IconSpinner, IconArrowRight } from "./icons";
import { RouteIcon } from "./RouteIcon";

function ArcScanLink({ hash }: { hash: string }) {
  return (
    <a href={explorerLink("tx", hash)} target="_blank" rel="noopener noreferrer" className="swap-arcscan">
      <span className="swap-num">{hash.slice(0, 10)}…{hash.slice(-8)}</span>
      <IconExternal size={13} />
    </a>
  );
}

function IndeterminateBar() {
  return (
    <div className="swap-prog-track" aria-hidden>
      <div className="swap-prog-indeterminate" />
    </div>
  );
}

export type SwapStatusPhase = "approving" | "confirming" | "pending" | "success" | "error";

export function SwapStatus({
  status,
  execStatus,
  txHash,
  error,
  quote,
  realizedOut,
  tokenIn,
  tokenOut,
  sellAmountDisplay,
  routeName,
  routeId,
  onSwapAgain,
}: {
  status: SwapStatusPhase;
  /** The raw useSwapExecution status, to distinguish sub-phases within a card. */
  execStatus?: string;
  txHash: `0x${string}` | null;
  error: string | null;
  quote: Quote | null;
  /** Realised output from the receipt's Transfer log (preferred over the estimate). */
  realizedOut?: bigint | null;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  /** Formatted sell-side amount for the Approve/Confirm summary lines. */
  sellAmountDisplay: string;
  routeName: string;
  routeId: RouteId | null;
  onSwapAgain: () => void;
}) {
  const outNum =
    realizedOut != null
      ? Number(realizedOut) / 10 ** tokenOut.decimals
      : quote ? Number(quote.amountOut) / 10 ** tokenOut.decimals : 0;
  const inNum = quote ? Number(quote.amountIn) / 10 ** tokenIn.decimals : 0;
  const rate = inNum > 0 ? outNum / inNum : 0;
  const minOutDisplay = quote ? formatTokenAmount(Number(quote.minAmountOut) / 10 ** tokenOut.decimals, tokenOut.decimals) : null;

  if (status === "approving") {
    const minedWait = execStatus === "approve-pending";
    return (
      <div className="swap-status">
        <span className="swap-status-icon pending"><IconSpinner size={22} /></span>
        <div className="swap-status-title">Approve {tokenIn.symbol}</div>
        <div className="swap-status-sub">Approving spend for this swap</div>
        <p className="swap-status-wallet">{minedWait ? "Approval submitted — waiting for confirmation…" : "Proceed in your wallet."}</p>
        {txHash && <div style={{ marginTop: 12 }}><ArcScanLink hash={txHash} /></div>}
        <IndeterminateBar />
      </div>
    );
  }

  if (status === "confirming") {
    const checkingPrice = execStatus === "re-quoting";
    return (
      <div className="swap-status">
        <span className="swap-status-icon pending"><IconSpinner size={22} /></span>
        <div className="swap-status-title">Confirm swap</div>
        {quote && (
          <div className="swap-status-summary">
            <span>{sellAmountDisplay} {tokenIn.symbol}</span>
            <IconArrowRight size={13} style={{ color: "var(--tx3)" }} />
            <span>{formatTokenAmount(outNum, tokenOut.decimals)} {tokenOut.symbol}</span>
            {minOutDisplay && <span style={{ color: "var(--tx3)" }}>(min {minOutDisplay})</span>}
          </div>
        )}
        <p className="swap-status-wallet">{checkingPrice ? "Fetching the latest price…" : "Proceed in your wallet."}</p>
        <IndeterminateBar />
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="swap-status">
        <span className="swap-status-icon pending"><IconSpinner size={22} /></span>
        <div className="swap-status-title">Swap submitted</div>
        <div className="swap-status-sub">Your swap is being confirmed on Arc.</div>
        {txHash && <div style={{ marginTop: 16 }}><ArcScanLink hash={txHash} /></div>}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="swap-status">
        <span className="swap-status-icon err"><IconAlert size={22} /></span>
        <div className="swap-status-title">Swap failed</div>
        <div className="swap-status-sub">{error ?? "Something went wrong. Please try again."}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
          <button className="btn btn-primary btn-sm" onClick={onSwapAgain}>Try again</button>
        </div>
      </div>
    );
  }

  // success
  return (
    <div className="swap-status">
      <span className="swap-status-icon ok"><IconCheck size={22} /></span>
      <div className="swap-status-title">Swapped</div>
      <div className="swap-status-sub">
        You received{" "}
        <span className="swap-num" style={{ color: "var(--tx)", fontWeight: 700 }}>
          {formatTokenAmount(outNum, tokenOut.decimals)} {tokenOut.symbol}
        </span>
      </div>

      <div className="swap-detail-list" style={{ textAlign: "left", marginTop: 18, background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 10, padding: "6px 14px" }}>
        <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Effective rate</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>1 {tokenIn.symbol} = {formatTokenAmount(rate, tokenOut.decimals)} {tokenOut.symbol}</span></div>
        <div className="swap-detail-row">
          <span style={{ fontSize: 13, color: "var(--tx2)" }}>Route</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tx)", fontWeight: 600 }}>
            {routeId && <RouteIcon routeId={routeId} size={16} />}
            {routeName}
          </span>
        </div>
        {txHash && <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Transaction</span><ArcScanLink hash={txHash} /></div>}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button className="btn btn-secondary btn-full" onClick={onSwapAgain}>Swap again</button>
        <Link href="/" className="btn btn-primary btn-full" style={{ textDecoration: "none" }}>Back to dashboard</Link>
      </div>
    </div>
  );
}
