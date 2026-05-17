"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { FLUX_ABI, FLUX_ADDRESS, formatUSDC, explorerLink } from "../../lib/arc";
import { Skeleton, Tooltip, EmptyState } from "../../components/UI";
import { useState, useEffect } from "react";

function StatCard({ label, value, sub, loading, tip }: { label: string; value: string; sub?: string; loading?: boolean; tip?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}{tip && <Tooltip text={tip} />}</div>
      {loading ? (<><Skeleton h={26} w="60%" br={5} /><div style={{ height: 5 }} /><Skeleton h={12} w="40%" br={4} /></>) : (
        <><div className="stat-num">{value}</div>{sub && <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4, fontWeight: 500 }}>{sub}</div>}</>
      )}
    </div>
  );
}

function ActionCard({ href, emoji, title, desc, primary }: { href: string; emoji: string; title: string; desc: string; primary?: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      <div className="card" style={{ cursor: "pointer", height: "100%", border: primary ? "1px solid var(--teal-20)" : "1px solid var(--bdr)", transition: "all 0.2s" }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "var(--teal)"; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)"; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = primary ? "var(--teal-20)" : "var(--bdr)"; el.style.transform = "none"; el.style.boxShadow = "none"; }}
      >
        <div className="card-p" style={{ height: "100%" }}>
          <div style={{ marginBottom: 14 }}><span style={{ fontSize: 26 }}>{emoji}</span></div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 15, color: "var(--tx)", marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.55, marginBottom: 16 }}>{desc}</div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 700, color: "var(--teal)", display: "flex", alignItems: "center", gap: 5 }}>
            Open <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 4L13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  // ── Platform stats hidden by default ──
  const [showGlobal, setShowGlobal] = useState(false);

  // ── User stream count from localStorage ──
  const [myStreamCount, setMyStreamCount] = useState<number | null>(null);

  useEffect(() => {
    if (!address) { setMyStreamCount(null); return; }
    try {
      const streams = JSON.parse(localStorage.getItem(`flux_streams_${address.toLowerCase()}`) || "[]");
      setMyStreamCount(streams.length);
    } catch { setMyStreamCount(0); }
  }, [address]);

  // ── Global platform stats ──
  const { data: stats, isLoading } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getStats",
    query: { enabled: !!FLUX_ADDRESS },
  });
  const volume  = stats ? `$${formatUSDC(stats[0])}` : "$0.00";
  const fees    = stats ? `$${formatUSDC(stats[1])}` : "$0.00";
  const batches = stats ? stats[2].toString() : "0";
  const streams = stats ? stats[3].toString() : "0";
  const agents  = stats ? stats[4].toString() : "0";

  // ── User agent count — read directly from contract ──
  const { data: allAgents } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getAllAgents",
    query: { enabled: !!FLUX_ADDRESS && isConnected },
  });
  const myAgentCount = allAgents ? (allAgents as string[]).length : null;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px" }}>

      {/* Page header */}
      <div style={{ marginBottom: 26, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: "var(--tx)", letterSpacing: "-0.03em", marginBottom: 3 }}>
            {isConnected ? "Overview" : "Dashboard"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--tx3)", fontWeight: 500 }}>
            {isConnected ? "Your payment activity on Arc Testnet." : "Connect your wallet to see your activity."}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowGlobal(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d={showGlobal ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          {showGlobal ? "Hide" : "Show"} Platform Stats
        </button>
      </div>

      {/* Platform stats — hidden by default */}
      {showGlobal && (
        <div style={{ marginBottom: 20 }}>
          <div className="lbl" style={{ marginBottom: 10 }}>PLATFORM STATS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
            <StatCard label="Total Settled"  value={volume}  sub="All time"    loading={isLoading} tip="Total USDC batch-settled through this contract." />
            <StatCard label="Fees Collected" value={fees}    sub="0.1% of vol" loading={isLoading} tip="Accumulated platform fees at 0.1% per batch." />
            <StatCard label="Batches"        value={batches} sub="Settlements" loading={isLoading} tip="Total batch settlement transactions executed." />
            <StatCard label="Streams"        value={streams} sub="Created"     loading={isLoading} tip="Total payment streams created on this contract." />
            <StatCard label="Agents"         value={agents}  sub="Registered"  loading={isLoading} tip="AI agent wallets registered with spending caps." />
          </div>
        </div>
      )}

      {/* Not connected */}
      {!isConnected ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <EmptyState icon="🔌" title="Connect your wallet" desc="Connect a wallet to view your streams, agents, and activity on Arc Testnet." />
        </div>
      ) : (
        /* Connected — user summary */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>

          {/* My address */}
          <div className="stat-card">
            <div className="stat-label">My Address</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--teal-l)", wordBreak: "break-all", lineHeight: 1.5, marginBottom: 8 }}>{address}</div>
            <a href={explorerLink("address", address!)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Manrope',sans-serif", fontSize: 12, fontWeight: 600, color: "var(--teal)", display: "inline-flex", alignItems: "center", gap: 4 }}>ArcScan ↗</a>
          </div>

          {/* My streams */}
          <div className="stat-card">
            <div className="stat-label">My Streams <Tooltip text="Payment streams you have created. Updates as you use the Streams page." /></div>
            <div className="stat-num">{myStreamCount !== null ? myStreamCount : "—"}</div>
            <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4 }}>
              <Link href="/app/streams" style={{ color: "var(--teal)", fontWeight: 600, fontSize: 12 }}>View streams →</Link>
            </div>
          </div>

          {/* My agents — reads from contract */}
          <div className="stat-card">
            <div className="stat-label">My Agents <Tooltip text="AI agent wallets registered in this contract." /></div>
            <div className="stat-num">{myAgentCount !== null ? myAgentCount : "—"}</div>
            <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4 }}>
              <Link href="/app/agents" style={{ color: "var(--teal)", fontWeight: 600, fontSize: 12 }}>Manage agents →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginBottom: 24 }}>
        <div className="lbl" style={{ marginBottom: 12 }}>ACTIONS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <ActionCard href="/app/batch" emoji="📋" title="Batch Settlement" desc="Send USDC to up to 500 recipients in a single transaction. Import CSV or add manually." primary />
          <ActionCard href="/app/streams" emoji="⚡" title="Payment Streams" desc="Linear USDC vesting for payroll, contractor agreements, and token grants. Cancel anytime." />
          <ActionCard href="/app/agents" emoji="🤖" title="Agent Registry" desc="Register AI wallets with USDC spending caps for fully autonomous onchain commerce." />
        </div>
      </div>

      {/* Bottom info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card">
          <div className="card-hd">
            <div className="lbl" style={{ marginBottom: 0 }}>Contract</div>
            {FLUX_ADDRESS && <a href={explorerLink("address", FLUX_ADDRESS)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Manrope',sans-serif", fontSize: 12, fontWeight: 600, color: "var(--teal)" }}>ArcScan ↗</a>}
          </div>
          <div className="card-p">
            {FLUX_ADDRESS ? <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--tx2)", wordBreak: "break-all", marginBottom: 14, lineHeight: 1.6 }}>{FLUX_ADDRESS}</div> : <div className="banner warn" style={{ marginBottom: 14 }}>Contract not deployed.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[["Chain ID","5042002"],["RPC","rpc.testnet.arc.network"],["Gas token","USDC (native)"],["Finality","< 1 second"],["Platform fee","0.1% on batch"]].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 500 }}>{k}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--tx2)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><div className="lbl" style={{ marginBottom: 0 }}>Getting Started</div><span className="chip chip-teal" style={{ fontSize: 10 }}>Checklist</span></div>
          <div className="card-p">
            {[
              { n:"1", t:"Add Arc Testnet to MetaMask", s:"Chain ID 5042002", done: false },
              { n:"2", t:"Get test USDC",               s:"faucet.circle.com", done: false },
              { n:"3", t:"Connect your wallet",         s:"Top-right nav button", done: isConnected },
              { n:"4", t:"Try Batch Settlement",        s:"Send to multiple wallets at once", done: false },
              { n:"5", t:"Create a Stream",             s:"Set up linear payroll vesting", done: (myStreamCount ?? 0) > 0 },
            ].map(s => (
              <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 11, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: s.done ? "var(--teal-10)" : "var(--bg3)", border: `1px solid ${s.done ? "var(--teal-20)" : "var(--bdr)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: s.done ? "var(--teal)" : "var(--tx3)" }}>
                  {s.done ? "✓" : s.n}
                </div>
                <div>
                  <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 700, color: s.done ? "var(--tx3)" : "var(--tx)", marginBottom: 1, textDecoration: s.done ? "line-through" : "none" }}>{s.t}</div>
                  <div style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 500 }}>{s.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}