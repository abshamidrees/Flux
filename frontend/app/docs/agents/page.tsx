"use client";

import { H1, H2, P, CodeBlock, AddressLink } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";
import { FLUX_ADDRESS } from "../../../lib/arc";

export default function DocsAgentsPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/docs" }, { label: "Agent Registry" }]} />
      <H1 id="agent-registry">Agent Registry</H1>
      <P>Register AI agent wallets with USDC spending caps. Once registered, an agent calls <code>agentPay()</code> from its own wallet to send USDC autonomously — no manual approval per payment — as long as it stays within its cap.</P>

      <H2 id="use-cases">Use cases</H2>
      <P>AI trading bots that pay fees autonomously. Subscription services billed by an agent. Autonomous payroll agents. DeFi bots that need to pay for gas or services. Any AI system that needs on-chain payment authority without a human in the loop.</P>

      <H2 id="how-it-works">How it works</H2>
      <P>The owner registers the agent wallet with a label and USDC budget cap, then deposits USDC into the contract treasury. The agent calls <code>agentPay(recipient, amount)</code> from its own wallet; the contract checks the agent is active and within its cumulative cap before releasing funds.</P>

      <H2 id="owner-only-actions">Owner-only actions</H2>
      <P>Register Agent and Fund Treasury require the contract deployer wallet — only the owner can whitelist agents or fund the treasury. Regular users can view registered agents but cannot modify them.</P>

      <H2 id="agentpay-interface">agentPay interface</H2>
      <CodeBlock label="FluxSettlement.sol">{`modifier onlyActiveAgent() {
    require(agents[msg.sender].active, "Flux: agent not registered");
    _;
}

// Called by the agent's own wallet, not the owner.
function agentPay(address recipient, uint256 amount) external onlyActiveAgent {
    Agent storage a = agents[msg.sender];
    require(a.spent + amount <= a.budgetCap, "Flux: budget exceeded");
    require(recipient != address(0), "Flux: zero recipient");

    a.spent += amount;
    // transfers amount from the contract's treasury to recipient
}`}</CodeBlock>

      <H2 id="budget-cap">Budget cap</H2>
      <P>The budget cap is cumulative — once an agent has spent its full cap, it cannot make further payments. The owner must register a new agent or raise the cap via <code>updateAgent()</code>. This is intentional: it limits blast radius if an agent is compromised.</P>

      <H2 id="contract">Contract</H2>
      <P>Agents are handled by <code>FluxSettlement.registerAgent()</code>, <code>updateAgent()</code>, and <code>agentPay()</code>. Full ABI and events are in the <a href="/docs/reference" style={{ color: "var(--teal-l)" }}>Reference</a> page.</P>
      <P><AddressLink address={FLUX_ADDRESS || "0x0BBBc1C77ada4d584445383B77b88DDdDAae2F6A"} label="FluxSettlement on ArcScan" /></P>
    </div>
  );
}
