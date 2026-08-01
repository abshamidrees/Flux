// components/swap/PriceImpactWarning.tsx
// Tier 2 guard (spec §7.7, >5%): inline warning card + acknowledgement checkbox.
// The swap button stays disabled until `checked`.

"use client";

import { formatPercent } from "../../lib/swap/format";
import { IconAlert } from "./icons";

export function PriceImpactWarning({
  impactPct,
  checked,
  onChange,
}: {
  impactPct: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="swap-impact-card">
      <div style={{ display: "flex", gap: 12 }}>
        <span className="swap-impact-icon">
          <IconAlert size={18} />
        </span>
        <div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--red)" }}>
            Large price difference
          </div>
          <div style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.55, marginTop: 4 }}>
            This swap has low liquidity, resulting in a large price difference (~{formatPercent(impactPct)}). You
            will receive significantly less than the current market value.
          </div>
        </div>
      </div>
      <label className="swap-impact-ack">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>I understand this swap will result in a significant loss of value</span>
      </label>
    </div>
  );
}
