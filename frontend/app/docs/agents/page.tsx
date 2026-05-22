function H1({ c }: { c: React.ReactNode }) { return <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:28, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:10, marginTop:0 }}>{c}</h1>; }
function H2({ c }: { c: React.ReactNode }) { return <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize:18, fontWeight:800, color:"var(--tx)", marginTop:36, marginBottom:8 }}>{c}</h2>; }
function P({ c }: { c: React.ReactNode }) { return <p style={{ fontSize:14, color:"var(--tx2)", lineHeight:1.75, fontWeight:500, marginBottom:14 }}>{c}</p>; }
function Pre({ c }: { c: string }) { return <pre style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, background:"var(--bg2)", border:"1px solid var(--bdr)", borderRadius:10, padding:"16px 18px", color:"var(--tx2)", lineHeight:1.65, overflowX:"auto", marginBottom:18 }}>{c}</pre>; }

export default function DocsAgentsPage() {
  return (
    <div>
      <H1 c="Agent Registry" />
      <P c="Register AI agent wallets with USDC spending caps. Agents can then call agentPay() autonomously to send USDC to any recipient — without requiring manual approval for each payment — as long as they stay within their cap." />

      <H2 c="Use cases" />
      <P c="AI trading bots that pay fees autonomously. Subscription services billed by an agent. Autonomous payroll agents. DeFi bots that need to pay gas or services. Any AI system that needs onchain payment authority without human-in-the-loop." />

      <H2 c="How it works" />
      <P c="1. Owner registers the agent wallet address with a label and USDC budget cap. 2. Owner deposits USDC into the contract treasury. 3. The agent calls agentPay(recipient, amount) from its own wallet. 4. Contract checks: is this wallet registered? Is amount within cap? If yes, payment executes. If no, it reverts." />

      <H2 c="Owner-only actions" />
      <P c="Register Agent and Fund Treasury require the contract deployer wallet. This is a security design — only the contract owner can whitelist agents and fund the treasury. Regular users can view registered agents but cannot modify them." />

      <H2 c="agentPay interface" />
      <Pre c={`// Called by the agent wallet, not the owner
function agentPay(address recipient, uint256 amount) external {
    require(agents[msg.sender] >= amount, "Flux: over cap");
    // transfers amount from treasury to recipient
}`} />

      <H2 c="Budget cap" />
      <P c="The budget cap is cumulative — once an agent has spent its full cap, it cannot make further payments. The owner must register a new agent or deploy a new contract to increase the cap. This is intentional: it limits blast radius if an agent is compromised." />
    </div>
  );
}
