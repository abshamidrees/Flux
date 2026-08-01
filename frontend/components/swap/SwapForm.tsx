// components/swap/SwapForm.tsx
// Market swap form (spec §7.2) on the REAL route layer. Quotes come from live
// adapters; execution is receipt-verified (hooks/useSwapExecution). Allowance is
// read on-chain and drives a separate Approve step; Max reserves a gas buffer when
// selling USDC (Arc pays gas in USDC).

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import type { RouteId } from "../../lib/swap/types";
import { USDC, EURC, isSameToken, type TokenInfo } from "../../lib/swap/tokens";
import { ERC20_ABI } from "../../lib/swap/abis";
import { useTokenBalances } from "../../hooks/useTokenBalances";
import { useTokenPrices } from "../../hooks/useTokenPrices";
import { useQuotes } from "../../hooks/useQuotes";
import { useSwapExecution } from "../../hooks/useSwapExecution";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { parseTokenAmount, formatTokenAmount, formatUsd } from "../../lib/swap/format";
import { AmountField } from "./AmountField";
import { AssetPicker } from "./AssetPicker";
import { DetailRows } from "./DetailRows";
import { RouteBreakdown } from "./RouteBreakdown";
import { PriceImpactWarning } from "./PriceImpactWarning";
import { LossConfirmModal } from "./LossConfirmModal";
import { SwapStatus } from "./SwapStatus";
import { IconFlip, IconChevronDown, IconSpinner } from "./icons";

const ROUTE_NAMES: Record<RouteId, string> = { xylonet: "XyloNet", synthra: "Synthra", unitflow: "UnitFlow", circle: "Circle" };

