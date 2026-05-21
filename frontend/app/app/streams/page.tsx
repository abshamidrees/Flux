"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { createPublicClient, http, parseAbiItem } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import {
  FLUX_ABI, FLUX_ADDRESS, USDC_ABI, USDC_ADDRESS,
  parseUSDC, formatUSDC, explorerLink, FLUX_DEPLOY_BLOCK
} from "../../../lib/arc";
import { Tooltip, ConfirmModal, EmptyState, TxBanner } from "../../../components/UI";

// ── Standalone viem client — bypasses wagmi/Privy hook issues ──
const rpcClient = createPublicClient({
  chain: {
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  } as any,
  transport: http("https://rpc.testnet.arc.network"),
});

// ── Inline event ABIs — no dependency on FLUX_ABI type ──
const EV_STREAM_CREATED   = parseAbiItem("event StreamCreated(uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount, uint64 startTime, uint64 endTime)");
const EV_STREAM_CANCELLED = parseAbiItem("event StreamCancelled(uint256 indexed id, address indexed sender, uint256 refund)");
const EV_STREAM_WITHDRAWN = parseAbiItem("event StreamWithdrawn(uint256 indexed id, address indexed recipient, uint256 amount)");

// ── Parallel chunked getLogs — handles any RPC block-range limit ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchChunk(params: any, f: bigint, t: bigint, retries = 3): Promise<any[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try { return await rpcClient.getLogs({ ...params, fromBlock: f, toBlock: t }); }
    catch { if (attempt < retries - 1) await new Promise(r => setTimeout(r, 400 * (attempt + 1))); }
  }
  return []; // return empty after all retries (never crash)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLogsChunked(params: any, fromBlock: bigint, toBlock: bigint, chunkSize = 5_000n): Promise<any[]> {
  // Always chunk — never gamble on full-range succeeding
  const chunks: Array<{ f: bigint; t: bigint }> = [];
  for (let f = fromBlock; f <= toBlock; f += chunkSize) {
    chunks.push({ f, t: f + chunkSize - 1n < toBlock ? f + chunkSize - 1n : toBlock });
  }
  // Fetch 6 in parallel; allSettled so one failure never drops the rest
  const BATCH = 6;
  const all: any[] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const results = await Promise.allSettled(
      chunks.slice(i, i + BATCH).map(({ f, t }) => fetchChunk(params, f, t))
    );
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
  }
  return all;
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;

type StreamStatus = "active" | "finished" | "cancelled" | "withdrawn";
interface StreamItem {
  id: bigint; recipient: string; amount: bigint;
  startTime: bigint; endTime: bigint; txHash?: string; status: StreamStatus;
}

function getDisplayStatus(s: StreamItem): StreamStatus {
  if (s.status === "cancelled" || s.status === "withdrawn") return s.status;
  if (Number(s.endTime) * 1000 < Date.now()) return "finished";
  return "active";
}

function StatusBadge({ status }: { status: StreamStatus }) {
  const cfg = {
    active:    { label: "● Active",    bg: "var(--teal-10)",         color: "var(--teal)", border: "var(--teal-20)" },
    finished:  { label: "✓ Finished",  bg: "rgba(100,116,139,0.12)", color: "#94a3b8",    border: "rgba(100,116,139,0.25)" },
    cancelled: { label: "✕ Cancelled", bg: "rgba(239,68,68,0.08)",   color: "#f87171",    border: "rgba(239,68,68,0.2)" },
    withdrawn: { label: "↓ Withdrawn", bg: "rgba(139,92,246,0.1)",   color: "#a78bfa",    border: "rgba(139,92,246,0.2)" },
  } as const;
  const c = cfg[status];
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
}

function FieldError({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>⚠ {msg}</div>;
}

function VestingPreview({ amount, startDate, endDate }: { amount: string; startDate: string; endDate: string }) {
  if (!amount || !startDate || !endDate) return null;
  const dur = Math.max(0, (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
  if (dur <= 0) return null;
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 9, padding: "14px 16px" }}>
      <div className="lbl" style={{ marginBottom: 10 }}>Preview</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Duration</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{dur.toFixed(0)} days</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Daily rate</span>
        <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 800, color: "var(--teal)" }}>${(parseFloat(amount) / dur).toFixed(4)} / day</span>
      </div>
      <div className="prog-track"><div className="prog-fill" style={{ width: "0%", background: "var(--teal)" }} /></div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--tx3)", marginTop: 5 }}>0% released — not started yet</div>
    </div>
  );
}

