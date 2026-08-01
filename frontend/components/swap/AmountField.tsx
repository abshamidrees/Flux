// components/swap/AmountField.tsx
// Huge, quiet amount input (spec §4). No border around the number itself.
// Microline: USD/token equivalent on the left with a convert toggle, balance +
// Max on the right (sell side only).

"use client";

import type { TokenInfo } from "../../lib/swap/tokens";
import { TokenPill } from "./TokenPill";
import { Skeleton } from "../UI";
import { formatTokenAmount } from "../../lib/swap/format";

/** Small convert glyph (two opposed vertical arrows) for the USD/token toggle. */
function ConvertGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
      <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
    </svg>
  );
}

interface AmountFieldProps {
  label: string;
  token: TokenInfo;
  onPickToken: () => void;
  /** The raw string shown in the input. */
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  /** 'token' → input is a token amount; 'usd' → input is a USD amount. */
  mode: "token" | "usd";
  onToggleMode?: () => void;
  /** The converted "other unit" value shown on the microline. */
  convertedLabel: string;
  /** Sell side only. `null` = not yet confirmed on-chain — never render as 0. */
  balance?: number | null;
  onMax?: () => void;
  /** Tooltip on the Max button (e.g. the gas buffer note). */
  maxTitle?: string;
  loading?: boolean;
}

export function AmountField({
  label,
  token,
  onPickToken,
  value,
  onChange,
  readOnly,
  mode,
  onToggleMode,
  convertedLabel,
  balance,
  onMax,
  maxTitle,
  loading,
}: AmountFieldProps) {
  const handleChange = (raw: string) => {
    if (!onChange) return;
    // Allow only a single decimal number.
    const cleaned = raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    onChange(cleaned);
  };

  return (
    <div className="swap-zone">
      <div className="swap-zone-label">{label}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4 }}>
          {mode === "usd" && (
            <span style={{ fontSize: 30, fontWeight: 700, color: value ? "var(--tx)" : "var(--tx3)", fontFamily: "'Manrope',sans-serif" }}>$</span>
          )}
          <input
            className="swap-amount-input"
            inputMode="decimal"
            placeholder="0"
            value={value}
            readOnly={readOnly}
            onChange={(e) => handleChange(e.target.value)}
            aria-label={label}
            style={{ opacity: loading && readOnly ? 0.5 : 1 }}
          />
        </div>
        <TokenPill token={token} onClick={onPickToken} />
      </div>

      <div className="swap-microline">
        <button
          type="button"
          className="swap-convert"
          onClick={onToggleMode}
          disabled={!onToggleMode}
          aria-label="Toggle USD / token entry"
        >
          <ConvertGlyph />
          <span>{convertedLabel}</span>
        </button>

        {balance !== undefined && (
          <span className="swap-balance">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              Balance:{" "}
              {balance === null ? (
                <Skeleton w={44} h={12} br={4} />
              ) : (
                <span className="swap-num" style={{ color: "var(--tx2)" }}>
                  {formatTokenAmount(balance, token.decimals)}
                </span>
              )}
            </span>
            {onMax && (
              <button type="button" className="swap-max" onClick={onMax} title={maxTitle} disabled={balance === null}>
                Max
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
