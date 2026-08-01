// lib/swap/adapters/unitflow.ts
// UnitFlow adapter — Phase G rewrite. Phase B wired the V2.5 LiquidityRouter,
// whose USDC/EURC pair contract exists but has zero reserves. UnitFlow's own
// dev later confirmed "the liquidity is in the v3 liquidity" — Phase B had the
// wrong contract entirely. This now instantiates the shared Uniswap V3 adapter
// factory (uniswapV3.ts) against UnitFlow's real V3 deployment, independently
// verified on ArcScan (see constants.ts UNITFLOW_V3 for the full evidence
// trail) rather than trusted from the third-party doc that surfaced them.
//
// Verified pool reality, not assumed: real, substantial liquidity exists for
// EURC against WUSDC (the wrapped native gas token) at fee 100/3000/10000 —
// but WUSDC is NOT the USDC ERC-20 Flux settles in (confirmed 18dp vs 6dp,
// different address), and no WUSDC/USDC bridge pool exists at any tier. That
// liquidity is real but not reachable for Flux's actual settlement asset, so
// this adapter targets the REAL USDC/EURC and USDC/USYC pairs — never routes
// through WUSDC as a silent substitute. Correctly reports "no liquidity" right
// now; lights up automatically the moment one of those pools is seeded.
//
// Fee tier scoped to [100] only (not all four standard tiers): verified 500/
// 3000/10000 have no pool at all for either real pair — probing them is a
// guaranteed-revert RPC call with zero chance of success, and doing it on
// every quote (in parallel, on top of XyloNet + balances + prices + gas price
// all competing for the same public-RPC budget) was real, measured contention
// that caused genuine "Quote timed out" failures during live testing. Revisit
// if UnitFlow ever seeds a pool at a different tier.

import type { PublicClient } from "viem";
import type { RouteAdapter } from "../types";
import { UNITFLOW_V3 } from "../constants";
import { createUniswapV3Adapter } from "./uniswapV3";

const EST_GAS = 180_000n;

export function unitflowAdapter(client: PublicClient): RouteAdapter {
  return createUniswapV3Adapter(client, {
    id: "unitflow",
    displayName: "UnitFlow",
    router: UNITFLOW_V3.router,
    quoter: UNITFLOW_V3.quoter,
    feeTiers: [100],
    estimatedGas: EST_GAS,
  });
}
