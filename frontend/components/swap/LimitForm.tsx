// components/swap/LimitForm.tsx
// Limit tab (spec §7.5). Wired to the real FluxLimitOrder contract once deployed
// (NEXT_PUBLIC_FLUX_LIMIT_ORDER_ADDRESS set) — approve (exact amount, separate
// confirmation) → createOrder, receipt-verified. Until then, LIMIT_ORDERS_LIVE
// is false and the submit stays a disabled "Coming soon" with honest copy,
// exactly like Phase 1.

"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { USDC, EURC, isSameToken, type TokenInfo } from "../../lib/swap/tokens";
import { useTokenPrices } from "../../hooks/useTokenPrices";
import { useLimitOrders, LIMIT_ORDERS_LIVE } from "../../hooks/useLimitOrders";
import { FLUX_LIMIT_ORDER_ADDRESS } from "../../lib/arc";
import { ERC20_ABI } from "../../lib/swap/abis";
import { formatTokenAmount, parseTokenAmount } from "../../lib/swap/format";
import { AssetPicker } from "./AssetPicker";
import { TokenPill } from "./TokenPill";
import { IconChevronDown, IconFlip, IconSpinner, IconCheck } from "./icons";

type Expiry = "1 Day" | "7 Days" | "30 Days" | "Never";
const EXPIRY_SECONDS: Record<Expiry, number> = {
  "1 Day": 86_400,
  "7 Days": 7 * 86_400,
  "30 Days": 30 * 86_400,
  // The contract requires a real future timestamp (no "never" sentinel) —
  // map to +100 years, the practical equivalent of "does not expire".
  "Never": 100 * 365 * 86_400,
};

