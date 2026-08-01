// components/swap/SwapOverlay.tsx
// Full-screen overlay chrome (spec §4/§7). Close × flush top-left, wallet chip
// flush top-right (§2.3), single centred ~520px column. While the asset picker is
// open the heading/tabs are hidden so only one "Swap" title shows (§2.4).

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import type { RouteId } from "../../lib/swap/types";
import { shortAddress } from "../../lib/swap/format";
import { SwapStyles } from "./styles";
import { SwapForm } from "./SwapForm";
import { LimitForm } from "./LimitForm";
import { SwapHistory } from "./SwapHistory";
import { SwapSettingsModal } from "./SwapSettingsModal";
import { IconClose, IconSliders } from "./icons";

const ALL_ROUTES: RouteId[] = ["xylonet", "unitflow", "synthra", "circle"];

/** Arc network mark for the subtitle — real brand asset, self-contained circle. */
function ArcMark({ size = 16 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/arc.svg" alt="" aria-hidden width={size} height={size} style={{ borderRadius: "50%", display: "inline-block", verticalAlign: "middle" }} />
  );
}

export function SwapOverlay() {
  const router = useRouter();
  const { address } = useAccount();
  const { authenticated, login } = usePrivy();

  const [tab, setTab] = useState<"market" | "limit" | "history">("market");
  const [isPicking, setIsPicking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slippageBps, setSlippageBps] = useState(50);
  const [deadlineMins, setDeadlineMins] = useState(20);
  const [enabledRoutes, setEnabledRoutes] = useState<Set<RouteId>>(new Set(ALL_ROUTES));

  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/app");
  };

  const toggleRoute = (id: RouteId) => {
    setEnabledRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Escape closes the overlay (unless a settings/loss modal owns focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !settingsOpen) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  return (
    <div className="swap-overlay" role="dialog" aria-modal="true" aria-label="Swap">
      <SwapStyles />

      <div className="swap-overlay-top">
        <button className="swap-icon-btn" onClick={close} aria-label="Close swap">
          <IconClose size={20} />
        </button>

        {authenticated && address ? (
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px",
              border: "1px solid var(--bdr)", borderRadius: 8,
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--tx2)",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
            {shortAddress(address)}
          </span>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={login}>Connect wallet</button>
        )}
      </div>

      <div className="swap-col">
        {!isPicking && (
          <>
            <h1 className="swap-title">Swap</h1>
            <p className="swap-subtitle">
              Choose which assets to swap on <ArcMark /> Arc Testnet
            </p>

            <div className="swap-tabs-row">
              <div className="swap-tabs" role="tablist">
                <button role="tab" aria-selected={tab === "market"} className={`swap-tab ${tab === "market" ? "is-active" : ""}`} onClick={() => setTab("market")}>Market</button>
                <button role="tab" aria-selected={tab === "limit"} className={`swap-tab ${tab === "limit" ? "is-active" : ""}`} onClick={() => setTab("limit")}>Limit</button>
                <button role="tab" aria-selected={tab === "history"} className={`swap-tab ${tab === "history" ? "is-active" : ""}`} onClick={() => setTab("history")}>History</button>
              </div>
              {tab !== "history" && (
                <button className="swap-slippage-pill" onClick={() => setSettingsOpen(true)} aria-label="Swap settings">
                  <span className="swap-num">{slippageBps / 100}%</span>
                  <IconSliders size={14} />
                </button>
              )}
            </div>
          </>
        )}

        {tab === "market" && (
          <SwapForm
            slippageBps={slippageBps}
            setSlippageBps={setSlippageBps}
            enabledRoutes={enabledRoutes}
            deadlineMins={deadlineMins}
            onPickingChange={setIsPicking}
          />
        )}
        {tab === "limit" && <LimitForm onPickingChange={setIsPicking} />}
        {tab === "history" && <SwapHistory />}
      </div>

      {settingsOpen && (
        <SwapSettingsModal
          slippageBps={slippageBps}
          onSlippageChange={setSlippageBps}
          enabledRoutes={enabledRoutes}
          onToggleRoute={toggleRoute}
          deadlineMins={deadlineMins}
          onDeadlineChange={setDeadlineMins}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
