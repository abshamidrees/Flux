"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "../../../lib/wallet/WalletContext";
import { FLUX_ABI, FLUX_ADDRESS, USDC_ABI, USDC_ADDRESS, parseUSDC, formatUSDC, explorerLink } from "../../../lib/arc";
import { fetchStreams, fetchReceivedStreams, type StreamRecord } from "../../../lib/blockchain";
import { Tooltip, ConfirmModal, EmptyState, TxBanner } from "../../../components/UI";
import { IconStream, IconWithdraw, IconCancel, IconEmptyStream } from "../../../components/icons";

const ADDR = /^0x[0-9a-fA-F]{40}$/;
type StreamStatus = "active" | "finished" | "cancelled" | "withdrawn";

function getDisplayStatus(s: StreamRecord): StreamStatus {
  if (s.status === "cancelled" || s.status === "withdrawn") return s.status;
  if (Number(s.endTime) * 1000 < Date.now()) return "finished";
  return "active";
}

function StatusBadge({ status }: { status: StreamStatus }) {
  const cfg = {
    active:    { label: "● Active",    bg: "var(--teal-10)",         color: "var(--teal)",  border: "var(--teal-20)" },
    finished:  { label: "✓ Finished",  bg: "rgba(100,116,139,0.12)", color: "#94a3b8",      border: "rgba(100,116,139,0.25)" },
    cancelled: { label: "✕ Cancelled", bg: "rgba(239,68,68,0.08)",   color: "#f87171",      border: "rgba(239,68,68,0.2)" },
    withdrawn: { label: "↓ Withdrawn", bg: "rgba(139,92,246,0.1)",   color: "#a78bfa",      border: "rgba(139,92,246,0.2)" },
  } as const;
  const c = cfg[status];
  return <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, borderRadius:999, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{c.label}</span>;
}

function FieldError({ msg }: { msg: string }) {
  return <div style={{ fontSize:12, color:"#fca5a5", fontWeight:600, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>⚠ {msg}</div>;
}

function VestingPreview({ amount, startDate, endDate }: { amount:string; startDate:string; endDate:string }) {
  if (!amount || !startDate || !endDate) return null;
  const dur = Math.max(0, (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
  if (dur <= 0) return null;
  return (
    <div style={{ background:"var(--bg3)", border:"1px solid var(--bdr)", borderRadius:9, padding:"14px 16px" }}>
      <div className="lbl" style={{ marginBottom:10 }}>Preview</div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:13, color:"var(--tx2)", fontWeight:500 }}>Duration</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}>{dur.toFixed(0)} days</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:13, color:"var(--tx2)", fontWeight:500 }}>Daily rate</span>
        <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:13, fontWeight:800, color:"var(--teal)" }}>${(parseFloat(amount)/dur).toFixed(4)} / day</span>
      </div>
      <div className="prog-track"><div className="prog-fill" style={{ width:"0%", background:"var(--teal)" }} /></div>
      <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--tx3)", marginTop:5 }}>0% released — not started yet</div>
    </div>
  );
}

