// components/swap/TokenIcon.tsx
// Resolves a token to its real brand mark in /public/tokens. The Phase-1 monogram
// (TokenMark) renders only as an onError fallback if a file is missing — never as
// the first choice for a symbol that has a file (spec §1).
//
// Real marks are self-contained circular SVGs, so there is no ring, plate, or
// border here (spec §1.41).

"use client";

import { useState } from "react";
import type { TokenInfo } from "../../lib/swap/tokens";
import { TokenMark } from "./icons";

export function TokenIcon({ token, size = 32 }: { token: TokenInfo; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <TokenMark token={token} size={size} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/tokens/${token.symbol.toLowerCase()}.svg`}
      alt={token.symbol}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: "50%", display: "block", flexShrink: 0 }}
    />
  );
}
