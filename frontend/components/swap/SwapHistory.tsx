// components/swap/SwapHistory.tsx
// History tab (spec §3, rebuilt per Phase F §4). Reads from chain via ArcScan —
// no localStorage. Single-chain, one wallet, one hash: no from/to-chain, no
// sender/recipient, no dual deposit/fill hash, no fill-time — those only exist
// because Pancake/Relay are bridges. Row = Time · From (logo+amount) · arrow ·
// To (logo+amount) · Value (USD) · Tx. Failures render in red with the real
// revert reason where ArcScan has one — never hidden. Open orders stay pinned
// above the list.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { fetchSwapHistory, formatWhen, swapUsdValue, type SwapRecord } from "../../lib/swap/history";
import { useLimitOrders, useOpenOrders } from "../../hooks/useLimitOrders";
import { useTokenPrices } from "../../hooks/useTokenPrices";
import type { OpenOrder } from "../../lib/swap/limitOrders";
import { formatTokenAmount, formatUsd } from "../../lib/swap/format";
import { explorerLink } from "../../lib/arc";
import { EmptyState } from "../UI";
import { TokenIcon } from "./TokenIcon";
import { IconArrowRight, IconExternal, IconSpinner, IconSwap } from "./icons";

const PAGE = 20;

function Row({ r, usdValue }: { r: SwapRecord; usdValue: number | null }) {
  const inSym = r.tokenIn?.symbol ?? "—";
  const outSym = r.tokenOut?.symbol ?? "—";
  const inAmt = r.tokenIn ? formatTokenAmount(r.amountIn, r.tokenIn.decimals) : "—";
  const outAmt = r.tokenOut ? formatTokenAmount(r.amountOut, r.tokenOut.decimals) : "—";

  return (
    <div className="swap-hist-row">
      <div className="swap-hist-line">
        <span className="swap-hist-time">{formatWhen(r.timestamp)}</span>

        <span className="swap-hist-asset">
          {r.tokenIn && <TokenIcon token={r.tokenIn} size={28} />}
          <span className="swap-num swap-hist-amt">
            {inAmt} <span className="swap-hist-sym">{inSym}</span>
          </span>
        </span>

        <IconArrowRight size={14} className="swap-hist-arrow" />

        <span className="swap-hist-asset">
          {r.tokenOut && <TokenIcon token={r.tokenOut} size={28} />}
          <span className="swap-num swap-hist-amt" style={{ color: r.failed ? "var(--red)" : "var(--tx)" }}>
            {outAmt} <span className="swap-hist-sym">{outSym}</span>
          </span>
        </span>

        <span className="swap-num swap-hist-value">{usdValue != null ? formatUsd(usdValue) : "—"}</span>

        <a href={explorerLink("tx", r.txHash)} target="_blank" rel="noopener noreferrer" className="swap-arcscan swap-hist-tx" aria-label="View on ArcScan">
          <IconExternal size={13} />
        </a>
      </div>

      {r.failed && (
        <div className="swap-hist-error">
          <span className="swap-hist-failed">Failed</span>
          {r.errorText}
        </div>
      )}
    </div>
  );
}

function OpenOrderRow({ order, onCancel }: { order: OpenOrder; onCancel: (id: bigint) => void }) {
  const [cancelling, setCancelling] = useState(false);
  const inSym = order.tokenIn?.symbol ?? "—";
  const outSym = order.tokenOut?.symbol ?? "—";
  const inAmt = order.tokenIn ? formatTokenAmount(order.amountIn, order.tokenIn.decimals) : "—";
  const trigger =
    order.tokenIn && order.tokenOut && order.amountIn > 0n
      ? (Number(order.minAmountOut) / 10 ** order.tokenOut.decimals) / (Number(order.amountIn) / 10 ** order.tokenIn.decimals)
      : 0;

  return (
    <div className="swap-hist-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="swap-hist-asset" style={{ gap: 6 }}>
              {order.tokenIn && <TokenIcon token={order.tokenIn} size={20} />}
              <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>{inSym}</span>
            </span>
            <IconArrowRight size={13} className="swap-hist-arrow" />
            <span className="swap-hist-asset" style={{ gap: 6 }}>
              {order.tokenOut && <TokenIcon token={order.tokenOut} size={20} />}
              <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>{outSym}</span>
            </span>
            {order.isExpired && <span className="swap-hist-failed">Expired</span>}
          </div>
          <div className="swap-num" style={{ fontSize: 13, color: "var(--tx2)" }}>
            {inAmt} {inSym} · trigger 1 {inSym} ≥ {trigger.toFixed(4)} {outSym}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <button
            className="swap-max"
            disabled={cancelling}
            onClick={async () => { setCancelling(true); await onCancel(order.id); setCancelling(false); }}
          >
            {cancelling ? <IconSpinner size={11} /> : "Cancel"}
          </button>
          <a href={explorerLink("tx", order.txHash)} target="_blank" rel="noopener noreferrer" className="swap-arcscan" aria-label="View on ArcScan">
            <IconExternal size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}

export function SwapHistory() {
  const { address } = useAccount();
  const { authenticated } = usePrivy();
  const { priceOf } = useTokenPrices();
  const [records, setRecords] = useState<SwapRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE);

  const { orders, load: loadOrders } = useOpenOrders(address);
  const { cancelOrder } = useLimitOrders();

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    try {
      setRecords(await fetchSwapHistory(address));
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : "Could not load history");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); loadOrders(); }, [load, loadOrders]);

  // Live, like ArcScan — this tab only fetches while it's mounted, so the
  // interval naturally stops the moment the user switches away from it.
  useEffect(() => {
    const id = setInterval(() => { load(); loadOrders(); }, 1000);
    return () => clearInterval(id);
  }, [load, loadOrders]);

  const handleCancel = useCallback(
    async (id: bigint) => {
      const ok = await cancelOrder(id);
      if (ok) loadOrders();
    },
    [cancelOrder, loadOrders],
  );

  if (!authenticated || !address) {
    return <div className="swap-empty">Connect a wallet to see your swap history.</div>;
  }

  const nothingYet = !loading && !error && records.length === 0 && orders.length === 0;
  const valueOf = (r: SwapRecord) => swapUsdValue(r, priceOf);

  return (
    <div style={{ marginTop: 4 }}>
      {orders.length > 0 && (
        <>
          <div className="swap-group-label">Open orders</div>
          <div className="swap-card swap-hist-card">
            {orders.map((o) => <OpenOrderRow key={o.id.toString()} order={o} onCancel={handleCancel} />)}
          </div>
        </>
      )}

      {loading && records.length === 0 && (
        <div className="swap-empty"><IconSpinner size={16} /> Loading your swaps…</div>
      )}
      {error && <div className="swap-inline-note err" style={{ marginTop: 16 }}>Could not load history: {error}</div>}
      {nothingYet && (
        <EmptyState
          icon={<IconSwap size={24} />}
          title="No swaps yet."
          desc="Your swaps will appear here, read straight from Arc."
        />
      )}

      {records.length > 0 && (
        <>
          {orders.length > 0 && <div className="swap-group-label">Swaps</div>}
          <div className="swap-card swap-hist-card">
            {records.slice(0, shown).map((r) => <Row key={r.txHash} r={r} usdValue={valueOf(r)} />)}
          </div>
          {shown < records.length && (
            <button className="btn btn-secondary btn-full" style={{ marginTop: 12 }} onClick={() => setShown((s) => s + PAGE)}>
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
