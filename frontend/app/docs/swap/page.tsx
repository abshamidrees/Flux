"use client";

import { H1, H2, H3, P, CodeBlock, Callout, StatusPill, AddressLink } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";
import { RouteIcon } from "../../../components/swap/RouteIcon";
import { FLUX_LIMIT_ORDER_ADDRESS } from "../../../lib/arc";

function RouteRow({ id, name, status, note }: { id: "xylonet" | "unitflow" | "synthra" | "circle"; name: string; status: "ready" | "pending"; note: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--bdr)" }}>
      <RouteIcon routeId={id} size={22} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>{name}</div>
        <div style={{ fontSize: 12.5, color: "var(--tx3)", marginTop: 2 }}>{note}</div>
      </div>
      <StatusPill label={status === "ready" ? "Live" : "Pending"} tone={status} />
    </div>
  );
}

export default function DocsSwapPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/docs" }, { label: "Swap" }]} />
      <H1 id="overview">Overview</H1>
      <P>USDC is Flux&apos;s settlement currency — batch payouts, streams, and agent spend caps are all denominated in it. Swap exists so that holding a different Arc asset never blocks you from using the rest of Flux: convert into USDC in-app, in one transaction, without going anywhere else.</P>

      <Callout tone="teal">
        Swap is live on <strong>Arc Testnet</strong>. It is not a general trading terminal — every quote is priced toward USDC as the destination asset.
      </Callout>

      <H2 id="routing">Routing &amp; the four routes</H2>
      <P>Every enabled route is quoted in parallel. Flux ranks them by <strong>net output</strong> — what you&apos;d actually receive after that route&apos;s fee and the gas cost of the transaction — and the highest net output wins automatically. You can also pin a specific route yourself in Settings; if your pinned route has no quote for the current pair, Flux falls back to the best available and tells you why.</P>

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <RouteRow id="xylonet" name="XyloNet" status="ready" note="StableSwap AMM. Deepest liquidity of the four today." />
        <RouteRow id="unitflow" name="UnitFlow" status="pending" note="Uniswap V2-lineage DEX on Arc. Live once its pools are seeded with liquidity." />
        <RouteRow id="synthra" name="Synthra" status="pending" note="Concentrated-liquidity venue. Integration pending a public quote API." />
        <RouteRow id="circle" name="Circle" status="ready" note="Official Arc App Kit swap SDK (@circle-fin/swap-kit)." />
      </div>

      <P>A route that can&apos;t quote your pair — no liquidity, not yet configured, or a timed-out request — renders as a plainly labelled disabled row with the real reason. Flux never shows a placeholder number in place of a route that isn&apos;t actually quoting.</P>

      <H3>A note on gas</H3>
      <P>Arc&apos;s native gas token is separate from the USDC ERC-20 that Flux settles in — they are two different tokens, even though both are USD-denominated. Net-output ranking converts the gas cost into the same USD terms as the swap itself, so routes are compared on a genuinely like-for-like basis.</P>

      <H2 id="slippage-price-impact">Slippage &amp; price impact</H2>
      <P>Max slippage sets <code>minAmountOut</code> — the least you will accept back. Flux re-quotes immediately before you sign; if the fresh quote can&apos;t meet your displayed <code>minAmountOut</code>, the swap is blocked rather than sent at a worse price than you saw.</P>

      <P>Price impact — how far your trade moves the pool away from its resting price — escalates through three tiers:</P>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>Above 1%</strong> — the price impact figure turns amber. No blocking, just visibility.</div>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>Above 5%</strong> — an inline warning card appears explaining the low liquidity. The swap button stays disabled until you check an explicit acknowledgement.</div>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>Above 15%</strong> — a separate modal blocks the swap entirely until you type &ldquo;I will lose money&rdquo; exactly. This is the strongest guard in the app, by design.</div>
      </div>

      <H2 id="limit-orders">Limit orders</H2>
      <P>A limit order escrows your input token in <code>FluxLimitOrder</code>, an on-chain contract, along with a minimum output and an expiry. Anyone can call <code>executeOrder</code> once a route can deliver at least your minimum — in practice, a scheduled keeper does this automatically, checking open orders on a short interval and filling anything that clears its trigger through an owner-allowlisted router.</P>
      <P>That means fills are not instant the moment your price is technically reachable — there is a keeper-cycle delay, typically under a minute. You can cancel an open order at any time, including after it has expired, and reclaim your full escrowed amount.</P>
      <CodeBlock label="Order lifecycle">{`Open  →  Filled     (executeOrder clears your minAmountOut trigger)
      →  Cancelled  (maker reclaims escrow, any time, even post-expiry)`}</CodeBlock>
      {FLUX_LIMIT_ORDER_ADDRESS && (
        <P><AddressLink address={FLUX_LIMIT_ORDER_ADDRESS} label="FluxLimitOrder on ArcScan" /></P>
      )}

      <H2 id="swap-history">Swap history</H2>
      <P>Nothing about your swap history is stored locally. Every row in the History tab is reconstructed on demand from Arc itself — Flux reads your wallet&apos;s transactions, filters to the verified route routers, and derives amounts from the token transfers in each one. Open the app on a different device with the same wallet and the same history is there. Failed transactions are shown, not hidden.</P>
    </div>
  );
}