export default function StreamsPage() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  // Same rationale as app/app/batch/page.tsx: execution here stays on
  // wagmi directly (pre-existing, tested flow, deliberately not rewired in
  // this close-out pass — see lib/wallet/WalletContext.tsx). `source` is
  // only read to tell a Circle-connected user the truth instead of a
  // misleading "connect wallet" prompt.
  const { source: walletSource } = useWallet();

  const [tab, setTab]               = useState<"create"|"history"|"received">("create");
  const [streams, setStreams]        = useState<StreamRecord[]>([]);
  const [loading, setLoading]        = useState(false);
  const [loadError, setLoadError]    = useState("");

  const [received, setReceived]             = useState<StreamRecord[]>([]);
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedError, setReceivedError]     = useState("");

  // Create form
  const recipVal = useRef(""); const amountVal = useRef("");
  const startVal = useRef(""); const endVal   = useRef("");
  const [previewAmount, setPreviewAmount] = useState("");
  const [previewStart,  setPreviewStart]  = useState("");
  const [previewEnd,    setPreviewEnd]    = useState("");
  const [createErr, setCreateErr] = useState("");
  const [busy,      setBusy]      = useState(false);
  const [cTx,  setCTx]  = useState<`0x${string}`|undefined>();
  const [confirm, setConfirm] = useState(false);
  const [snap, setSnap] = useState({ recip:"", amount:"", start:"", end:"" });

  // Withdraw
  const wIdVal = useRef(""); const [wId, setWId] = useState("");
  const [wErr, setWErr] = useState(""); const [wBusy, setWBusy] = useState(false);
  const [wTx, setWTx] = useState<`0x${string}`|undefined>();
  const [wConfirm, setWConfirm] = useState(false); const [wSnap, setWSnap] = useState("");

  // Cancel
  const cnIdVal = useRef(""); const [cnId, setCnId] = useState("");
  const [cnErr, setCnErr] = useState(""); const [cnBusy, setCnBusy] = useState(false);
  const [cnTx, setCnTx] = useState<`0x${string}`|undefined>();
  const [cnConfirm, setCnConfirm] = useState(false); const [cnSnap, setCnSnap] = useState("");

  const { isLoading: cConf }  = useWaitForTransactionReceipt({ hash: cTx });
  const { isLoading: wConf }  = useWaitForTransactionReceipt({ hash: wTx });
  const { isLoading: cnConf } = useWaitForTransactionReceipt({ hash: cnTx });

  // ── Fetch via ArcScan API (instant) ──────────────────────
  const loadStreams = useCallback(async () => {
    if (!address || !FLUX_ADDRESS) return;
    setLoading(true); setLoadError("");
    try {
      const data = await fetchStreams(address);
      setStreams(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(`Could not load streams: ${msg.slice(0, 100)}`);
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => { loadStreams(); }, [loadStreams]);

  // ── Fetch streams where I am the RECIPIENT ────────────────
  const loadReceived = useCallback(async () => {
    if (!address || !FLUX_ADDRESS) return;
    setReceivedLoading(true); setReceivedError("");
    try {
      const data = await fetchReceivedStreams(address);
      setReceived(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setReceivedError(`Could not load received streams: ${msg.slice(0, 100)}`);
    } finally { setReceivedLoading(false); }
  }, [address]);

  useEffect(() => { loadReceived(); }, [loadReceived]);

  useWatchContractEvent({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, eventName: "StreamCreated",
    enabled: !!FLUX_ADDRESS,
    onLogs: () => { setTimeout(() => loadStreams(), 2000); setTab("history"); },
  });

  // ── Create ────────────────────────────────────────────────
  const handleCreateClick = () => {
    setCreateErr("");
    const recip = recipVal.current.trim(), amount = amountVal.current.trim();
    const start = startVal.current.trim(), end = endVal.current.trim();
    if (!recip)   { setCreateErr("Recipient address is required"); return; }
    if (!ADDR.test(recip)) { setCreateErr("Invalid address — 0x + 40 hex characters"); return; }
    if (!amount || parseFloat(amount) <= 0) { setCreateErr("Enter a USDC amount greater than 0"); return; }
    if (!start)   { setCreateErr("Start date is required"); return; }
    if (!end)     { setCreateErr("End date is required"); return; }
    if (new Date(end) <= new Date(start)) { setCreateErr("End date must be after start date"); return; }
    setSnap({ recip, amount, start, end }); setConfirm(true);
  };

  const doCreate = async () => {
    setConfirm(false); setBusy(true);
    if (!FLUX_ADDRESS || !USDC_ADDRESS) { setCreateErr("Contracts not deployed"); setBusy(false); return; }
    try {
      const nowSec = Math.floor(Date.now()/1000);
      const rawS   = Math.floor(new Date(snap.start).getTime()/1000);
      const s      = rawS < nowSec+60 ? nowSec+120 : rawS;
      const e      = Math.floor(new Date(snap.end).getTime()/1000);
      const a      = parseUSDC(snap.amount);
      await writeContractAsync({ address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName:"approve", args:[FLUX_ADDRESS as `0x${string}`, a] });
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName:"createStream", args:[snap.recip as `0x${string}`, a, BigInt(s), BigInt(e)], gas:300_000n });
      setCTx(tx);
    } catch (e: unknown) { setCreateErr(((e as {shortMessage?:string}).shortMessage || "Transaction failed").slice(0,140)); }
    finally { setBusy(false); }
  };

  // ── Withdraw ──────────────────────────────────────────────
  const handleWithdrawClick = () => {
    setWErr(""); const id = wIdVal.current.trim();
    if (!id || isNaN(Number(id)) || Number(id)<0) { setWErr("Enter a valid stream ID"); return; }
    setWSnap(id); setWConfirm(true);
  };
  const doWithdraw = async () => {
    setWConfirm(false); setWBusy(true);
    try {
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName:"withdrawFromStream", args:[BigInt(wSnap)], gas:300_000n });
      setWTx(tx);
      setStreams(prev => prev.map(s => s.id.toString()===wSnap ? {...s, status:"withdrawn" as StreamStatus} : s));
      setReceived(prev => prev.map(s => s.id.toString()===wSnap ? {...s, status:"withdrawn" as StreamStatus} : s));
    } catch (e: unknown) { setWErr(((e as {shortMessage?:string}).shortMessage || "Failed").slice(0,140)); }
    finally { setWBusy(false); }
  };

  // ── Cancel ────────────────────────────────────────────────
  const handleCancelClick = () => {
    setCnErr(""); const id = cnIdVal.current.trim();
    if (!id || isNaN(Number(id)) || Number(id)<0) { setCnErr("Enter a valid stream ID"); return; }
    setCnSnap(id); setCnConfirm(true);
  };
  const doCancel = async () => {
    setCnConfirm(false); setCnBusy(true);
    try {
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName:"cancelStream", args:[BigInt(cnSnap)], gas:300_000n });
      setCnTx(tx);
      setStreams(prev => prev.map(s => s.id.toString()===cnSnap ? {...s, status:"cancelled" as StreamStatus} : s));
    } catch (e: unknown) { setCnErr(((e as {shortMessage?:string}).shortMessage || "Failed").slice(0,140)); }
    finally { setCnBusy(false); }
  };

  const fillWithdraw = (id: string) => { wIdVal.current=id; setWId(id); setTab("create"); setTimeout(()=>document.getElementById("w-id")?.focus(),100); };
  const fillCancel   = (id: string) => { cnIdVal.current=id; setCnId(id); setTab("create"); setTimeout(()=>document.getElementById("cn-id")?.focus(),100); };
  const activeCount  = streams.filter(s=>getDisplayStatus(s)==="active").length;

  return (
    <div className="page-pad">
      {confirm   && <ConfirmModal title="Create Payment Stream" message={<div><p style={{marginBottom:12}}>Confirm stream:</p><div style={{background:"var(--bg3)",borderRadius:9,padding:"14px 16px",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}><div style={{marginBottom:5,wordBreak:"break-all"}}><span style={{color:"var(--tx3)"}}>To: </span>{snap.recip}</div><div style={{marginBottom:5}}><span style={{color:"var(--tx3)"}}>Amount: </span><span style={{color:"var(--teal)",fontWeight:700}}>${parseFloat(snap.amount).toFixed(2)} USDC</span></div><div style={{marginBottom:5}}><span style={{color:"var(--tx3)"}}>Start: </span>{snap.start}</div><div><span style={{color:"var(--tx3)"}}>End: </span>{snap.end}</div></div></div>} confirmLabel="Create Stream" onConfirm={doCreate} onCancel={()=>setConfirm(false)} />}
      {wConfirm  && <ConfirmModal title="Withdraw Vested USDC" message={<p>Claim all vested USDC from stream <strong>#{wSnap}</strong>.</p>} confirmLabel="Withdraw" onConfirm={doWithdraw} onCancel={()=>setWConfirm(false)} />}
      {cnConfirm && <ConfirmModal title="Cancel Stream" danger message={<p>Cancel stream <strong>#{cnSnap}</strong>. Vested → recipient. Unvested → you.</p>} confirmLabel="Cancel Stream" onConfirm={doCancel} onCancel={()=>setCnConfirm(false)} />}

      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>Payment Streams</h1>
        <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>Linear USDC vesting for payroll, grants, and contractor agreements.</p>
      </div>

      <div className="tabs" style={{ maxWidth:420, marginBottom:22 }}>
        <button className={`tab ${tab==="create"?"active":""}`} onClick={()=>setTab("create")}>Create</button>
        <button className={`tab ${tab==="history"?"active":""}`} onClick={()=>setTab("history")} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <span>My Streams</span>
          {streams.length>0 && <span style={{ background:"var(--teal)", color:"var(--bg)", fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0, lineHeight:"18px" }}>{streams.length}</span>}
        </button>
        <button className={`tab ${tab==="received"?"active":""}`} onClick={()=>setTab("received")} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <span>Received</span>
          {received.length>0 && <span style={{ background:"var(--teal)", color:"var(--bg)", fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0, lineHeight:"18px" }}>{received.length}</span>}
        </button>
      </div>

      {tab==="create" ? (
        <div className="form-grid-2">
          <div className="card">
            <div className="card-hd"><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--teal-10)", border:"1px solid var(--teal-20)", display:"flex", alignItems:"center", justifyContent:"center" }}><IconStream size={14} /></div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--tx)" }}>Create Stream</span></div></div>
            <div className="card-p">
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div><label className="lbl">Recipient Address</label><input className="inp" placeholder="0x..." onChange={e=>{recipVal.current=e.target.value;setCreateErr("");}} /></div>
                <div><label className="lbl">Total USDC Amount</label><input className="inp" placeholder="1000.00" type="number" min="0" step="0.01" onChange={e=>{amountVal.current=e.target.value;setPreviewAmount(e.target.value);setCreateErr("");}} /></div>
                <div className="form-grid-2">
                  <div><label className="lbl">Start Date</label><input className="inp" type="date" onChange={e=>{startVal.current=e.target.value;setPreviewStart(e.target.value);setCreateErr("");}} /></div>
                  <div><label className="lbl">End Date</label><input className="inp" type="date" onChange={e=>{endVal.current=e.target.value;setPreviewEnd(e.target.value);setCreateErr("");}} /></div>
                </div>
                <VestingPreview amount={previewAmount} startDate={previewStart} endDate={previewEnd} />
                {createErr && <FieldError msg={createErr} />}
                {!authenticated && walletSource === "circle" && (
                  <div className="banner warn">Payment streams need a Privy-connected wallet for now — your Circle (email) wallet isn&apos;t supported here yet.</div>
                )}
                {!authenticated && walletSource !== "circle" && <div className="banner warn">Connect wallet to create a stream</div>}
                {cTx ? <TxBanner hash={cTx} loading={cConf} explorerUrl={explorerLink("tx",cTx)} /> : (
                  <button className="btn btn-primary btn-full" onClick={handleCreateClick} disabled={!authenticated||busy}>{busy?"Creating…":"Create Stream"}</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div className="card">
              <div className="card-hd"><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--green-10)", border:"1px solid var(--green-20)", display:"flex", alignItems:"center", justifyContent:"center" }}><IconWithdraw size={14} /></div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"#10b981" }}>Withdraw Vested</span></div></div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Enter your stream ID to claim vested USDC. Find IDs in the My Streams tab.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input id="w-id" className="inp" placeholder="Stream ID (e.g. 4)" type="number" min="0" value={wId} onChange={e=>{wIdVal.current=e.target.value;setWId(e.target.value);setWErr("");}} style={{ flex:1 }} />
                  <button className="btn btn-primary btn-sm" onClick={handleWithdrawClick} disabled={!authenticated||wBusy} style={{ background:"#10b981",flexShrink:0 }}>{wBusy?"…":"Withdraw"}</button>
                </div>
                {wErr && <FieldError msg={wErr} />}
                {wTx && <TxBanner hash={wTx} loading={wConf} explorerUrl={explorerLink("tx",wTx)} />}
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--red-10)", border:"1px solid rgba(239,68,68,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}><IconCancel size={14} /></div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--red)" }}>Cancel Stream</span></div></div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Recipient gets vested portion. You recover unvested USDC instantly.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input id="cn-id" className="inp" placeholder="Stream ID (e.g. 4)" type="number" min="0" value={cnId} onChange={e=>{cnIdVal.current=e.target.value;setCnId(e.target.value);setCnErr("");}} style={{ flex:1 }} />
                  <button className="btn btn-danger btn-sm" onClick={handleCancelClick} disabled={!authenticated||cnBusy} style={{ flexShrink:0 }}>{cnBusy?"…":"Cancel"}</button>
                </div>
                {cnErr && <FieldError msg={cnErr} />}
                {cnTx && <TxBanner hash={cnTx} loading={cnConf} explorerUrl={explorerLink("tx",cnTx)} />}
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Stream mechanics</div></div>
              <div className="card-p">
                {[["Locked","USDC held in contract on creation"],["Vesting","amount × elapsed ÷ duration"],["Withdraw","Recipient claims anytime"],["Cancel","Sender recovers unvested USDC"],["Use cases","Payroll, grants, token vesting"]].map(([t,d])=>(
                  <div key={t} style={{ display:"flex", gap:12, marginBottom:8 }}><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, fontWeight:700, color:"var(--teal)", flexShrink:0, minWidth:64, marginTop:2 }}>{t}</span><span style={{ fontSize:12, color:"var(--tx2)", lineHeight:1.5, fontWeight:500 }}>{d}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : tab==="history" ? (
        <div className="card" style={{ overflow:"hidden" }}>
          <div className="card-hd">
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div className="lbl" style={{ marginBottom:0 }}>My Streams</div>
              {activeCount>0 && <span style={{ fontSize:11, color:"var(--teal)", fontWeight:600 }}>{activeCount} active</span>}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--tx3)", fontWeight:500 }}>Live from blockchain</span>
              <button className="btn btn-ghost btn-sm" onClick={loadStreams} disabled={loading} style={{ fontSize:11, padding:"2px 8px" }}>{loading?"Loading…":"↻ Refresh"}</button>
            </div>
          </div>
          {loading ? (
            <div style={{ padding:"40px 24px", textAlign:"center", color:"var(--tx3)", fontSize:14 }}>Loading streams…</div>
          ) : loadError ? (
            <div style={{ padding:"24px" }}><div className="banner err" style={{ marginBottom:12 }}>{loadError}</div><button className="btn btn-ghost btn-sm" onClick={loadStreams}>Try again</button></div>
          ) : streams.length===0 ? (
            <EmptyState icon={<IconEmptyStream size={28} />} title="No streams yet" desc="Create your first stream. Data loads instantly from the blockchain." action={<button className="btn btn-primary btn-sm" onClick={()=>setTab("create")}>Create a stream</button>} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>ID</th><th>Status</th><th>Recipient</th><th>Amount</th><th>Start</th><th>End</th><th>Tx</th><th>Actions</th></tr></thead>
                <tbody>
                  {streams.map((h,i)=>{
                    const ds=getDisplayStatus(h);
                    return (
                      <tr key={i}>
                        <td><span className="chip chip-teal">#{h.id.toString()}</span></td>
                        <td><StatusBadge status={ds} /></td>
                        <td>
  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
    <a href={explorerLink("address",h.recipient)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.recipient.slice(0,6)}…{h.recipient.slice(-4)}</a>
    <button onClick={()=>navigator.clipboard.writeText(h.recipient)} title="Copy address" style={{ background:"none", border:"none", cursor:"pointer", color:"var(--tx3)", padding:2, display:"flex", lineHeight:1 }}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5"/></svg>
    </button>
  </div>
</td>
                        <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"var(--teal)" }}>${formatUSDC(h.amount)}</td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.startTime)*1000).toLocaleDateString()}</td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.endTime)*1000).toLocaleDateString()}</td>
                        <td>{h.txHash && <a href={explorerLink("tx",h.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.txHash.slice(0,8)}… ↗</a>}</td>
                        <td><div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          {(ds==="active"||ds==="finished") && address?.toLowerCase()===h.recipient.toLowerCase() && (() => {
                            const notStarted = Number(h.startTime)*1000 > Date.now();
                            return notStarted
                              ? <span style={{ fontSize:10, color:"var(--tx3)", fontWeight:600, fontFamily:"'IBM Plex Mono',monospace" }}>Not started</span>
                              : <button className="btn btn-ghost btn-sm" onClick={()=>fillWithdraw(h.id.toString())}>Withdraw</button>;
                          })()}
                          {ds==="active" && <button className="btn btn-danger btn-sm" onClick={()=>fillCancel(h.id.toString())}>Cancel</button>}
                          {ds!=="active" && ds!=="finished" && address?.toLowerCase()!==h.recipient.toLowerCase() && <span style={{ fontSize:11, color:"var(--tx3)" }}>—</span>}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow:"hidden" }}>
          <div className="card-hd">
            <div className="lbl" style={{ marginBottom:0 }}>Received Streams</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--tx3)", fontWeight:500 }}>Live from blockchain</span>
              <button className="btn btn-ghost btn-sm" onClick={loadReceived} disabled={receivedLoading} style={{ fontSize:11, padding:"2px 8px" }}>{receivedLoading?"Loading…":"↻ Refresh"}</button>
            </div>
          </div>
          {receivedLoading ? (
            <div style={{ padding:"40px 24px", textAlign:"center", color:"var(--tx3)", fontSize:14 }}>Loading received streams…</div>
          ) : receivedError ? (
            <div style={{ padding:"24px" }}><div className="banner err" style={{ marginBottom:12 }}>{receivedError}</div><button className="btn btn-ghost btn-sm" onClick={loadReceived}>Try again</button></div>
          ) : received.length===0 ? (
            <EmptyState icon={<IconEmptyStream size={28} />} title="No streams received" desc="Streams other people create for you appear here, with a Withdraw button as soon as they start." />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>ID</th><th>Status</th><th>From</th><th>Amount</th><th>Start</th><th>End</th><th>Tx</th><th>Actions</th></tr></thead>
                <tbody>
                  {received.map((h,i)=>{
                    const ds=getDisplayStatus(h);
                    const notStarted = Number(h.startTime)*1000 > Date.now();
                    return (
                      <tr key={i}>
                        <td><span className="chip chip-teal">#{h.id.toString()}</span></td>
                        <td><StatusBadge status={ds} /></td>
                        <td>
  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
    <a href={explorerLink("address",h.sender||"")} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{(h.sender||"").slice(0,6)}…{(h.sender||"").slice(-4)}</a>
    <button onClick={()=>navigator.clipboard.writeText(h.sender||"")} title="Copy address" style={{ background:"none", border:"none", cursor:"pointer", color:"var(--tx3)", padding:2, display:"flex", lineHeight:1 }}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5"/></svg>
    </button>
  </div>
</td>
                        <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"var(--teal)" }}>${formatUSDC(h.amount)}</td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.startTime)*1000).toLocaleDateString()}</td>
                        <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.endTime)*1000).toLocaleDateString()}</td>
                        <td>{h.txHash && <a href={explorerLink("tx",h.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.txHash.slice(0,8)}… ↗</a>}</td>
                        <td>
                          {(ds==="active"||ds==="finished") && (
                            notStarted
                              ? <span style={{ fontSize:10, color:"var(--tx3)", fontWeight:600, fontFamily:"'IBM Plex Mono',monospace" }}>Not started</span>
                              : <button className="btn btn-ghost btn-sm" onClick={()=>fillWithdraw(h.id.toString())}>Withdraw</button>
                          )}
                          {(ds==="cancelled"||ds==="withdrawn") && <span style={{ fontSize:11, color:"var(--tx3)" }}>—</span>}
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