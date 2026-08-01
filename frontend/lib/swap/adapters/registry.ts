// lib/swap/adapters/registry.ts
// Assembles the live adapter set (spec §4.2 order: XyloNet, UnitFlow, Synthra,
// Circle). XyloNet and UnitFlow are real on-chain adapters (Phase B verified:
// XyloNet's USDC/EURC pool is deep, USDC/USYC and UnitFlow's USDC/EURC pool
// both exist but are empty — quote() correctly returns null for those rather
// than a fabricated number). Circle is wired against the real swap-kit SDK
// types. Synthra's quote API is still unresolved (Cloudflare-blocked docs, no
// on-chain Quoter address found within the time-boxed search) — it stays an
// honest placeholder rather than a guessed endpoint.

import type { PublicClient } from "viem";
import type { RouteAdapter } from "../types";
import { xylonetAdapter } from "./xylonet";
import { unitflowAdapter } from "./unitflow";
import { circleAdapter } from "./circle";
import { placeholderAdapter } from "./placeholder";

export function buildAdapters(client: PublicClient): RouteAdapter[] {
  return [
    xylonetAdapter(client),
    unitflowAdapter(client),
    placeholderAdapter("synthra", "Synthra", "unconfigured", "Integration pending"),
    circleAdapter(client),
  ];
}
