"use client";

import { H1, H2, H3, P, InlineCode, CodeBlock, Callout, AddressLink } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";
import { FLUX_AGENT_REGISTRY_ADDRESS } from "../../../lib/arc";

export default function DocsAgentsPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/" }, { label: "Agent Registry" }]} />
      <H1 id="agent-registry">Agent Registry</H1>
      <P>Give an AI agent its own USDC wallet, set hard spending limits on it, and let it pay on its own. The agent keeps its own funds — Flux never holds them — and every payment is checked against your limits before it can go through.</P>

      <Callout tone="teal">
        <strong>Non-custodial.</strong> An agent is any wallet you choose — a Circle wallet, MetaMask, or a plain key an autonomous script holds. Flux never takes custody of its funds; it only enforces the limits you set.
      </Callout>

      <H2 id="how-it-works">How it works</H2>
      <P>Register an agent wallet with three caps: a per-transaction limit, a daily limit, and a lifetime limit. The agent wallet then approves the registry contract to move its own USDC, the same way you&apos;d approve any contract to spend a token on your behalf. After that, the agent can pay recipients directly, and the registry checks every payment against your caps before it happens.</P>
      <P>You can update caps, pause an agent, resume it, or shut it down permanently at any time. Only you, as the wallet that registered it, can change its settings.</P>

      <H2 id="enforcement">Two ways an agent can pay</H2>
      <P>Caps mean different things depending on how the payment moves, and it&apos;s worth knowing the difference before you rely on them:</P>
      <H3>On-chain payments</H3>
      <P>The agent calls <InlineCode>recordPayment</InlineCode>. The registry itself pulls the funds from the agent&apos;s wallet and sends them. This is trustless: the cap physically cannot be exceeded, because the money can&apos;t move without passing the check first.</P>
      <H3>Gateway / x402 payments</H3>
      <P>For agent-to-service payments (an AI agent paying per API call, for example), Circle&apos;s Gateway moves the funds directly through its own settlement path — the registry never touches that money. The agent calls <InlineCode>recordExternalSpend</InlineCode> to log the payment against the same caps, but this only works if the agent&apos;s own code calls it before paying. Nothing on-chain forces that call to happen, so this cap is enforced by convention, not by the contract. Flux&apos;s own agent-payment code always calls it; a third-party integration would need to as well.</P>
      <P>Flux agents can only pay for services today — publishing your own endpoint so other agents pay you through Flux is intentionally out of scope for now.</P>

      <H2 id="guardrails">Guardrails</H2>
      <P>Beyond the three caps, each agent can have:</P>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>An expiry.</strong> After it passes, the agent can&apos;t spend anymore. Optional — leave it unset for no expiry.</div>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>A blocklist.</strong> Addresses this agent can never pay, regardless of caps.</div>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>An allowlist.</strong> Turn on &ldquo;restrict to allowlist&rdquo; and the agent can only pay addresses you&apos;ve explicitly added.</div>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}><strong style={{ color: "var(--tx)" }}>A kill switch.</strong> Revoke shuts an agent down permanently. There&apos;s no reactivating it — register a new one if you need to.</div>
      </div>

      <H2 id="circle-policies">Why this runs on Flux, not Circle</H2>
      <P>Circle&apos;s own wallet-level spending policies (per-transaction, daily, weekly, and monthly caps) are documented as mainnet-only — setting a policy on a testnet chain is rejected. Arc is testnet-only today, so Circle can&apos;t enforce agent limits at the wallet level here. That&apos;s why Flux enforces caps itself, on-chain, through this registry, rather than leaning on Circle&apos;s policy API. When Circle&apos;s policies reach Arc mainnet, the registry keeps working exactly the same way.</P>
      <P>The allowlist, blocklist, and expiry described above go beyond Circle&apos;s own policy vocabulary — they&apos;re Flux additions, not a mirror of what Circle offers.</P>

      <H2 id="contract">Contract</H2>
      <P>Full function and event signatures are on the <a href="/reference" style={{ color: "var(--teal-l)" }}>Reference</a> page.</P>
      <CodeBlock label="Registering an agent">{`function registerAgent(
    address agentWallet,
    uint256 perTxCap,
    uint256 dailyCap,
    uint256 totalCap,
    uint64  expiry
) external returns (uint256 agentId)`}</CodeBlock>
      {FLUX_AGENT_REGISTRY_ADDRESS && <P><AddressLink address={FLUX_AGENT_REGISTRY_ADDRESS} label="FluxAgentRegistry on ArcScan" /></P>}
    </div>
  );
}
