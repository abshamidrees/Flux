"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useState, useEffect } from "react";
import { FLUX_ABI, FLUX_ADDRESS, FLUX_AGENT_REGISTRY_ABI, FLUX_AGENT_REGISTRY_ADDRESS, formatUSDC, explorerLink } from "../../lib/arc";
import { fetchStreams, fetchBatchHistory, fetchTotalStreamedVolume, fetchMyAgents } from "../../lib/blockchain";
import { Skeleton, Tooltip, EmptyState } from "../../components/UI";
import { IconBatch, IconStream, IconAgent, IconPlug } from "../../components/icons";
import { ReactNode } from "react";

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

function ActionCard({ href, icon, title, desc, primary }: { href: string; icon: ReactNode; title: string; desc: string; primary?: boolean }) {
  return (
    <Link href={href} style={{ textDecoration:"none", display:"block" }}>
      <div className="card" style={{ cursor:"pointer", height:"100%", border: primary ? "1px solid var(--teal-20)" : "1px solid var(--bdr)", transition:"all 0.2s" }}
        onMouseEnter={e => { const el=e.currentTarget as HTMLDivElement; el.style.borderColor="var(--teal)"; el.style.transform="translateY(-2px)"; el.style.boxShadow="0 8px 24px rgba(0,0,0,0.3)"; }}
        onMouseLeave={e => { const el=e.currentTarget as HTMLDivElement; el.style.borderColor=primary?"var(--teal-20)":"var(--bdr)"; el.style.transform="none"; el.style.boxShadow="none"; }}
      >
        <div className="card-p" style={{ height:"100%" }}>
          <div style={{ marginBottom:14, color:"var(--teal)" }}>{icon}</div>
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

  const [myAgentCount, setMyAgentCount] = useState<number | null>(null);

  useEffect(() => {
    if (!address || !FLUX_ADDRESS) { setMyStreamCount(null); setMyBatchCount(null); return; }
    setMyDataLoading(true);
    Promise.all([
      fetchStreams(address).then(s => setMyStreamCount(s.length)).catch(() => setMyStreamCount(0)),
      fetchBatchHistory(address).then(b => setMyBatchCount(b.length)).catch(() => setMyBatchCount(0)),
    ]).finally(() => setMyDataLoading(false));
  }, [address]);

  // Agents live in FluxAgentRegistry (Phase H3+), a separate contract from
  // FluxSettlement — this used to read FluxSettlement's own getAllAgents(),
  // the old custodial registry, which never sees anything registered
  // through the current /agents page. Same event-log fetch the Agents page
  // itself uses, so the two numbers can never disagree.
  useEffect(() => {
    if (!address || !FLUX_AGENT_REGISTRY_ADDRESS) { setMyAgentCount(null); return; }
    fetchMyAgents(address).then(a => setMyAgentCount(a.length)).catch(() => setMyAgentCount(0));
  }, [address]);

  // ── Platform stats ────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getStats",
    query: { enabled: !!FLUX_ADDRESS },
  });
  const volume  = stats ? `$${formatUSDC(stats[0])}` : "$0.00";
  const batches = stats ? stats[2].toString() : "0";
  const streams = stats ? stats[3].toString() : "0";

  // Same fix as myAgentCount above: total agent count now comes from
  // FluxAgentRegistry.nextAgentId() (agent IDs are sequential from 0, so
  // this is a direct all-time count), not FluxSettlement's stale counter.
  const { data: nextAgentId, isLoading: agentsCountLoading } = useReadContract({
    address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI, functionName: "nextAgentId",
    query: { enabled: !!FLUX_AGENT_REGISTRY_ADDRESS },
  });
  const agents = nextAgentId !== undefined ? nextAgentId.toString() : "0";

  // Total streamed — protocol-wide, direct from Flux's own StreamCreated
  // events (unfiltered, every stream any address has ever created).
  const [totalStreamed, setTotalStreamed] = useState<bigint | null>(null);
  const [streamedLoading, setStreamedLoading] = useState(false);
  useEffect(() => {
    if (!FLUX_ADDRESS) return;
    setStreamedLoading(true);
    fetchTotalStreamedVolume()
      .then(setTotalStreamed)
      .catch(() => setTotalStreamed(0n))
      .finally(() => setStreamedLoading(false));
  }, []);

  return (
    <div className="page-pad">

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
          <div className="grid-stats">
            <StatCard label="Total Settled"  value={volume}  sub="All time"    loading={statsLoading} tip="Total USDC batch-settled through this contract." />
            <StatCard
              label="Total Streamed"
              value={totalStreamed != null ? `$${formatUSDC(totalStreamed)}` : "$0.00"}
              sub="All time"
              loading={streamedLoading}
              tip="Total USDC committed across every payment stream ever created on this contract."
            />
            <StatCard label="Batches"        value={batches} sub="Settlements" loading={statsLoading} tip="Total batch settlement transactions executed." />
            <StatCard label="Streams"        value={streams} sub="Created"     loading={statsLoading} tip="Total payment streams created on this contract." />
            <StatCard label="Agents"         value={agents}  sub="Registered"  loading={agentsCountLoading} tip="AI agent wallets registered with spending caps." />
          </div>
        </div>
      )}

      {/* Not connected */}
      {!isConnected ? (
        <div className="card" style={{ marginBottom:20 }}>
          <EmptyState icon={<IconPlug size={28} />} title="Connect your wallet" desc="Connect a wallet to view your streams, batches, agents, and activity on Arc Testnet." />
        </div>
      ) : (
        /* User summary — live from blockchain */
        <div className="grid-user" style={{ marginBottom:20 }}>

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
              <Link href="/streams" style={{ color:"var(--teal)", fontWeight:600, fontSize:12 }}>View streams →</Link>
            </div>
          </div>

          {/* My Agents */}
          <div className="stat-card">
            <div className="stat-label">
              <Tooltip text="AI agent wallets registered in the contract with USDC spending caps.">My Agents</Tooltip>
            </div>
            <div className="stat-num">{myAgentCount !== null ? myAgentCount : "—"}</div>
            <div style={{ fontSize:12, color:"var(--tx3)", marginTop:4 }}>
              <Link href="/agents" style={{ color:"var(--teal)", fontWeight:600, fontSize:12 }}>Manage agents →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginBottom:24 }}>
        <div className="lbl" style={{ marginBottom:12 }}>ACTIONS</div>
        <div className="grid-1-mobile">
          <ActionCard href="/batch"   icon={<IconBatch size={26} />}  title="Batch Settlement"  desc="Send USDC to up to 500 recipients in a single transaction. Import CSV or add manually." primary />
          <ActionCard href="/streams" icon={<IconStream size={26} />} title="Payment Streams"   desc="Linear USDC vesting for payroll, contractor agreements, and token grants. Cancel anytime." />
          <ActionCard href="/agents"  icon={<IconAgent size={26} />}  title="Agent Registry"    desc="Register AI wallets with USDC spending caps for fully autonomous onchain commerce." />
        </div>
      </div>
    </div>
  );
}