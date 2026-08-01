// components/swap/LossConfirmModal.tsx
// Tier 3 guard (spec §7.7, >15%): a separate modal that blocks execution behind a
// typed confirmation. Continue is disabled until the string matches exactly.

"use client";

import { useState } from "react";
import type { Quote } from "../../lib/swap/types";
import type { TokenInfo } from "../../lib/swap/tokens";
import { formatTokenAmount, formatPercent } from "../../lib/swap/format";
import { IconAlert } from "./icons";

const PHRASE = "I will lose money";

export function LossConfirmModal({
  quote,
  tokenIn,
  tokenOut,
  onCancel,
  onConfirm,
}: {
  quote: Quote;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === PHRASE;

  const inNum = Number(quote.amountIn) / 10 ** tokenIn.decimals;
  const minNum = Number(quote.minAmountOut) / 10 ** tokenOut.decimals;
  const outNum = Number(quote.amountOut) / 10 ** tokenOut.decimals;
  const rate = inNum > 0 ? outNum / inNum : 0;
  const impactPct = quote.priceImpactBps / 100;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div className="modal-body" style={{ paddingTop: 24 }}>
          <span className="swap-impact-icon" style={{ width: 40, height: 40 }}>
            <IconAlert size={22} />
          </span>
          <h3 style={{ fontFamily: "'Manrope',sans-serif", fontSize: 19, fontWeight: 800, color: "var(--tx)", margin: "16px 0 8px" }}>
            This swap will result in a significant loss in value.
          </h3>
          <p style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.6, marginBottom: 18 }}>
            This swap has very low liquidity, resulting in a large price difference. You will receive significantly
            less than the current market value.
          </p>

          <div className="swap-detail-list" style={{ background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 10, padding: "6px 14px", marginBottom: 18 }}>
            <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Max sent</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>{formatTokenAmount(inNum, tokenIn.decimals)} {tokenIn.symbol}</span></div>
            <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Min received</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>{formatTokenAmount(minNum, tokenOut.decimals)} {tokenOut.symbol}</span></div>
            <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Rate</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>1 {tokenIn.symbol} = {formatTokenAmount(rate, tokenOut.decimals)} {tokenOut.symbol}</span></div>
            <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Price difference</span><span className="swap-num" style={{ fontSize: 13, color: "var(--red)" }}>−{formatPercent(impactPct)}</span></div>
          </div>

          <label style={{ display: "block", fontSize: 13, color: "var(--tx2)", fontWeight: 600, marginBottom: 8 }}>
            Type &ldquo;{PHRASE}&rdquo; to continue
          </label>
          <input
            className="swap-text-input"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={PHRASE}
            aria-label={`Type ${PHRASE} to continue`}
          />
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger btn-sm" disabled={!match} onClick={onConfirm}>
            I understand, continue
          </button>
        </div>
      </div>
    </div>
  );
}
