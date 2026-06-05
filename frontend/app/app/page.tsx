"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useState, useEffect } from "react";
import { FLUX_ABI, FLUX_ADDRESS, formatUSDC, explorerLink } from "../../lib/arc";
import { fetchStreams, fetchBatchHistory } from "../../lib/blockchain";
import { Skeleton, Tooltip, EmptyState } from "../../components/UI";

function StatCard({ label, value, sub, loading, tip }: { label: string; value: string; sub?: string; loading?: boolean; tip?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {tip ? <Tooltip text={tip}>{label}</Tooltip> : label}
      </div>
      {loading ? (
        <><Skeleton h={26} w="60%" br={5} /><div style={{ height:5 }} /><Skeleton h={12} w="40%" br={4} /></>
      ) : (
        <><div className="stat-num">{value}</div>{sub && <div style={{ fontSize:12, color:"var(--tx3)", marginTop:4, fontWeight:500 }}>{sub}</div>}</>
      )}
    </div>
  );
}

function ActionCard({ href, emoji, title, desc, primary }: { href: string; emoji: string; title: string; desc: string; primary?: boolean }) {
  return (
    <Link href={href} style={{ textDecoration:"none", display:"block" }}>
      <div className="card" style={{ cursor:"pointer", height:"100%", border: primary ? "1px solid var(--teal-20)" : "1px solid var(--bdr)", transition:"all 0.2s" }}
        onMouseEnter={e => { const el=e.currentTarget as HTMLDivElement; el.style.borderColor="var(--teal)"; el.style.transform="translateY(-2px)"; el.style.boxShadow="0 8px 24px rgba(0,0,0,0.3)"; }}
        onMouseLeave={e => { const el=e.currentTarget as HTMLDivElement; el.style.borderColor=primary?"var(--teal-20)":"var(--bdr)"; el.style.transform="none"; el.style.boxShadow="none"; }}
      >
        <div className="card-p" style={{ height:"100%" }}>
          <div style={{ marginBottom:14 }}><span style={{ fontSize:26 }}>{emoji}</span></div>
          <div style={{ fontFamily:"'Manrope',sans-serif", fontWeight:800, fontSize:15, color:"var(--tx)", marginBottom:6 }}>{title}</div>
          <div style={{ fontSize:13, color:"var(--tx2)", lineHeight:1.55, marginBottom:16 }}>{desc}</div>
          <div style={{ fontFamily:"'Manrope',sans-serif", fontSize:13, fontWeight:700, color:"var(--teal)", display:"flex", alignItems:"center", gap:5 }}>
            Open <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 4L13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const [showGlobal, setShowGlobal] = useState(false);

  // ── Live from blockchain ──────────────────────────────────
  const [myStreamCount, setMyStreamCount] = useState<number | null>(null);
  const [myBatchCount,  setMyBatchCount]  = useState<number | null>(null);
  const [myDataLoading, setMyDataLoading] = useState(false);

  useEffect(() => {
    if (!address || !FLUX_ADDRESS) { setMyStreamCount(null); setMyBatchCount(null); return; }
    setMyDataLoading(true);
    Promise.all([
      fetchStreams(address).then(s => setMyStreamCount(s.length)).catch(() => setMyStreamCount(0)),
      fetchBatchHistory(address).then(b => setMyBatchCount(b.length)).catch(() => setMyBatchCount(0)),
    ]).finally(() => setMyDataLoading(false));
  }, [address]);

  // ── Platform stats ────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getStats",
    query: { enabled: !!FLUX_ADDRESS },
  });
  const volume  = stats ? `$${formatUSDC(stats[0])}` : "$0.00";
  const fees    = stats ? `$${formatUSDC(stats[1])}` : "$0.00";
  const batches = stats ? stats[2].toString() : "0";
  const streams = stats ? stats[3].toString() : "0";
  const agents  = stats ? stats[4].toString() : "0";

  // ── Agent count from contract ─────────────────────────────
  const { data: allAgents } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getAllAgents",
    query: { enabled: !!FLUX_ADDRESS && isConnected },
  });
  const myAgentCount = allAgents ? (allAgents as string[]).length : null;

  return (
    <div className="page-pad" style={{ maxWidth:1120, margin:"0 auto", padding:"32px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom:26, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>
            {isConnected ? "Overview" : "Dashboard"}
          </h1>
          <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>
            {isConnected ? "Your payment activity on Arc Testnet." : "Connect your wallet to see your activity."}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowGlobal(v=>!v)} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d={showGlobal?"M2 8l4-4 4 4":"M2 4l4 4 4-4"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          {showGlobal?"Hide":"Show"} Platform Stats
        </button>
      </div>

      {/* Platform stats */}
      {showGlobal && (
        <div style={{ marginBottom:20 }}>
          <div className="lbl" style={{ marginBottom:10 }}>PLATFORM STATS</div>
          <div className="grid-stats" style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
            <StatCard label="Total Settled"  value={volume}  sub="All time"    loading={statsLoading} tip="Total USDC batch-settled through this contract." />
            <StatCard label="Fees Collected" value={fees}    sub="0.1% of vol" loading={statsLoading} tip="Accumulated platform fees at 0.1% per batch." />
            <StatCard label="Batches"        value={batches} sub="Settlements" loading={statsLoading} tip="Total batch settlement transactions executed." />
            <StatCard label="Streams"        value={streams} sub="Created"     loading={statsLoading} tip="Total payment streams created on this contract." />
            <StatCard label="Agents"         value={agents}  sub="Registered"  loading={statsLoading} tip="AI agent wallets registered with spending caps." />
          </div>
        </div>
      )}

      {/* Not connected */}
      {!isConnected ? (
        <div className="card" style={{ marginBottom:20 }}>
          <EmptyState icon="🔌" title="Connect your wallet" desc="Connect a wallet to view your streams, batches, agents, and activity on Arc Testnet." />
        </div>
      ) : (
        /* User summary — live from blockchain */
        <div className="grid-user" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>

          {/* Address */}
          <div className="stat-card">
            <div className="stat-label">My Address</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal-l)", wordBreak:"break-all", lineHeight:1.5, marginBottom:8 }}>{address}</div>
            <a href={explorerLink("address", address!)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'Manrope',sans-serif", fontSize:12, fontWeight:600, color:"var(--teal)", display:"inline-flex", alignItems:"center", gap:4 }}>ArcScan ↗</a>
          </div>

          {/* My Streams — live from ArcScan */}
          <div className="stat-card">
            <div className="stat-label">
              <Tooltip text="Payment streams you have created. Loaded live from the blockchain.">My Streams</Tooltip>
            </div>
            {myDataLoading ? <Skeleton h={26} w="50%" br={5} /> : (
              <div className="stat-num">{myStreamCount !== null ? myStreamCount : "—"}</div>
            )}
            <div style={{ fontSize:12, color:"var(--tx3)", marginTop:4 }}>
              <Link href="/app/streams" style={{ color:"var(--teal)", fontWeight:600, fontSize:12 }}>View streams →</Link>
            </div>
          </div>

          {/* My Agents */}
          <div className="stat-card">
            <div className="stat-label">
              <Tooltip text="AI agent wallets registered in the contract with USDC spending caps.">My Agents</Tooltip>
            </div>
            <div className="stat-num">{myAgentCount !== null ? myAgentCount : "—"}</div>
            <div style={{ fontSize:12, color:"var(--tx3)", marginTop:4 }}>
              <Link href="/app/agents" style={{ color:"var(--teal)", fontWeight:600, fontSize:12 }}>Manage agents →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginBottom:24 }}>
        <div className="lbl" style={{ marginBottom:12 }}>ACTIONS</div>
        <div className="grid-1-mobile" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          <ActionCard href="/app/batch"   emoji="📋" title="Batch Settlement"  desc="Send USDC to up to 500 recipients in a single transaction. Import CSV or add manually." primary />
          <ActionCard href="/app/streams" emoji="⚡" title="Payment Streams"   desc="Linear USDC vesting for payroll, contractor agreements, and token grants. Cancel anytime." />
          <ActionCard href="/app/agents"  emoji="🤖" title="Agent Registry"    desc="Register AI wallets with USDC spending caps for fully autonomous onchain commerce." />
        </div>
      </div>
    </div>
  );
}