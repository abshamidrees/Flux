// components/swap/icons.tsx
// Swap-module line icons + token marks. Same style as components/icons.tsx:
// 1.6px stroke, 24x24 viewBox, rounded caps/joins, currentColor. No emojis,
// no external brand logos (spec §3, §12).

import { SVGProps } from "react";
import type { TokenInfo } from "../../lib/swap/tokens";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/* ── Swap / exchange — two opposed horizontal arrows (header entry point) ── */
export function IconSwap({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 8h13" />
      <path d="M14 5l3 3-3 3" />
      <path d="M20 16H7" />
      <path d="M10 13l-3 3 3 3" />
    </svg>
  );
}

/* ── Vertical flip — for the circular divider button between Sell/Receive ── */
export function IconFlip({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 4v13" />
      <path d="M5 14l3 3 3-3" />
      <path d="M16 20V7" />
      <path d="M13 10l3-3 3 3" />
    </svg>
  );
}

/* ── Stacked up/down chevron — token pill selector ── */
export function IconChevronUpDown({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 9l4-4 4 4" />
      <path d="M16 15l-4 4-4-4" />
    </svg>
  );
}

export function IconChevronDown({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ── Settings sliders — slippage pill ── */
export function IconSliders({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 6h10M18 6h2" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h2M10 12h10" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 18h10M18 18h2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}

export function IconSearch({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/* ── Alert — price-impact warnings (replaces ⚠️) ── */
export function IconAlert({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 4l9 15H3l9-15z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Check circle — success (replaces ✅) ── */
export function IconCheck({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

/* ── External link — ArcScan (replaces ↗) ── */
export function IconExternal({ size = 13, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8 8" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

/* ── Plain right arrow — history rows, from-asset → to-asset ── */
export function IconArrowRight({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 12h16" />
      <path d="M14 6l6 6-6 6" />
    </svg>
  );
}

export function IconClose({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconPin({ size = 13, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" />
      <path d="M12 16v4" />
    </svg>
  );
}

/* ── Small spinner ring (respects prefers-reduced-motion via CSS) ── */
export function IconSpinner({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p} className={`swap-spin ${p.className ?? ""}`}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/* ── Token marks — monogram chips, theme-aware, no brand logos ──────────────
   Distinct by symbol letter; the row always shows symbol + name alongside. */
export function TokenMark({ token, size = 32 }: { token: TokenInfo; size?: number }) {
  const glyph = token.symbol === "USDC" ? "$" : token.symbol === "EURC" ? "€" : token.symbol.slice(0, 1);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--bg3)",
        border: "1px solid var(--bdr2)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "var(--tx)",
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 600,
        fontSize: size * 0.44,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}
    >
      {glyph}
    </span>
  );
}
