"use client";

import { H1, H2, P, CodeBlock, AddressLink } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";
import { FLUX_ADDRESS, FLUX_LIMIT_ORDER_ADDRESS, FLUX_AGENT_REGISTRY_ADDRESS } from "../../../lib/arc";
import { USDC, EURC, USYC } from "../../../lib/swap/tokens";
import { XYLONET, UNITFLOW } from "../../../lib/swap/constants";

function AddrRow({ label, address }: { label: string; address: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--bdr)" }}>
      <span style={{ fontSize: 13.5, color: "var(--tx2)", fontWeight: 500 }}>{label}</span>
      <AddressLink address={address} />
    </div>
  );
}

export default function DocsReferencePage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/" }, { label: "Reference" }]} />
      <H1 id="contract-addresses">Contract addresses</H1>
      <P>Every address Flux talks to on Arc Testnet (5042002). All link to ArcScan.</P>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--tx3)", letterSpacing: "0.06em", marginTop: 20, marginBottom: 6 }}>FLUX CONTRACTS</div>
        <AddrRow label="FluxSettlement" address={FLUX_ADDRESS || "0x0BBBc1C77ada4d584445383B77b88DDdDAae2F6A"} />
        {FLUX_LIMIT_ORDER_ADDRESS && <AddrRow label="FluxLimitOrder" address={FLUX_LIMIT_ORDER_ADDRESS} />}
        {FLUX_AGENT_REGISTRY_ADDRESS && <AddrRow label="FluxAgentRegistry" address={FLUX_AGENT_REGISTRY_ADDRESS} />}

        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--tx3)", letterSpacing: "0.06em", marginTop: 20, marginBottom: 6 }}>TOKENS</div>
        <AddrRow label="USDC" address={USDC.address} />
        <AddrRow label="EURC" address={EURC.address} />
        <AddrRow label="USYC" address={USYC.address} />

        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--tx3)", letterSpacing: "0.06em", marginTop: 20, marginBottom: 6 }}>SWAP ROUTES</div>
        <AddrRow label="XyloNet router" address={XYLONET.router} />
        <AddrRow label="XyloNet factory" address={XYLONET.factory} />
        <AddrRow label="UnitFlow LiquidityRouter" address={UNITFLOW.liquidityRouter} />
        <AddrRow label="UnitFlow UniversalRouter" address={UNITFLOW.universalRouter} />
      </div>

      <H2 id="contract-abis">Contract ABIs</H2>
      <P>Full ABIs live in <code>frontend/lib/arc.ts</code> (<code>FLUX_ABI</code>, <code>FLUX_LIMIT_ORDER_ABI</code>) and compile straight from source in <code>contracts/</code>. Verified source for both contracts is also readable directly on ArcScan via the addresses above. Key signatures:</P>

      <CodeBlock label="FluxSettlement — payments">{`function batchSettle(address[] recipients, uint256[] amounts) external
function createStream(address recipient, uint256 amount, uint64 startTime, uint64 endTime) external returns (uint256)
function withdrawFromStream(uint256 streamId) external
function cancelStream(uint256 streamId) external
function registerAgent(address agent, string label, uint256 budgetCap) external
function agentPay(address recipient, uint256 amount) external`}</CodeBlock>

      <CodeBlock label="FluxLimitOrder — swap escrow">{`function createOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 expiry) external returns (uint256 orderId)
function cancelOrder(uint256 orderId) external
function executeOrder(uint256 orderId, address router, bytes swapData) external
function withdraw(address token) external
function getOrderView(uint256 orderId) external view returns (Order order, bool isExpired)`}</CodeBlock>

      <CodeBlock label="FluxAgentRegistry — agent enforcement">{`function registerAgent(address agentWallet, uint256 perTxCap, uint256 dailyCap, uint256 totalCap, uint64 expiry) external returns (uint256 agentId)
function updateCaps(uint256 agentId, uint256 perTxCap, uint256 dailyCap, uint256 totalCap, uint64 expiry) external
function pause(uint256 agentId) external
function resume(uint256 agentId) external
function revoke(uint256 agentId) external
function setAllowlisted(uint256 agentId, address[] addrs, bool allowed) external
function setBlocklisted(uint256 agentId, address[] addrs, bool blocked) external
function setRestrictToAllowlist(uint256 agentId, bool restricted) external
function recordPayment(uint256 agentId, address to, uint256 amount) external
function recordExternalSpend(uint256 agentId, address to, uint256 amount) external
function getAgent(uint256 agentId) external view returns (Agent memory)
function isPayable(uint256 agentId, address to, uint256 amount) external view returns (bool ok, string reason)`}</CodeBlock>

      <H2 id="events">Events</H2>
      <CodeBlock label="FluxSettlement">{`event BatchSettled(address indexed sender, uint256 recipientCount, uint256 totalUSDC, uint256 fee, uint256 timestamp)
event StreamCreated(uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount, uint64 startTime, uint64 endTime)
event StreamWithdrawn(uint256 indexed id, address indexed recipient, uint256 amount)
event StreamCancelled(uint256 indexed id, address indexed sender, uint256 refund)
event AgentRegistered(address indexed agent, string label, uint256 budgetCap)
event AgentPayment(address indexed agent, address indexed recipient, uint256 amount)`}</CodeBlock>

      <CodeBlock label="FluxLimitOrder">{`event OrderCreated(uint256 indexed id, address indexed maker, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 expiry)
event OrderCancelled(uint256 indexed id, address indexed maker, uint256 refund)
event OrderFilled(uint256 indexed id, address indexed router, uint256 amountOut)`}</CodeBlock>

      <CodeBlock label="FluxAgentRegistry">{`event AgentRegistered(uint256 indexed agentId, address indexed owner, address indexed agentWallet, uint256 perTxCap, uint256 dailyCap, uint256 totalCap, uint64 expiry)
event CapsUpdated(uint256 indexed agentId, uint256 perTxCap, uint256 dailyCap, uint256 totalCap, uint64 expiry)
event AgentPaused(uint256 indexed agentId)
event AgentResumed(uint256 indexed agentId)
event AgentRevoked(uint256 indexed agentId)
event RecipientListUpdated(uint256 indexed agentId, address indexed recipient, bool allowlist, bool value)
event AllowlistModeSet(uint256 indexed agentId, bool restricted)
event AgentPayment(uint256 indexed agentId, address indexed to, uint256 amount, uint256 spentToday, uint256 spentTotal)`}</CodeBlock>
    </div>
  );
}