export function SwapForm({
  slippageBps,
  setSlippageBps,
  enabledRoutes,
  deadlineMins,
  onPickingChange,
}: {
  slippageBps: number;
  setSlippageBps: (bps: number) => void;
  enabledRoutes: Set<RouteId>;
  deadlineMins: number;
  onPickingChange?: (picking: boolean) => void;
}) {
  const { address } = useAccount();
  const { authenticated, login } = usePrivy();
  const { balanceOf } = useTokenBalances();
  const { priceOf } = useTokenPrices();

  const [sell, setSell] = useState<TokenInfo>(EURC);
  const [buy, setBuy] = useState<TokenInfo>(USDC);
  const [picking, setPicking] = useState<"sell" | "buy" | null>(null);

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"token" | "usd">("token");

  const [pinnedRoute, setPinnedRoute] = useState<RouteId | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [impactAck, setImpactAck] = useState(false);
  const [showLossModal, setShowLossModal] = useState(false);

  const exec = useSwapExecution();

  // Derive the token amount from the input, honouring USD-entry mode.
  const sellPrice = priceOf(sell);
  const tokenAmountStr = mode === "usd" && sellPrice ? (Number(input) / sellPrice).toString() : input;
  const amountIn = useMemo(() => parseTokenAmount(tokenAmountStr || "0", sell.decimals), [tokenAmountStr, sell.decimals]);
  // Every keystroke updates the field and the USD conversion instantly; only the
  // value that triggers RPC reads (quoting) waits for a pause in typing, so a
  // burst of keystrokes doesn't fire a fresh multi-route quote per character and
  // starve the balance multicall for RPC budget.
  const debouncedAmountIn = useDebouncedValue(amountIn, 300);

  const { loading, ranked, failures, selected, pinnedFellBack, quoteRoute, gasPriceUsdc } = useQuotes({
    tokenIn: sell,
    tokenOut: buy,
    amountIn: debouncedAmountIn,
    slippageBps,
    recipient: address,
    enabledRoutes,
    pinnedRoute,
  });

  const quote = selected?.quote ?? null;
  const outNum = quote ? Number(quote.amountOut) / 10 ** buy.decimals : 0;
  const impactPct = quote ? quote.priceImpactBps / 100 : 0;

  // On-chain allowance for the selected route's spender (USDC needs it too).
  // Routes with kitExecute (Circle) manage their own allowance internally —
  // no separate spender to check or approve.
  const usesOwnAllowance = !!quote?.kitExecute;
  const spender = quote?.spender;
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: sell.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    query: { enabled: !!address && !!spender && !usesOwnAllowance },
  });
  const allowance = allowanceData as bigint | undefined;
  const needsApproval = !usesOwnAllowance && !!quote && amountIn > 0n && allowance !== undefined && allowance < amountIn;

  const sellBal = balanceOf(sell).formatted; // null while unresolved — never treated as 0
  const sellTokenAmount = Number(tokenAmountStr) || 0;
  // While the balance is still unknown, never claim it's insufficient — that's a
  // false negative worse than a brief wait.
  const insufficient = sellBal !== null && sellTokenAmount > sellBal;

  // Reset the tier-2 acknowledgement when impact drops back down.
  useEffect(() => { if (impactPct <= 5) setImpactAck(false); }, [impactPct]);
  // Hide the overlay heading while the asset picker is open (spec §2.4).
  useEffect(() => { onPickingChange?.(picking !== null); }, [picking, onPickingChange]);

  // Microline converted values.
  const sellUsd = sellPrice != null ? sellTokenAmount * sellPrice : null;
  const sellConverted =
    mode === "usd"
      ? `${formatTokenAmount(sellTokenAmount, sell.decimals)} ${sell.symbol}`
      : sellUsd != null ? formatUsd(sellUsd) : "—";
  const buyPrice = priceOf(buy);
  const buyUsd = buyPrice != null ? outNum * buyPrice : null;

  const flip = () => { setSell(buy); setBuy(sell); setInput(""); setPinnedRoute(null); };

  const onPickToken = (t: TokenInfo) => {
    if (picking === "sell") { if (isSameToken(t, buy)) setBuy(sell); setSell(t); }
    else { if (isSameToken(t, sell)) setSell(buy); setBuy(t); }
    setPicking(null);
    setPinnedRoute(null);
    setMode("token");
  };

  const onMax = () => {
    if (sellBal === null) return; // guarded by the disabled Max button too
    setMode("token");
    // Gas is paid in Arc's separate native token, so the full USDC balance is usable.
    setInput(sellBal > 0 ? String(sellBal) : "");
  };

  const runSwap = () => {
    if (!quote || !address) return;
    const deadlineSec = Math.floor(Date.now() / 1000) + deadlineMins * 60;
    exec.swap({
      displayed: quote,
      tokenOut: buy,
      getFreshQuote: () => quoteRoute(quote.routeId, address, deadlineSec),
    });
  };

  const doSwap = () => {
    // Tier 3 (>15% impact) requires the typed confirmation first (spec §7.7).
    if (impactPct > 15) { setShowLossModal(true); return; }
    runSwap();
  };

  const handleApprove = async () => {
    if (!quote) return;
    await exec.approve(quote);
    refetchAllowance();
  };

  // ── Post-submit view replaces the form (spec §7.6 states 1-6, Phase F §6) ──
  // Every phase of the execution state machine — not just the terminal ones —
  // gets its own centred card instead of the form staying visible underneath.
  const EXEC_TO_PHASE: Partial<Record<typeof exec.status, "approving" | "confirming" | "pending" | "success" | "error">> = {
    approving: "approving",
    "approve-pending": "approving",
    "re-quoting": "confirming",
    "awaiting-signature": "confirming",
    pending: "pending",
    success: "success",
    failed: "error",
  };
  const phase = EXEC_TO_PHASE[exec.status];
  if (phase) {
    // Once a quote has been signed (or is about to be), the card must show
    // THAT route forever after — never the live, still-re-ranking quote.
    const effectiveQuote = exec.executedQuote ?? quote;
    return (
      <SwapStatus
        status={phase}
        execStatus={exec.status}
        txHash={exec.txHash}
        error={exec.error}
        quote={effectiveQuote}
        realizedOut={exec.realizedOut}
        tokenIn={sell}
        tokenOut={buy}
        sellAmountDisplay={formatTokenAmount(sellTokenAmount, sell.decimals)}
        routeName={effectiveQuote ? ROUTE_NAMES[effectiveQuote.routeId] : "—"}
        routeId={effectiveQuote?.routeId ?? null}
        onSwapAgain={() => { exec.reset(); setInput(""); setImpactAck(false); }}
      />
    );
  }

  if (picking) {
    return (
      <AssetPicker
        excludeToken={picking === "sell" ? buy : sell}
        onSelect={onPickToken}
        onCancel={() => setPicking(null)}
      />
    );
  }

  // ── Primary button state (spec §7.2 — disabled states always say why) ──
  // Note: approving/approve-pending/re-quoting/awaiting-signature all return
  // early via the status card above, so the button never actually renders in
  // those states — the branches below only cover states where the form itself
  // is still on screen.
  let btnLabel = "Swap";
  let btnDisabled = false;
  let btnAction: () => void = doSwap;

  if (!authenticated) { btnLabel = "Connect wallet"; btnAction = login; }
  else if (enabledRoutes.size === 0) { btnLabel = "Enable a route in settings"; btnDisabled = true; }
  else if (amountIn === 0n) { btnLabel = "Enter an amount"; btnDisabled = true; }
  else if (insufficient) { btnLabel = `Insufficient ${sell.symbol} balance`; btnDisabled = true; }
  else if (loading && !quote) { btnLabel = "Finding best route…"; btnDisabled = true; }
  else if (!quote) { btnLabel = "No route for this pair"; btnDisabled = true; }
  else if (needsApproval) { btnLabel = `Approve ${sell.symbol}`; btnAction = handleApprove; }
  else if (impactPct > 5 && impactPct <= 15 && !impactAck) { btnLabel = "Swap"; btnDisabled = true; }

  const routesLabel = pinnedRoute ? `Route: ${ROUTE_NAMES[pinnedRoute]}` : "Routes: Auto";

  return (
    <div>
      {/* Sell / Receive card */}
      <div className="swap-card">
        <AmountField
          label="Sell"
          token={sell}
          onPickToken={() => setPicking("sell")}
          value={input}
          onChange={setInput}
          mode={mode}
          onToggleMode={sellPrice != null ? () => { setMode(mode === "token" ? "usd" : "token"); setInput(""); } : undefined}
          convertedLabel={sellConverted}
          // undefined (no wallet — nothing to show) vs null (connected, still
          // resolving — skeleton) vs a number (confirmed, incl. a real zero).
          balance={address ? sellBal : undefined}
          onMax={onMax}
        />

        <div className="swap-divider">
          <button type="button" className="swap-flip" onClick={flip} aria-label="Flip sell and receive">
            <IconFlip size={16} />
          </button>
        </div>

        <AmountField
          label="Receive"
          token={buy}
          onPickToken={() => setPicking("buy")}
          value={quote ? formatTokenAmount(outNum, buy.decimals) : ""}
          readOnly
          mode="token"
          convertedLabel={buyUsd != null ? formatUsd(buyUsd) : "—"}
          loading={loading}
        />
      </div>

      {/* Routes link */}
      <button type="button" className="swap-routes-link" onClick={() => setShowRoutes((s) => !s)}>
        {loading && !quote ? <IconSpinner size={13} /> : null}
        <span>{routesLabel}</span>
        <IconChevronDown size={14} style={{ transform: showRoutes ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {pinnedFellBack && (
        <div className="swap-inline-note warn" style={{ marginTop: 8 }}>
          Your pinned route has no quote for this pair — using the best available instead.
        </div>
      )}
      {showRoutes && (
        <RouteBreakdown
          ranked={ranked}
          failures={failures}
          tokenOut={buy}
          gasPriceUsdc={gasPriceUsdc}
          pinnedRoute={pinnedRoute}
          onPin={(id) => { setPinnedRoute(id); setShowRoutes(false); }}
        />
      )}

      {/* Advanced → Max slippage */}
      <button type="button" className="swap-accordion" onClick={() => setShowAdvanced((s) => !s)}>
        <span>Advanced</span>
        <IconChevronDown size={16} style={{ transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {showAdvanced && (
        <div className="swap-detail-row" style={{ paddingTop: 4 }}>
          <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Max slippage</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className={`swap-quick ${slippageBps === 50 ? "is-active" : ""}`} onClick={() => setSlippageBps(50)}>Auto</button>
            <div className="swap-preset-custom is-active" style={{ width: 90 }}>
              <input
                inputMode="decimal"
                value={(slippageBps / 100).toString()}
                onChange={(e) => { const p = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); if (!isNaN(p)) setSlippageBps(Math.round(p * 100)); }}
                aria-label="Max slippage percent"
              />
              <span>%</span>
            </div>
          </div>
        </div>
      )}

      {/* Detail rows */}
      {quote && <DetailRows quote={quote} tokenIn={sell} tokenOut={buy} gasPriceUsdc={gasPriceUsdc} />}

      {/* Tier-2 price-impact warning */}
      {quote && impactPct > 5 && impactPct <= 15 && (
        <PriceImpactWarning impactPct={impactPct} checked={impactAck} onChange={setImpactAck} />
      )}

      {/* Summary strip */}
      {quote && amountIn > 0n && (
        <div className="swap-summary">
          Swap {formatTokenAmount(sellTokenAmount, sell.decimals)} {sell.symbol} for{" "}
          {formatTokenAmount(outNum, buy.decimals)} {buy.symbol} via {ROUTE_NAMES[quote.routeId]}.
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn btn-secondary btn-full" onClick={() => { exec.reset(); setInput(""); }}>Cancel</button>
        <button className="btn btn-primary btn-full btn-lg" disabled={btnDisabled} onClick={btnAction}>
          {btnLabel}
        </button>
      </div>

      {/* Tier-3 typed confirmation */}
      {showLossModal && quote && (
        <LossConfirmModal
          quote={quote}
          tokenIn={sell}
          tokenOut={buy}
          onCancel={() => setShowLossModal(false)}
          onConfirm={() => { setShowLossModal(false); runSwap(); }}
        />
      )}
    </div>
  );
}
