// components/swap/DetailRows.tsx
// Flat list of detail rows (spec §7.2.7). Labels are dotted-underline hover
// tooltips (reusing components/UI Tooltip — Flux convention, not info-circles).

"use client";

import type { Quote } from "../../lib/swap/types";
import type { TokenInfo } from "../../lib/swap/tokens";
import { Tooltip } from "../UI";
import { formatTokenAmount, formatUsd, formatPercent } from "../../lib/swap/format";

function Row({ label, tip, children }: { label: string; tip: string; children: React.ReactNode }) {
  return (
    <div className="swap-detail-row">
      <Tooltip text={tip}>
        <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>{label}</span>
      </Tooltip>
      <span className="swap-num" style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{children}</span>
    </div>
  );
}

export function DetailRows({
  quote,
  tokenIn,
  tokenOut,
  gasPriceUsdc,
}: {
  quote: Quote;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  gasPriceUsdc: number;
}) {
  const inNum = Number(quote.amountIn) / 10 ** tokenIn.decimals;
  const outNum = Number(quote.amountOut) / 10 ** tokenOut.decimals;
  const minNum = Number(quote.minAmountOut) / 10 ** tokenOut.decimals;
  const rate = inNum > 0 ? outNum / inNum : 0;
  const impactPct = quote.priceImpactBps / 100;
  const netFeeUsd = Number(quote.estimatedGas) * gasPriceUsdc;

  const impactColor = impactPct > 5 ? "var(--red)" : impactPct > 1 ? "var(--amber)" : "var(--tx)";

  return (
    <div className="swap-detail-list">
      <Row label="Max sent" tip="The maximum amount that will be sent after slippage and fees.">
        {formatTokenAmount(inNum, tokenIn.decimals)} {tokenIn.symbol}
      </Row>
      <Row label="Min received" tip="The least you will receive after slippage. The swap reverts below this.">
        {formatTokenAmount(minNum, tokenOut.decimals)} {tokenOut.symbol}
      </Row>
      <Row label="Rate" tip="The effective exchange rate for this quote, including the route fee.">
        1 {tokenIn.symbol} = {formatTokenAmount(rate, tokenOut.decimals)} {tokenOut.symbol}
      </Row>
      <div className="swap-detail-row">
        <Tooltip text="How much this trade moves the pool price versus the mid-market rate.">
          <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Price impact</span>
        </Tooltip>
        <span className="swap-num" style={{ fontSize: 13, fontWeight: 600, color: impactColor }}>
          −{formatPercent(impactPct)}
        </span>
      </div>
      <Row label="Network fee" tip="Estimated gas for this swap, paid in Arc's native token (≈ USD).">
        {netFeeUsd > 0 && netFeeUsd < 0.01 ? "< $0.01" : `~${formatUsd(netFeeUsd)}`}
      </Row>
    </div>
  );
}
