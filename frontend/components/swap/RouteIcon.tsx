// components/swap/RouteIcon.tsx
// Resolves a route to its brand mark in /public/brand. Falls back to a neutral
// monogram if the file is missing (spec §1) — so routes light up automatically as
// their marks are added.
//
// File formats as actually supplied (verified by magic bytes, not filename):
// circle.svg (SVG), xylonet.png (real PNG, RGBA/3464px), synthra.png (real PNG,
// 292px palette), unitflow.png (actually JPEG bytes despite the .png name — no
// alpha channel is possible in JPEG, so if it has a baked-in background it will
// show as a hard square; flagged to the user rather than masked).

"use client";

import { useState } from "react";
import type { RouteId } from "../../lib/swap/types";

const LETTER: Record<RouteId, string> = { xylonet: "X", synthra: "S", unitflow: "U", circle: "C" };
const FILE: Record<RouteId, string> = { xylonet: "xylonet.png", synthra: "synthra.png", unitflow: "unitflow.png", circle: "circle.svg" };

export function RouteIcon({ routeId, size = 20 }: { routeId: RouteId; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0,
          background: "var(--bg4)", border: "1px solid var(--bdr2)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.5, fontWeight: 700, color: "var(--tx2)",
        }}
      >
        {LETTER[routeId]}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/${FILE[routeId]}`}
      alt={routeId}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: "50%", display: "block", flexShrink: 0 }}
    />
  );
}
