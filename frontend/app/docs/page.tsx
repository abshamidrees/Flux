import Link from "next/link";

function H1({ children }: { children: React.ReactNode }) {
  return <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:32, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:12, marginTop:0 }}>{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize:20, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.02em", marginTop:40, marginBottom:10 }}>{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontFamily:"'Manrope',sans-serif", fontSize:15, fontWeight:700, color:"var(--tx)", marginTop:24, marginBottom:6 }}>{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize:14, color:"var(--tx2)", lineHeight:1.75, fontWeight:500, marginBottom:14 }}>{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, background:"var(--bg3)", border:"1px solid var(--bdr)", borderRadius:5, padding:"1px 6px", color:"var(--teal-l)" }}>{children}</code>;
}
function Pre({ children }: { children: React.ReactNode }) {
  return <pre style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, background:"var(--bg2)", border:"1px solid var(--bdr)", borderRadius:10, padding:"16px 18px", color:"var(--tx2)", lineHeight:1.65, overflowX:"auto", marginBottom:18 }}>{children}</pre>;
}
function Callout({ color = "teal", children }: { color?: "teal"|"amber"|"red"; children: React.ReactNode }) {
  const colors = { teal:"rgba(20,184,166,0.08)", amber:"rgba(234,179,8,0.08)", red:"rgba(239,68,68,0.08)" };
  const borders = { teal:"rgba(20,184,166,0.2)", amber:"rgba(234,179,8,0.2)", red:"rgba(239,68,68,0.2)" };
  return <div style={{ background:colors[color], border:`1px solid ${borders[color]}`, borderRadius:10, padding:"13px 16px", marginBottom:16, fontSize:13, color:"var(--tx2)", fontWeight:500, lineHeight:1.6 }}>{children}</div>;
}
function FeatureCard({ emoji, title, desc, href }: { emoji:string; title:string; desc:string; href:string }) {
  return (
    <Link href={href} style={{ textDecoration:"none" }}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--bdr)", borderRadius:12, padding:"18px 20px", cursor:"pointer", transition:"all 0.18s" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--teal)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--bdr)"; }}
      >
        <div style={{ fontSize:22, marginBottom:8 }}>{emoji}</div>
        <div style={{ fontFamily:"'Manrope',sans-serif", fontWeight:800, fontSize:14, color:"var(--tx)", marginBottom:4 }}>{title}</div>
        <div style={{ fontSize:12, color:"var(--tx3)", fontWeight:500, lineHeight:1.5 }}>{desc}</div>
      </div>
    </Link>
  );
}

export default function DocsIndexPage() {
  return (
    <div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"var(--teal-10)", border:"1px solid var(--teal-20)", borderRadius:999, padding:"3px 12px", marginBottom:16 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--teal)", display:"inline-block" }} />
        <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:11, fontWeight:700, color:"var(--teal)" }}>Arc Testnet</span>
      </div>

      <H1>Flux Documentation</H1>
      <P>Flux is programmable USDC payment infrastructure built on Arc. Send batch payments, create vesting streams, and deploy autonomous AI agent wallets — all settled in a single smart contract with sub-second finality.</P>

      <Callout color="teal">
        Flux is currently live on <strong>Arc Testnet</strong> (Chain ID: 5042002). USDC is the native gas token — no ETH required. Transactions confirm in under 0.5 seconds.
      </Callout>

      <H2>Core Features</H2>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:32 }}>
        <FeatureCard emoji="📋" title="Batch Settlement" desc="Pay up to 500 wallets in one transaction. CSV upload or manual entry." href="/docs/batch" />
        <FeatureCard emoji="⚡" title="Payment Streams" desc="Linear USDC vesting for payroll, grants, and contractor agreements." href="/docs/streams" />
        <FeatureCard emoji="🤖" title="Agent Registry" desc="Register AI wallets with USDC spending caps for autonomous commerce." href="/docs/agents" />
      </div>

      <H2>How It Works</H2>
      <P>All three features live in a single deployed smart contract — <Code>FluxSettlement.sol</Code>. Users interact through the Flux web app at <Code>fluxonarc.xyz</Code>. Wallet connection is handled via Privy (MetaMask or email login). Every transaction settles on-chain on Arc Testnet.</P>

      <H2>Quick Start</H2>
      <H3>1. Add Arc Testnet to MetaMask</H3>
      <Pre>{`Network Name:   Arc Testnet
RPC URL:        https://rpc.testnet.arc.network
Chain ID:       5042002
Currency:       USDC
Explorer:       https://testnet.arcscan.app`}</Pre>

      <H3>2. Get Test USDC</H3>
      <P>Go to <strong>faucet.circle.com</strong>, select Arc Testnet, and request USDC to your wallet address. You'll receive testnet USDC for free.</P>

      <H3>3. Connect and use Flux</H3>
      <P>Visit <strong>fluxonarc.xyz</strong>, click "Connect Wallet" in the top-right, and choose MetaMask or email login. Once connected, your USDC balance appears in the navbar and all features unlock.</P>

      <H2>Contract</H2>
      <Pre>{`Address:  0x0BBBc1C77ada4d584445383B77b88DDdDAae2F6A
Network:  Arc Testnet (Chain ID 5042002)
USDC:     0x3600000000000000000000000000000000000000
Fee:      0.1% on batch settlements
Finality: < 0.5 seconds`}</Pre>

      <H2>Explorer</H2>
      <P>All transactions are publicly visible on <strong>ArcScan</strong> at <Code>testnet.arcscan.app</Code>. Every stream, batch, and agent payment is logged on-chain permanently.</P>
    </div>
  );
}
