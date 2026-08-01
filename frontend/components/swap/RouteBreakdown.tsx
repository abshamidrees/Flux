// components/swap/RouteBreakdown.tsx
// Route breakdown panel (spec §7.3). One row per route; ready rows expand to show
// fee / price impact / gas / path. Selecting a ready row pins it. "Auto" unpins.

"use client";

import { useState } from "react";
import type { RankedQuote, RouteFailure, RouteId } from "../../lib/swap/types";
import type { TokenInfo } from "../../lib/swap/tokens";
import { tokenByAddress } from "../../lib/swap/tokens";
import { formatTokenAmount, formatUsd, formatSignedPercent, formatPercent, shortAddress } from "../../lib/swap/format";
import { IconChevronDown } from "./icons";
import { RouteIcon } from "./RouteIcon";

function ReadyRow({
  ranked,
  tokenOut,
  gasPriceUsdc,
  isSelected,
  onPin,
}: {
  ranked: RankedQuote;
  tokenOut: TokenInfo;
  gasPriceUsdc: number;
  isSelected: boolean;
  onPin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const q = ranked.quote;
  const outNum = Number(q.amountOut) / 10 ** tokenOut.decimals;
  const gasUsd = Number(q.estimatedGas) * gasPriceUsdc;

  return (
    <div className={`swap-route-row ${isSelected ? "is-selected" : ""}`}>
      <button type="button" className="swap-route-main" onClick={onPin}>
        <RouteIcon routeId={q.routeId} size={20} />
        <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx)", flex: 1, textAlign: "left" }}>
          {routeName(q.routeId)}
        </span>
        <span className="swap-num" style={{ fontSize: 14, color: "var(--tx)", fontWeight: 600 }}>
          {formatTokenAmount(outNum, tokenOut.decimals)} {tokenOut.symbol}
        </span>
        {ranked.isBest ? (
          <span className="swap-best-badge">Best</span>
        ) : (
          <span className="swap-num" style={{ fontSize: 12, color: "var(--tx3)", minWidth: 52, textAlign: "right" }}>
            {formatSignedPercent(ranked.deltaBps / 100)}
          </span>
        )}
      </button>
      <button type="button" className="swap-route-expand" onClick={() => setOpen((o) => !o)} aria-label="Route details">
        <IconChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div className="swap-route-detail">
          <div><span>Route fee</span><span className="swap-num">{formatPercent(q.feeBps / 100)}</span></div>
          <div><span>Price impact</span><span className="swap-num">−{formatPercent(q.priceImpactBps / 100)}</span></div>
          <div><span>Est. gas</span><span className="swap-num">~{formatUsd(gasUsd)}</span></div>
          <div>
            <span>Path</span>
            <span className="swap-num" style={{ fontSize: 11 }}>
              {q.path.map((a) => tokenByAddress(a)?.symbol ?? shortAddress(a)).join(" → ")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function routeName(id: RouteId): string {
  return { xylonet: "XyloNet", synthra: "Synthra", unitflow: "UnitFlow", circle: "Circle" }[id];
}

export function RouteBreakdown({
  ranked,
  failures,
  tokenOut,
  gasPriceUsdc,
  pinnedRoute,
  onPin,
}: {
  ranked: RankedQuote[];
  failures: RouteFailure[];
  tokenOut: TokenInfo;
  gasPriceUsdc: number;
  pinnedRoute: RouteId | null;
  onPin: (id: RouteId | null) => void;
}) {
  return (
    <div className="swap-route-panel">
      <button
        type="button"
        className={`swap-route-auto ${pinnedRoute === null ? "is-selected" : ""}`}
        onClick={() => onPin(null)}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--tx)" }}>Auto</span>
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>Best net output wins</span>
      </button>

      {ranked.map((r) => (
        <ReadyRow
          key={r.quote.routeId}
          ranked={r}
          tokenOut={tokenOut}
          gasPriceUsdc={gasPriceUsdc}
          isSelected={pinnedRoute === r.quote.routeId}
          onPin={() => onPin(r.quote.routeId)}
        />
      ))}

      {failures.map((f) => (
        <div key={f.routeId} className="swap-route-row is-disabled">
          <div className="swap-route-main" style={{ cursor: "not-allowed" }}>
            <RouteIcon routeId={f.routeId} size={20} />
            <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx3)", flex: 1, textAlign: "left" }}>
              {f.displayName}
            </span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>{f.reason}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