export default function StreamsPage() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [tab, setTab] = useState<"create" | "history">("create");
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [loadError, setLoadError] = useState("");

  const recipVal = useRef(""); const amountVal = useRef("");
  const startVal = useRef(""); const endVal = useRef("");
  const [previewAmount, setPreviewAmount] = useState("");
  const [previewStart, setPreviewStart] = useState(""); const [previewEnd, setPreviewEnd] = useState("");
  const [createErr, setCreateErr] = useState(""); const [busy, setBusy] = useState(false);
  const [cTx, setCTx] = useState<`0x${string}` | undefined>(); const [confirm, setConfirm] = useState(false);
  const [snap, setSnap] = useState({ recip: "", amount: "", start: "", end: "" });

  const wIdVal = useRef(""); const [wId, setWId] = useState("");
  const [wErr, setWErr] = useState(""); const [wBusy, setWBusy] = useState(false);
  const [wTx, setWTx] = useState<`0x${string}` | undefined>(); const [wConfirm, setWConfirm] = useState(false); const [wSnap, setWSnap] = useState("");

  const cnIdVal = useRef(""); const [cnId, setCnId] = useState("");
  const [cnErr, setCnErr] = useState(""); const [cnBusy, setCnBusy] = useState(false);
  const [cnTx, setCnTx] = useState<`0x${string}` | undefined>(); const [cnConfirm, setCnConfirm] = useState(false); const [cnSnap, setCnSnap] = useState("");

  const { isLoading: cConf } = useWaitForTransactionReceipt({ hash: cTx });
  const { isLoading: wConf } = useWaitForTransactionReceipt({ hash: wTx });
  const { isLoading: cnConf } = useWaitForTransactionReceipt({ hash: cnTx });

  // ── Fetch ALL streams from blockchain ─────────────────────
  const fetchStreams = useCallback(async () => {
    if (!address || !FLUX_ADDRESS) return;
    setLoadingStreams(true); setLoadError("");
    try {
      const addr = FLUX_ADDRESS as `0x${string}`;
      const toBlock = await rpcClient.getBlockNumber();
      const fromBlock = toBlock > FLUX_DEPLOY_BLOCK ? FLUX_DEPLOY_BLOCK : 0n;

      // All 3 queries run in parallel
      const [created, cancelled, withdrawn] = await Promise.all([
        getLogsChunked({ address: addr, event: EV_STREAM_CREATED,   args: { sender: address as `0x${string}` } }, fromBlock, toBlock),
        getLogsChunked({ address: addr, event: EV_STREAM_CANCELLED, args: { sender: address as `0x${string}` } }, fromBlock, toBlock),
        getLogsChunked({ address: addr, event: EV_STREAM_WITHDRAWN }, fromBlock, toBlock),
      ]);

      const cancelledIds = new Set((cancelled as any[]).map((e: any) => e.args?.id?.toString()));
      const createdIds   = new Set((created as any[]).map((e: any) => e.args?.id?.toString()));
      const withdrawnIds = new Set((withdrawn as any[]).filter((e: any) => createdIds.has(e.args?.id?.toString())).map((e: any) => e.args?.id?.toString()));

      const order: Record<string, number> = { active: 0, finished: 1, withdrawn: 2, cancelled: 3 };
      const items: StreamItem[] = (created as any[])
        .map((e: any) => {
          const a = e.args;
          const idStr = a?.id?.toString();
          return {
            id: a?.id as bigint, recipient: a?.recipient, amount: a?.amount,
            startTime: a?.startTime, endTime: a?.endTime,
            txHash: e.transactionHash ?? undefined,
            status: (cancelledIds.has(idStr) ? "cancelled" : withdrawnIds.has(idStr) ? "withdrawn" : "active") as StreamStatus,
          };
        })
        .sort((a, b) => {
          const sa = getDisplayStatus(a), sb = getDisplayStatus(b);
          if (sa !== sb) return order[sa] - order[sb];
          return Number(b.id) - Number(a.id);
        });

      setStreams(items);
    } catch (err: any) {
      console.error("fetchStreams error:", err);
      setLoadError(`Error: ${(err?.message || String(err)).slice(0, 120)}`);
    } finally { setLoadingStreams(false); }
  }, [address]);

  useEffect(() => { fetchStreams(); }, [fetchStreams]);

  useWatchContractEvent({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, eventName: "StreamCreated",
    enabled: !!FLUX_ADDRESS,
    onLogs: () => { fetchStreams(); setTab("history"); },
  });

  // ── Create ────────────────────────────────────────────────
  const handleCreateClick = () => {
    setCreateErr("");
    const recip = recipVal.current.trim(), amount = amountVal.current.trim();
    const start = startVal.current.trim(), end = endVal.current.trim();
    if (!recip) { setCreateErr("Recipient address is required"); return; }
    if (!ADDR.test(recip)) { setCreateErr("Invalid address — 0x + 40 hex characters"); return; }
    if (!amount || parseFloat(amount) <= 0) { setCreateErr("Enter a USDC amount greater than 0"); return; }
    if (!start) { setCreateErr("Start date is required"); return; }
    if (!end)   { setCreateErr("End date is required"); return; }
    if (new Date(end) <= new Date(start)) { setCreateErr("End date must be after start date"); return; }
    setSnap({ recip, amount, start, end }); setConfirm(true);
  };

  const doCreate = async () => {
    setConfirm(false); setBusy(true);
    if (!FLUX_ADDRESS || !USDC_ADDRESS) { setCreateErr("Contracts not deployed"); setBusy(false); return; }
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const rawS = Math.floor(new Date(snap.start).getTime() / 1000);
      const s = rawS < nowSec + 60 ? nowSec + 120 : rawS;
      const e = Math.floor(new Date(snap.end).getTime() / 1000);
      const a = parseUSDC(snap.amount);
      await writeContractAsync({ address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [FLUX_ADDRESS as `0x${string}`, a] });
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "createStream", args: [snap.recip as `0x${string}`, a, BigInt(s), BigInt(e)], gas: 300_000n });
      setCTx(tx);
    } catch (e: unknown) { setCreateErr((e as any).shortMessage?.slice(0, 140) || "Transaction failed"); }
    finally { setBusy(false); }
  };

  // ── Withdraw ──────────────────────────────────────────────
  const handleWithdrawClick = () => {
    setWErr(""); const id = wIdVal.current.trim();
    if (!id || isNaN(Number(id)) || Number(id) < 0) { setWErr("Enter a valid stream ID (e.g. 0)"); return; }
    setWSnap(id); setWConfirm(true);
  };
  const doWithdraw = async () => {
    setWConfirm(false); setWBusy(true);
    try {
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "withdrawFromStream", args: [BigInt(wSnap)], gas: 300_000n });
      setWTx(tx);
      setStreams(prev => prev.map(s => s.id.toString() === wSnap ? { ...s, status: "withdrawn" } : s));
      setTimeout(fetchStreams, 3000);
    } catch (e: unknown) { setWErr((e as any).shortMessage?.slice(0, 140) || "Failed"); }
    finally { setWBusy(false); }
  };

  // ── Cancel ────────────────────────────────────────────────
  const handleCancelClick = () => {
    setCnErr(""); const id = cnIdVal.current.trim();
    if (!id || isNaN(Number(id)) || Number(id) < 0) { setCnErr("Enter a valid stream ID (e.g. 0)"); return; }
    setCnSnap(id); setCnConfirm(true);
  };
  const doCancel = async () => {
    setCnConfirm(false); setCnBusy(true);
    try {
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "cancelStream", args: [BigInt(cnSnap)], gas: 300_000n });
      setCnTx(tx);
      setStreams(prev => prev.map(s => s.id.toString() === cnSnap ? { ...s, status: "cancelled" } : s));
      setTimeout(fetchStreams, 3000);
    } catch (e: unknown) { setCnErr((e as any).shortMessage?.slice(0, 140) || "Failed"); }
    finally { setCnBusy(false); }
  };

  const fillWithdraw = (id: string) => { wIdVal.current = id; setWId(id); setTab("create"); setTimeout(() => document.getElementById("w-id")?.focus(), 100); };
  const fillCancel   = (id: string) => { cnIdVal.current = id; setCnId(id); setTab("create"); setTimeout(() => document.getElementById("cn-id")?.focus(), 100); };
  const activeCount  = streams.filter(s => getDisplayStatus(s) === "active").length;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px" }}>
      {confirm && <ConfirmModal title="Create Payment Stream" message={<div><p style={{ marginBottom:12 }}>Confirm stream:</p><div style={{ background:"var(--bg3)", borderRadius:9, padding:"14px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}><div style={{ marginBottom:5, wordBreak:"break-all" }}><span style={{ color:"var(--tx3)" }}>To: </span>{snap.recip}</div><div style={{ marginBottom:5 }}><span style={{ color:"var(--tx3)" }}>Amount: </span><span style={{ color:"var(--teal)", fontWeight:700 }}>${parseFloat(snap.amount).toFixed(2)} USDC</span></div><div style={{ marginBottom:5 }}><span style={{ color:"var(--tx3)" }}>Start: </span>{snap.start}</div><div><span style={{ color:"var(--tx3)" }}>End: </span>{snap.end}</div></div></div>} confirmLabel="Create Stream" onConfirm={doCreate} onCancel={() => setConfirm(false)} />}
      {wConfirm  && <ConfirmModal title="Withdraw Vested USDC" message={<p>Claim all vested USDC from stream <strong>#{wSnap}</strong>.</p>} confirmLabel="Withdraw" onConfirm={doWithdraw} onCancel={() => setWConfirm(false)} />}
      {cnConfirm && <ConfirmModal title="Cancel Stream" danger message={<p>Cancel stream <strong>#{cnSnap}</strong>. Vested → recipient. Unvested → you.</p>} confirmLabel="Cancel Stream" onConfirm={doCancel} onCancel={() => setCnConfirm(false)} />}

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>Payment Streams</h1>
        <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>Linear USDC vesting for payroll, grants, and contractor agreements.</p>
      </div>

      <div className="tabs" style={{ maxWidth:280, marginBottom:22 }}>
        <button className={`tab ${tab==="create"?"active":""}`} onClick={() => setTab("create")}>Create</button>
        <button className={`tab ${tab==="history"?"active":""}`} onClick={() => setTab("history")} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <span>My Streams</span>
          {streams.length > 0 && <span style={{ background:"var(--teal)", color:"var(--bg)", fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0, lineHeight:"18px" }}>{streams.length}</span>}
        </button>
      </div>

      {tab === "create" ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div className="card">
            <div className="card-hd"><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--teal-10)", border:"1px solid var(--teal-20)", display:"flex", alignItems:"center", justifyContent:"center" }}>⚡</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--tx)" }}>Create Stream</span></div></div>
            <div className="card-p">
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div><label className="lbl">Recipient Address</label><input className="inp" placeholder="0x..." onChange={e => { recipVal.current = e.target.value; setCreateErr(""); }} /></div>
                <div><label className="lbl">Total USDC Amount</label><input className="inp" placeholder="1000.00" type="number" min="0" step="0.01" onChange={e => { amountVal.current = e.target.value; setPreviewAmount(e.target.value); setCreateErr(""); }} /></div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><label className="lbl">Start Date</label><input className="inp" type="date" onChange={e => { startVal.current = e.target.value; setPreviewStart(e.target.value); setCreateErr(""); }} /></div>
                  <div><label className="lbl">End Date</label><input className="inp" type="date" onChange={e => { endVal.current = e.target.value; setPreviewEnd(e.target.value); setCreateErr(""); }} /></div>
                </div>
                <VestingPreview amount={previewAmount} startDate={previewStart} endDate={previewEnd} />
                {createErr && <FieldError msg={createErr} />}
                {!authenticated && <div className="banner warn">Connect wallet to create a stream</div>}
                {cTx ? <TxBanner hash={cTx} loading={cConf} explorerUrl={explorerLink("tx", cTx)} /> : (
                  <button className="btn btn-primary btn-full" onClick={handleCreateClick} disabled={!authenticated || busy}>{busy ? "Creating…" : "Create Stream"}</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div className="card">
              <div className="card-hd"><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--green-10)", border:"1px solid var(--green-20)", display:"flex", alignItems:"center", justifyContent:"center" }}>↓</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"#10b981" }}>Withdraw Vested</span></div></div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Enter your stream ID to claim vested USDC. Find IDs in the My Streams tab.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input id="w-id" className="inp" placeholder="Stream ID (e.g. 4)" type="number" min="0" value={wId} onChange={e => { wIdVal.current = e.target.value; setWId(e.target.value); setWErr(""); }} style={{ flex:1 }} />
                  <button className="btn btn-primary btn-sm" onClick={handleWithdrawClick} disabled={!authenticated || wBusy} style={{ background:"#10b981", flexShrink:0 }}>{wBusy ? "…" : "Withdraw"}</button>
                </div>
                {wErr && <FieldError msg={wErr} />}
                {wTx && <TxBanner hash={wTx} loading={wConf} explorerUrl={explorerLink("tx", wTx)} />}
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--red-10)", border:"1px solid rgba(239,68,68,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--red)" }}>Cancel Stream</span></div></div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Recipient gets vested portion. You recover unvested USDC instantly.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input id="cn-id" className="inp" placeholder="Stream ID (e.g. 4)" type="number" min="0" value={cnId} onChange={e => { cnIdVal.current = e.target.value; setCnId(e.target.value); setCnErr(""); }} style={{ flex:1 }} />
                  <button className="btn btn-danger btn-sm" onClick={handleCancelClick} disabled={!authenticated || cnBusy} style={{ flexShrink:0 }}>{cnBusy ? "…" : "Cancel"}</button>
                </div>
                {cnErr && <FieldError msg={cnErr} />}
                {cnTx && <TxBanner hash={cnTx} loading={cnConf} explorerUrl={explorerLink("tx", cnTx)} />}
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Stream mechanics</div></div>
              <div className="card-p">
                {[["Locked","USDC held in contract on creation"],["Vesting","amount × elapsed ÷ duration"],["Withdraw","Recipient claims anytime"],["Cancel","Sender recovers unvested USDC"],["Use cases","Payroll, grants, token vesting"]].map(([t,d]) => (
                  <div key={t} style={{ display:"flex", gap:12, marginBottom:8 }}><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, fontWeight:700, color:"var(--teal)", flexShrink:0, minWidth:64, marginTop:2 }}>{t}</span><span style={{ fontSize:12, color:"var(--tx2)", lineHeight:1.5, fontWeight:500 }}>{d}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow:"hidden" }}>
          <div className="card-hd">
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div className="lbl" style={{ marginBottom:0 }}>My Streams</div>
              {activeCount > 0 && <span style={{ fontSize:11, color:"var(--teal)", fontWeight:600 }}>{activeCount} active</span>}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--tx3)", fontWeight:500 }}>Live from blockchain</span>
              <button className="btn btn-ghost btn-sm" onClick={fetchStreams} disabled={loadingStreams} style={{ fontSize:11, padding:"2px 8px" }}>{loadingStreams ? "Loading…" : "↻ Refresh"}</button>
            </div>
          </div>
          {loadingStreams ? (
            <div style={{ padding:"40px 24px", textAlign:"center", color:"var(--tx3)", fontSize:14 }}>Loading streams from blockchain…</div>
          ) : loadError ? (
            <div style={{ padding:"24px" }}>
              <div className="banner err" style={{ marginBottom:12 }}>{loadError}</div>
              <button className="btn btn-ghost btn-sm" onClick={fetchStreams}>Try again</button>
            </div>
          ) : streams.length === 0 ? (
            <EmptyState icon="⚡" title="No streams yet" desc="Create your first stream and it will appear here. Data loads live from the blockchain." action={<button className="btn btn-primary btn-sm" onClick={() => setTab("create")}>Create a stream</button>} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>ID</th><th>Status</th><th>Recipient</th><th>Amount</th><th>Start</th><th>End</th><th>Tx</th><th>Actions</th></tr></thead>
                <tbody>
                  {streams.map((h, i) => {
                    const ds = getDisplayStatus(h);
                    return (
                      <tr key={i}>
                        <td><span className="chip chip-teal">#{h.id.toString()}</span></td>
                        <td><StatusBadge status={ds} /></td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}><a href={explorerLink("address", h.recipient)} target="_blank" rel="noopener noreferrer" style={{ color:"var(--teal)" }}>{h.recipient.slice(0,8)}…{h.recipient.slice(-6)}</a></td>
                        <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"var(--teal)" }}>${formatUSDC(h.amount)}</td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.startTime)*1000).toLocaleDateString()}</td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.endTime)*1000).toLocaleDateString()}</td>
                        <td>{h.txHash && <a href={explorerLink("tx", h.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.txHash.slice(0,8)}… ↗</a>}</td>
                        <td>
                          <div style={{ display:"flex", gap:6 }}>
                            {(ds==="active"||ds==="finished") && <button className="btn btn-ghost btn-sm" onClick={() => fillWithdraw(h.id.toString())}>Withdraw</button>}
                            {ds==="active" && <button className="btn btn-danger btn-sm" onClick={() => fillCancel(h.id.toString())}>Cancel</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
