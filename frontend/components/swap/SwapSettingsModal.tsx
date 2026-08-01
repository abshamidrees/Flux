// components/swap/SwapSettingsModal.tsx
// Settings modal (spec §7.4 + §2.5): slippage presets + custom, route enable/disable,
// one-field deadline with an inline "minutes" suffix, and a collapsible
// "How routing works" explainer. Fits a 700px viewport with the explainer closed;
// max-height scroll as a safety net.

"use client";

import { useState } from "react";
import type { RouteId } from "../../lib/swap/types";
import { ROUTES } from "../../lib/swap/constants";
import { IconClose, IconChevronDown } from "./icons";

const SLIPPAGE_PRESETS = [10, 50, 100]; // bps → 0.1% / 0.5% / 1%
const ALL_ROUTES: RouteId[] = ["xylonet", "unitflow", "synthra", "circle"];

export function SwapSettingsModal({
  slippageBps,
  onSlippageChange,
  enabledRoutes,
  onToggleRoute,
  deadlineMins,
  onDeadlineChange,
  onClose,
}: {
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
  enabledRoutes: Set<RouteId>;
  onToggleRoute: (id: RouteId) => void;
  deadlineMins: number;
  onDeadlineChange: (m: number) => void;
  onClose: () => void;
}) {
  const isPreset = SLIPPAGE_PRESETS.includes(slippageBps);
  const [customSlip, setCustomSlip] = useState(isPreset ? "" : (slippageBps / 100).toString());
  const [explainerOpen, setExplainerOpen] = useState(false);

  const slipPct = slippageBps / 100;
  const slipWarn = slipPct > 3 && slipPct <= 15;
  const slipBlock = slipPct > 15;
  const enabledCount = ALL_ROUTES.filter((r) => enabledRoutes.has(r)).length;

  const applyCustom = (v: string) => {
    const cleaned = v.replace(/[^0-9.]/g, "");
    setCustomSlip(cleaned);
    const pct = parseFloat(cleaned);
    if (!isNaN(pct)) onSlippageChange(Math.round(pct * 100));
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 440, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column" }}>
        <div className="modal-hd">
          <h3>Swap settings</h3>
          <button onClick={onClose} className="swap-icon-btn" aria-label="Close settings"><IconClose size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>

          {/* Max slippage */}
          <div>
            <div className="swap-settings-label">Max slippage</div>
            <div style={{ display: "flex", gap: 8 }}>
              {SLIPPAGE_PRESETS.map((bps) => (
                <button
                  key={bps}
                  className={`swap-preset ${slippageBps === bps && !customSlip ? "is-active" : ""}`}
                  onClick={() => { onSlippageChange(bps); setCustomSlip(""); }}
                >
                  {bps / 100}%
                </button>
              ))}
              <div className={`swap-preset-custom ${customSlip ? "is-active" : ""}`}>
                <input
                  inputMode="decimal"
                  placeholder="Custom"
                  value={customSlip}
                  onChange={(e) => applyCustom(e.target.value)}
                  aria-label="Custom slippage percent"
                />
                <span>%</span>
              </div>
            </div>
            {slipWarn && <div className="swap-inline-note warn" style={{ marginTop: 8 }}>High slippage — your swap may be front-run.</div>}
            {slipBlock && <div className="swap-inline-note err" style={{ marginTop: 8 }}>Slippage above 15% is not allowed.</div>}
          </div>

          {/* Routes */}
          <div>
            <div className="swap-settings-label">{enabledCount}/{ALL_ROUTES.length} routes enabled</div>
            <div className="swap-routes-list">
              {ALL_ROUTES.map((id) => (
                <label key={id} className="swap-route-toggle">
                  <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 600, fontSize: 14, color: "var(--tx)" }}>
                    {ROUTES[id].displayName}
                  </span>
                  <input type="checkbox" className="swap-switch" checked={enabledRoutes.has(id)} onChange={() => onToggleRoute(id)} />
                </label>
              ))}
            </div>
            {enabledCount === 0 && <div className="swap-inline-note err" style={{ marginTop: 8 }}>Enable at least one route to swap.</div>}
          </div>

          {/* Deadline — one field, inline suffix */}
          <div>
            <div className="swap-settings-label">Transaction deadline</div>
            <div className="swap-deadline">
              <input
                inputMode="numeric"
                value={deadlineMins}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                  onDeadlineChange(isNaN(n) ? 0 : n);
                }}
                aria-label="Transaction deadline in minutes"
              />
              <span className="suffix">minutes</span>
            </div>
          </div>

          {/* Explainer — collapsed by default */}
          <div className="swap-explainer">
            <button className="swap-explainer-hd" onClick={() => setExplainerOpen((o) => !o)} aria-expanded={explainerOpen}>
              <span>How routing works</span>
              <IconChevronDown size={15} style={{ color: "var(--tx3)", transform: explainerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {explainerOpen && (
              <p>
                Flux requests a quote from every enabled route in parallel. It ranks them by the output you actually
                keep — the amount received, minus the gas Arc charges in USDC. The best net quote wins, or you can pin
                a single route yourself.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
