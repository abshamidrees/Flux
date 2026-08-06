"use client";

import { H1, H2, H3, P, InlineCode, CodeBlock, Callout, FeatureCard } from "../../components/docs/DocsUI";
import { Breadcrumbs } from "../../components/docs/Breadcrumbs";
import { IconBatch, IconStream, IconAgent } from "../../components/icons";
import { IconSwap } from "../../components/swap/icons";

export default function DocsIndexPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs" }]} />

      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--teal-10)", border: "1px solid var(--teal-20)", borderRadius: 999, padding: "3px 12px", marginBottom: 16 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} />
        <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 11, fontWeight: 700, color: "var(--teal)" }}>Arc Testnet</span>
      </div>

      <H1 id="what-is-flux">What is Flux</H1>
      <P>Flux is programmable USDC payment infrastructure built on Arc. Send batch payments, create vesting streams, deploy autonomous AI agent wallets, and swap between Arc assets — all settled through smart contracts with sub-second finality.</P>

      <Callout tone="teal">
        Flux is live on <strong>Arc Testnet</strong> (Chain ID 5042002). USDC is the native gas token — no separate gas token to hold. Transactions confirm in under 0.5 seconds.
      </Callout>

      <H2 id="features">Features</H2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
        <FeatureCard icon={<IconBatch size={18} />} title="Batch Settlement" desc="Pay up to 500 wallets in one transaction. CSV upload or manual entry." href="/batch" />
        <FeatureCard icon={<IconStream size={18} />} title="Payment Streams" desc="Linear USDC vesting for payroll, grants, and contractor agreements." href="/streams" />
        <FeatureCard icon={<IconAgent size={18} />} title="Agent Registry" desc="Give an AI agent its own USDC wallet with hard, on-chain spending limits and a kill switch." href="/agents" />
        <FeatureCard icon={<IconSwap size={18} />} title="Swap" desc="Convert any Arc asset to USDC in-app, routed across every venue for the best price." href="/swap" />
      </div>

      <H2 id="how-it-works">How it works</H2>
      <P>Batch settlement and streams live in one deployed contract, <InlineCode>FluxSettlement.sol</InlineCode>. Swap and limit orders are handled separately by third-party routers and <InlineCode>FluxLimitOrder.sol</InlineCode> — see the <a href="/swap" style={{ color: "var(--teal-l)" }}>Swap docs</a>. The Agent Registry has its own contract, <InlineCode>FluxAgentRegistry.sol</InlineCode> — see the <a href="/agents" style={{ color: "var(--teal-l)" }}>Agent Registry docs</a>. Wallet connection is either an external browser wallet (MetaMask and others, via Privy) or a non-custodial email wallet (via Circle) — every transaction settles on-chain either way.</P>

      <H2 id="quickstart">Quickstart</H2>
      <H3>1. Add Arc Testnet to your wallet</H3>
      <CodeBlock label="Network details">{`Network Name:   Arc Testnet
RPC URL:        https://rpc.testnet.arc.network
Chain ID:       5042002
Currency:       USDC
Explorer:       https://testnet.arcscan.app`}</CodeBlock>

      <H3>2. Get test USDC</H3>
      <P>Go to <strong>faucet.circle.com</strong>, select Arc Testnet, and request USDC to your wallet address — free testnet funds.</P>

      <H3>3. Connect and use Flux</H3>
      <P>Visit <strong>fluxonarc.xyz</strong>, click Connect Wallet in the top-right, and either connect an existing wallet like MetaMask or continue with just your email. Once connected, your USDC balance appears in the header and every feature unlocks.</P>

      <H2 id="network-addresses">Network &amp; addresses</H2>
      <P>Every contract Flux deploys, in one place — see the full <a href="/reference" style={{ color: "var(--teal-l)" }}>Reference</a> page for ABIs and events. All addresses link to ArcScan.</P>
      <CodeBlock label="Arc Testnet">{`Chain ID:   5042002
RPC:        https://rpc.testnet.arc.network
Explorer:   https://testnet.arcscan.app
USDC:       0x3600000000000000000000000000000000000000`}</CodeBlock>
    </div>
  );
}
