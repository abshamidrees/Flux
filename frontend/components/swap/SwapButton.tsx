// components/swap/SwapButton.tsx
// Header entry point (spec §5). Sits immediately left of the wallet chip. Pill
// matching the wallet chip height/radius; teal on hover; icon-only below 520px.

"use client";

import Link from "next/link";
import { IconSwap } from "./icons";

export function SwapButton() {
  return (
    <Link href="/app/swap" className="swap-header-btn" aria-label="Open swap">
      <IconSwap size={15} />
      <span>Swap</span>
    </Link>
  );
}
