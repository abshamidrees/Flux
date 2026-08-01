// components/swap/TokenPill.tsx
"use client";

import type { TokenInfo } from "../../lib/swap/tokens";
import { IconChevronUpDown } from "./icons";
import { TokenIcon } from "./TokenIcon";

export function TokenPill({ token, onClick }: { token: TokenInfo; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="swap-token-pill"
      aria-label={`${token.symbol} — change token`}
    >
      <TokenIcon token={token} size={20} />
      <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, color: "var(--tx)" }}>
        {token.symbol}
      </span>
      <IconChevronUpDown size={14} style={{ color: "var(--tx3)" }} />
    </button>
  );
}