export function LimitForm({ onPickingChange }: { onPickingChange?: (picking: boolean) => void }) {
  const { address } = useAccount();
  const { authenticated, login } = usePrivy();

  const [sell, setSell] = useState<TokenInfo>(EURC);
  const [buy, setBuy] = useState<TokenInfo>(USDC);
  const [picking, setPicking] = useState<"sell" | "buy" | null>(null);

  // Hide the overlay heading while the asset picker is open (spec §2.4).
  useEffect(() => { onPickingChange?.(picking !== null); }, [picking, onPickingChange]);

  const { priceOf } = useTokenPrices();
  const sp = priceOf(sell);
  const bp = priceOf(buy);
  const marketRate = sp != null && bp ? sp / bp : 0; // buy per 1 sell, from live pools
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState<Expiry>("7 Days");
  const [summaryOpen, setSummaryOpen] = useState(false);

  const orders = useLimitOrders();

  // Seed the limit price from the live market rate once prices load.
  useEffect(() => { if (!price && marketRate > 0) setPrice(marketRate.toFixed(4)); }, [marketRate, price]);

  const priceNum = parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const estReceive = amountNum * priceNum;
  const diffPct = marketRate > 0 ? ((priceNum - marketRate) / marketRate) * 100 : 0;

  const amountIn = parseTokenAmount(amount || "0", sell.decimals);
  const minAmountOut = parseTokenAmount((estReceive || 0).toFixed(buy.decimals), buy.decimals);

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: sell.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && LIMIT_ORDERS_LIVE ? [address, FLUX_LIMIT_ORDER_ADDRESS] : undefined,
    query: { enabled: !!address && LIMIT_ORDERS_LIVE },
  });
  const allowance = allowanceData as bigint | undefined;
  const needsApproval = LIMIT_ORDERS_LIVE && amountIn > 0n && allowance !== undefined && allowance < amountIn;

  if (picking) {
    return (
      <AssetPicker
        excludeToken={picking === "sell" ? buy : sell}
        onSelect={(t) => {
          if (picking === "sell") setSell(isSameToken(t, buy) ? sell : t);
          else setBuy(isSameToken(t, sell) ? buy : t);
          setPicking(null);
        }}
        onCancel={() => setPicking(null)}
      />
    );
  }

  const setPriceOffset = (pct: number) => setPrice((marketRate * (1 + pct / 100)).toFixed(4));

  // ── Success view ──
  if (orders.status === "success") {
    return (
      <div className="swap-status">
        <span className="swap-status-icon ok"><IconCheck size={22} /></span>
        <div className="swap-status-title">Order created</div>
        <div className="swap-status-sub">
          It will fill once {sell.symbol}/{buy.symbol} reaches your trigger price. Find it under Open orders in the
          History tab, where you can cancel any time.
        </div>
        <button
          className="btn btn-primary btn-full btn-lg"
          style={{ marginTop: 20 }}
          onClick={() => { orders.reset(); setAmount(""); }}
        >
          Create another
        </button>
      </div>
    );
  }

  const handleApprove = async () => {
    await orders.approve(sell.address, amountIn);
    refetchAllowance();
  };

  const handleCreate = () => {
    orders.createOrder({
      tokenIn: sell.address,
      tokenOut: buy.address,
      amountIn,
      minAmountOut,
      expirySec: Math.floor(Date.now() / 1000) + EXPIRY_SECONDS[expiry],
    });
  };

  const busy = orders.status === "approving" || orders.status === "approve-pending" || orders.status === "creating" || orders.status === "pending";

  let btnLabel = "Create order";
  let btnDisabled = false;
  let btnAction = handleCreate;
  let btnSpin = false;

  if (!LIMIT_ORDERS_LIVE) {
    btnLabel = "Coming soon";
    btnDisabled = true;
  } else if (!authenticated) {
    btnLabel = "Connect wallet";
    btnAction = login;
  } else if (amountIn === 0n) {
    btnLabel = "Enter an amount";
    btnDisabled = true;
  } else if (priceNum <= 0) {
    btnLabel = "Enter a price";
    btnDisabled = true;
  } else if (orders.status === "approving" || orders.status === "approve-pending") {
    btnLabel = `Approving ${sell.symbol}…`;
    btnDisabled = true;
    btnSpin = true;
  } else if (needsApproval) {
    btnLabel = `Approve ${sell.symbol}`;
    btnAction = handleApprove;
  } else if (orders.status === "creating" || orders.status === "pending") {
    btnLabel = "Creating order…";
    btnDisabled = true;
    btnSpin = true;
  }

  return (
    <div>
      {/* Allocate (sell) */}
      <div className="swap-card">
        <div className="swap-zone">
          <div className="swap-zone-label">Allocate</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              className="swap-amount-input"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              aria-label="Amount to sell"
            />
            <TokenPill token={sell} onClick={() => setPicking("sell")} />
          </div>
        </div>

        <div className="swap-divider">
          <span className="swap-flip" aria-hidden><IconFlip size={16} /></span>
        </div>

        {/* To buy */}
        <div className="swap-zone">
          <div className="swap-zone-label">To buy</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="swap-amount-input" style={{ color: estReceive ? "var(--tx)" : "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis" }}>
              {estReceive ? formatTokenAmount(estReceive, buy.decimals) : "0"}
            </div>
            <TokenPill token={buy} onClick={() => setPicking("buy")} />
          </div>
          <div className="swap-microline"><span style={{ color: "var(--tx3)" }}>Est. received</span></div>
        </div>
      </div>

      {/* Price block */}
      <div className="swap-card" style={{ marginTop: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>
            When 1 <span style={{ color: "var(--tx)", fontWeight: 700 }}>{sell.symbol}</span> is worth
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            className="swap-amount-input"
            style={{ fontSize: 26 }}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-label="Limit price"
          />
          <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, color: "var(--tx)" }}>{buy.symbol}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--tx3)" }}>
            Market <span className="swap-num" style={{ color: "var(--tx2)" }}>{marketRate.toFixed(4)}</span>
            {priceNum > 0 && (
              <span className="swap-num" style={{ marginLeft: 8, color: diffPct >= 0 ? "var(--green)" : "var(--amber)" }}>
                {diffPct >= 0 ? "+" : "−"}{Math.abs(diffPct).toFixed(2)}%
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="swap-quick" onClick={() => setPriceOffset(-1)}>−1%</button>
            <button className="swap-quick" onClick={() => setPriceOffset(-5)}>−5%</button>
            <button className="swap-quick" onClick={() => setPrice(marketRate.toFixed(4))}>Market</button>
          </div>
        </div>
      </div>

      {/* Expiry */}
      <div className="swap-detail-row" style={{ marginTop: 14 }}>
        <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Expiry</span>
        <div className="swap-select">
          <select value={expiry} onChange={(e) => setExpiry(e.target.value as Expiry)} aria-label="Order expiry">
            <option>1 Day</option><option>7 Days</option><option>30 Days</option><option>Never</option>
          </select>
          <IconChevronDown size={14} />
        </div>
      </div>

      {/* Summary strip */}
      <div className="swap-summary">
        Swap {amount || "0"} {sell.symbol} for {buy.symbol} when 1 {sell.symbol} ≥ {price || "0"} {buy.symbol}.
        {expiry !== "Never" ? ` Expires in ${expiry.toLowerCase()}.` : " Never expires."}
      </div>

      {/* Order summary accordion */}
      <button className="swap-accordion" onClick={() => setSummaryOpen((o) => !o)}>
        <span>Order summary</span>
        <IconChevronDown size={16} style={{ transform: summaryOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {summaryOpen && (
        <div className="swap-detail-list" style={{ padding: "4px 2px" }}>
          <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Trigger price</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>{price || "0"} {buy.symbol}</span></div>
          <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>You sell</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>{amount || "0"} {sell.symbol}</span></div>
          <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>You receive (est.)</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>{formatTokenAmount(estReceive, buy.decimals)} {buy.symbol}</span></div>
          <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Expiry</span><span style={{ fontSize: 13, color: "var(--tx)" }}>{expiry}</span></div>
          <div className="swap-detail-row"><span style={{ fontSize: 13, color: "var(--tx2)" }}>Protocol fee</span><span className="swap-num" style={{ fontSize: 13, color: "var(--tx)" }}>0.00%</span></div>
        </div>
      )}

      {orders.error && <div className="swap-inline-note err" style={{ marginTop: 12 }}>{orders.error}</div>}

      <button className="btn btn-primary btn-full btn-lg" disabled={btnDisabled} onClick={btnAction} style={{ marginTop: 16, display: "flex", gap: 8 }}>
        {btnSpin && <IconSpinner size={15} />}
        {btnLabel}
      </button>

      {!LIMIT_ORDERS_LIVE ? (
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--tx3)", marginTop: 10, lineHeight: 1.5 }}>
          Limit orders settle through an on-chain escrow filled by a keeper when your price is met. The contract is
          built and tested — it goes live here once deployed. The market swap is live now.
        </p>
      ) : busy && orders.txHash ? (
        <p className="swap-exec-helper">
          {orders.status === "approve-pending" || orders.status === "pending" ? "Waiting for confirmation…" : "Confirm in your wallet…"}
        </p>
      ) : null}
    </div>
  );
}
