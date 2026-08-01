// lib/swap/constants.ts
// VERIFIED route addresses from Phase 0. Centralised so Phase 2 adapters never
// guess an address. Each entry cites its evidence source.
//
// Nothing here is wired in Phase 1 — the form runs on a mock quote source.
// An entry being present is NOT a claim that its adapter is 'ready'; liquidity
// and ABI details are confirmed per-route before an adapter starts quoting.

import type { RouteId } from "./types";

export interface RouteConfig {
  id: RouteId;
  displayName: string;
  /** Best-effort verification note from Phase 0. */
  evidence: string;
}

export const ROUTES: Record<RouteId, RouteConfig> = {
  xylonet: {
    id: "xylonet",
    displayName: "XyloNet",
    evidence: "Addresses published in github.com/Panchu11/xylonet-public; USDC matches Flux config.",
  },
  unitflow: {
    id: "unitflow",
    displayName: "UnitFlow",
    evidence: "docs.unitflow.finance/docs/dev/contracts: 'All contracts are deployed on Arc Testnet'.",
  },
  synthra: {
    id: "synthra",
    displayName: "Synthra",
    evidence: "Live on Arc (testnet.arcscan.app/apps/synthra); quote API endpoint pending confirmation.",
  },
  circle: {
    id: "circle",
    displayName: "Circle",
    evidence: "@circle-fin/swap-kit, official Arc App Kit; USDC/EURC on Arc Testnet.",
  },
};

// ── XyloNet (StableSwap AMM, on-chain quote + swap) ───────────────────────────
export const XYLONET = {
  router: "0x73742278c31a76dBb0D2587d03ef92E6E2141023" as const, // approval spender
  factory: "0x60EDeFB094B84BBC6430cc130B358A43Ba1979e2" as const,
  pools: {
    "USDC/EURC": "0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1" as const,
    "USDC/USYC": "0x8296cC7477A9CD12cF632042fDDc2aB89151bb61" as const,
  },
  feeBps: 4, // 0.04%
  // quote(address,address,uint256) view -> (amountOut, priceImpact)
  // swapExactTokensForTokens(uint256,uint256,address[],address,uint256) -> uint256[]
} as const;

// ── UnitFlow ───────────────────────────────────────────────────────────────
// Phase B wired the V2.5 LiquidityRouter — their own dev later confirmed "the
// liquidity is in the v3 liquidity", i.e. Phase B had the wrong contract
// entirely. V2.5 addresses kept below for the record; V3 is what's wired now.
export const UNITFLOW = {
  liquidityRouter: "0x0ef57CC428c851e9a9b7cD97190EF3D3EFe4B631" as const, // V2.5 — superseded, unused
  universalRouter: "0xEaF3195bE51861632cd32850973C9515DA48e76F" as const, // V2.5 — superseded, unused
} as const;

// UnitFlow V3 — addresses sourced from ACTFUN's third-party docs (they build on
// UnitFlow V3), corroborated by UnitFlow's own dev ("the liquidity is in the v3
// liquidity"). Phase G independently verified: all five have real bytecode AND
// verified source on ArcScan, contract names match exactly (UnitFlowV3Router /
// PositionManager / Factory, Quoter, WUSDC), compiler 0.7.6 (classic Uniswap V3).
// Quoter confirmed V1 shape (quoteExactInputSingle -> single uint256, not a
// QuoterV2 struct) via its actual verified ABI, not assumed from the name.
//
// IMPORTANT — verified pool reality, not assumed: the USDC/EURC pool exists at
// fee 100 but has zero liquidity; USDC/USYC has no pool at any standard fee
// tier. Real, substantial liquidity DOES exist for EURC against WUSDC (fee 100/
// 3000/10000) — but WUSDC is the WRAPPED NATIVE GAS TOKEN (18dp, confirmed),
// a different token from the USDC ERC-20 (6dp) Flux settles in, and no
// WUSDC/USDC bridge pool exists at any tier. That liquidity is real but not
// reachable for Flux's actual settlement asset, so the adapter targets real
// USDC/EURC and USDC/USYC only and will correctly report "no liquidity" until
// one of those pools is actually seeded — never routes through WUSDC as a
// silent substitute for USDC.
export const UNITFLOW_V3 = {
  router: "0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01" as const, // approval spender
  positionManager: "0x77c39eB310BE31e60068CE29855F83359bf85fc4" as const,
  factory: "0xAb6A8AAb7d490007634ef59d424b5d89688a1971" as const,
  quoter: "0x121aeB6DEf00F6F67665008CaC1C19805886ed1a" as const,
  wusdc: "0x911b4000D3422F482F4062a913885f7b035382Df" as const, // wrapped native gas — NOT the USDC ERC-20
  feeTier: 3000, // 0.30% — ACTFUN's stated tier; USDC/EURC pool exists at fee 100 instead (empty)
} as const;

/** Quotes are considered stale after this window. */
export const QUOTE_TTL_MS = 20_000;
/** Idle re-quote cadence while the form is valid. */
export const REQUOTE_INTERVAL_MS = 15_000;
// Per-route quote timeout — partial results render as they arrive, so a slow
// route never blocks the fast ones. Was 3000ms; the transport's own retry
// budget (retryCount 4 * retryDelay 400ms in app/providers.tsx) plus real
// network round-trips under public-RPC contention could exceed 3s on its own,
// causing genuine "Quote timed out" failures that were really just the retry
// mechanism not finishing in time — not a route being unavailable.
export const ROUTE_TIMEOUT_MS = 4_500;
