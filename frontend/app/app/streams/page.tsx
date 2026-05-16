"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { FLUX_ABI, FLUX_ADDRESS, USDC_ABI, USDC_ADDRESS, parseUSDC, formatUSDC, explorerLink } from "../../../lib/arc";
import { Tooltip, ConfirmModal, EmptyState, TxBanner } from "../../../components/UI";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

function FieldError({ msg }: { msg: string }) {
  return (
    <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600, fontFamily: "'Manrope',sans-serif", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
      <span>⚠</span> {msg}
    </div>
  );
}

interface StreamEvent {
  id: bigint; recipient: string; amount: bigint;
  startTime: bigint; endTime: bigint; txHash?: string;
}

function lsKey(addr: string) { return `flux_streams_${addr.toLowerCase()}`; }
function saveStreams(addr: string, list: StreamEvent[]) {
  try {
    localStorage.setItem(lsKey(addr), JSON.stringify(list.map(s => ({
      ...s, id: s.id.toString(), amount: s.amount.toString(),
      startTime: s.startTime.toString(), endTime: s.endTime.toString(),
    }))));
  } catch {}
}
function loadStreams(addr: string): StreamEvent[] {
  try {
    const raw = localStorage.getItem(lsKey(addr));
    if (!raw) return [];
    return JSON.parse(raw).map((s: any) => ({
      ...s, id: BigInt(s.id), amount: BigInt(s.amount),
      startTime: BigInt(s.startTime), endTime: BigInt(s.endTime),
    }));
  } catch { return []; }
}

function VestingPreview({ amount, startDate, endDate }: { amount: string; startDate: string; endDate: string }) {
  if (!amount || !startDate || !endDate) return null;
  const dur = Math.max(0, (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
  if (dur <= 0) return null;
  const perDay = parseFloat(amount) / dur;
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 9, padding: "14px 16px" }}>
      <div className="lbl" style={{ marginBottom: 10 }}>Preview</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Duration</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--tx2)" }}>{dur.toFixed(0)} days</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 500 }}>Daily rate</span>
        <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 800, color: "var(--teal)" }}>${perDay.toFixed(4)} / day</span>
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
  const [tab, setTab] = useState<"create"|"history">("create");

  const recipVal = useRef(""); const amountVal = useRef(""); const startVal = useRef(""); const endVal = useRef("");
  const [previewAmount, setPreviewAmount] = useState(""); const [previewStart, setPreviewStart] = useState(""); const [previewEnd, setPreviewEnd] = useState("");
  const [createErr, setCreateErr] = useState(""); const [busy, setBusy] = useState(false);
  const [cTx, setCTx] = useState<`0x${string}`|undefined>(); const [confirm, setConfirm] = useState(false);
  const [snap, setSnap] = useState({ recip:"", amount:"", start:"", end:"" });

  const wIdVal = useRef(""); const [wId, setWId] = useState("");
  const [wErr, setWErr] = useState(""); const [wBusy, setWBusy] = useState(false);
  const [wTx, setWTx] = useState<`0x${string}`|undefined>(); const [wConfirm, setWConfirm] = useState(false); const [wSnap, setWSnap] = useState("");

  const cnIdVal = useRef(""); const [cnId, setCnId] = useState("");
  const [cnErr, setCnErr] = useState(""); const [cnBusy, setCnBusy] = useState(false);
  const [cnTx, setCnTx] = useState<`0x${string}`|undefined>(); const [cnConfirm, setCnConfirm] = useState(false); const [cnSnap, setCnSnap] = useState("");

  const [history, setHistory] = useState<StreamEvent[]>([]);
  const { isLoading: cConf } = useWaitForTransactionReceipt({ hash: cTx });
  const { isLoading: wConf } = useWaitForTransactionReceipt({ hash: wTx });
  const { isLoading: cnConf } = useWaitForTransactionReceipt({ hash: cnTx });

  // Load from localStorage when wallet connects
  useEffect(() => {
    if (!address) return;
    setHistory(loadStreams(address));
  }, [address]);

  const pushStreams = useCallback((items: StreamEvent[]) => {
    setHistory(prev => {
      const ids = new Set(prev.map(s => s.id.toString()));
      const fresh = items.filter(s => !ids.has(s.id.toString()));
      const next = [...fresh, ...prev].slice(0, 100);
      if (address) saveStreams(address, next);
      return next;
    });
  }, [address]);

  useWatchContractEvent({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, eventName: "StreamCreated", enabled: !!FLUX_ADDRESS,
    onLogs: (logs) => {
      const items = logs.map(l => ({
        id: (l as any).args.id, recipient: (l as any).args.recipient,
        amount: (l as any).args.amount, startTime: (l as any).args.startTime,
        endTime: (l as any).args.endTime, txHash: l.transactionHash,
      }));
      pushStreams(items);
      setTab("history");
    },
  });

  const handleCreateClick = () => {
    setCreateErr("");
    const recip = recipVal.current.trim(); const amount = amountVal.current.trim();
    const start = startVal.current.trim(); const end = endVal.current.trim();
    if (!recip) { setCreateErr("Recipient address is required"); return; }
    if (!ADDR.test(recip)) { setCreateErr("Invalid address — must be 0x followed by 40 hex characters"); return; }
    if (!amount || parseFloat(amount) <= 0) { setCreateErr("Enter a valid USDC amount greater than 0"); return; }
    if (!start) { setCreateErr("Start date is required"); return; }
    if (!end) { setCreateErr("End date is required"); return; }
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
    } catch (e: unknown) { setCreateErr((e as { shortMessage?: string }).shortMessage?.slice(0, 140) || "Transaction failed"); }
    finally { setBusy(false); }
  };

  const handleWithdrawClick = () => {
    setWErr(""); const id = wIdVal.current.trim();
    if (!id || isNaN(Number(id)) || Number(id) < 0) { setWErr("Enter a valid stream ID (number ≥ 0)"); return; }
    setWSnap(id); setWConfirm(true);
  };
  const doWithdraw = async () => {
    setWConfirm(false); setWBusy(true);
    try {
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "withdrawFromStream", args: [BigInt(wSnap)], gas: 300_000n });
      setWTx(tx);
    } catch (e: unknown) { setWErr((e as { shortMessage?: string }).shortMessage?.slice(0, 140) || "Failed"); }
    finally { setWBusy(false); }
  };

  const handleCancelClick = () => {
    setCnErr(""); const id = cnIdVal.current.trim();
    if (!id || isNaN(Number(id)) || Number(id) < 0) { setCnErr("Enter a valid stream ID (number ≥ 0)"); return; }
    setCnSnap(id); setCnConfirm(true);
  };
  const doCancel = async () => {
    setCnConfirm(false); setCnBusy(true);
    try {
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "cancelStream", args: [BigInt(cnSnap)], gas: 300_000n });
      setCnTx(tx);
      // Remove cancelled stream from local list
      if (address) {
        const updated = history.filter(s => s.id.toString() !== cnSnap);
        setHistory(updated); saveStreams(address, updated);
      }
    } catch (e: unknown) { setCnErr((e as { shortMessage?: string }).shortMessage?.slice(0, 140) || "Failed"); }
    finally { setCnBusy(false); }
  };

  // Clicking Withdraw/Cancel in table fills the input and focuses it
  const fillWithdraw = (id: string) => { wIdVal.current = id; setWId(id); setTab("create"); setTimeout(() => document.getElementById("w-id")?.focus(), 100); };
  const fillCancel   = (id: string) => { cnIdVal.current = id; setCnId(id); setTab("create"); setTimeout(() => document.getElementById("cn-id")?.focus(), 100); };

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px" }}>
      {confirm && <ConfirmModal title="Create Payment Stream" message={<div><p style={{ marginBottom: 12 }}>Confirm stream:</p><div style={{ background:"var(--bg3)", borderRadius:9, padding:"14px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}><div style={{ marginBottom:5, wordBreak:"break-all" }}><span style={{ color:"var(--tx3)" }}>To: </span><span style={{ color:"var(--tx)" }}>{snap.recip}</span></div><div style={{ marginBottom:5 }}><span style={{ color:"var(--tx3)" }}>Amount: </span><span style={{ color:"var(--teal)", fontWeight:700 }}>${parseFloat(snap.amount).toFixed(2)} USDC</span></div><div style={{ marginBottom:5 }}><span style={{ color:"var(--tx3)" }}>Start: </span><span>{snap.start}</span></div><div><span style={{ color:"var(--tx3)" }}>End: </span><span>{snap.end}</span></div></div><p style={{ marginTop:10, fontSize:12, color:"var(--tx3)" }}>USDC locked and released linearly over the stream duration.</p></div>} confirmLabel="Create Stream" onConfirm={doCreate} onCancel={() => setConfirm(false)} />}
      {wConfirm && <ConfirmModal title="Withdraw Vested USDC" message={<p>Claim all vested USDC from stream <strong>#{wSnap}</strong> to your wallet.</p>} confirmLabel="Withdraw" onConfirm={doWithdraw} onCancel={() => setWConfirm(false)} />}
      {cnConfirm && <ConfirmModal title="Cancel Stream" danger message={<p>Cancel stream <strong>#{cnSnap}</strong>. Vested USDC → recipient. Unvested USDC → you. Cannot be undone.</p>} confirmLabel="Cancel Stream" onConfirm={doCancel} onCancel={() => setCnConfirm(false)} />}

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>Payment Streams</h1>
        <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>Linear USDC vesting for payroll, grants, and contractor agreements.{" "}<Tooltip text="Locks USDC in contract, released linearly. Recipient withdraws anytime. Sender can cancel and recover unvested."><span style={{ color:"var(--teal)", cursor:"help", fontWeight:700 }}>How it works (?)</span></Tooltip></p>
      </div>

      <div className="tabs" style={{ maxWidth:260, marginBottom:22 }}>
        <button className={`tab ${tab==="create"?"active":""}`} onClick={() => setTab("create")}>Create</button>
        <button className={`tab ${tab==="history"?"active":""}`} onClick={() => setTab("history")}>
          My Streams {history.length > 0 && <span className="chip chip-teal" style={{ fontSize:9, padding:"1px 6px", marginLeft:4 }}>{history.length}</span>}
        </button>
      </div>

      {tab === "create" ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div className="card">
            <div className="card-hd">
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:24, height:24, borderRadius:6, background:"var(--teal-10)", border:"1px solid var(--teal-20)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>⚡</div>
                <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--tx)" }}>Create Stream</span>
              </div>
            </div>
            <div className="card-p">
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}><label className="lbl" style={{ marginBottom:0 }}>Recipient Address</label><Tooltip text="The wallet address that will receive the streamed USDC." /></div>
                  <input className="inp" placeholder="0x..." onChange={e => { recipVal.current = e.target.value; setCreateErr(""); }} />
                </div>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}><label className="lbl" style={{ marginBottom:0 }}>Total USDC Amount</label><Tooltip text="Total USDC to stream. Locked in contract and released linearly." /></div>
                  <input className="inp" placeholder="1000.00" type="number" min="0" step="0.01" onChange={e => { amountVal.current = e.target.value; setPreviewAmount(e.target.value); setCreateErr(""); }} />
                </div>
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
              <div className="card-hd">
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--green-10)", border:"1px solid var(--green-20)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>↓</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"#10b981" }}>Withdraw Vested</span></div>
                <Tooltip text="Claim your vested USDC. You must be the stream recipient." />
              </div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Enter your stream ID to claim vested USDC. Find IDs in the My Streams tab.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input id="w-id" className="inp" placeholder="Stream ID (e.g. 0)" type="number" min="0" value={wId} onChange={e => { wIdVal.current = e.target.value; setWId(e.target.value); setWErr(""); }} style={{ flex:1 }} />
                  <button className="btn btn-primary btn-sm" onClick={handleWithdrawClick} disabled={!authenticated || wBusy} style={{ background:"#10b981", flexShrink:0 }}>{wBusy ? "…" : "Withdraw"}</button>
                </div>
                {wErr && <FieldError msg={wErr} />}
                {wTx && <TxBanner hash={wTx} loading={wConf} explorerUrl={explorerLink("tx", wTx)} />}
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--red-10)", border:"1px solid rgba(239,68,68,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>✕</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--red)" }}>Cancel Stream</span></div>
                <Tooltip text="Only the stream sender can cancel. Vested USDC → recipient. Unvested → sender." />
              </div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Recipient gets vested portion. You recover unvested USDC instantly.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input id="cn-id" className="inp" placeholder="Stream ID (e.g. 0)" type="number" min="0" value={cnId} onChange={e => { cnIdVal.current = e.target.value; setCnId(e.target.value); setCnErr(""); }} style={{ flex:1 }} />
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
            <div className="lbl" style={{ marginBottom:0 }}>My Streams</div>
            <span style={{ fontSize:12, color:"var(--tx3)", fontWeight:500 }}>Saved locally · {history.length} stream{history.length !== 1 ? "s" : ""}</span>
          </div>
          {history.length === 0 ? (
            <EmptyState icon="⚡" title="No streams yet" desc="Create your first stream and it will appear here." action={<button className="btn btn-primary btn-sm" onClick={() => setTab("create")}>Create a stream</button>} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>ID</th><th>Recipient</th><th>Amount</th><th>Start</th><th>End</th><th>Tx</th><th>Actions</th></tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td><span className="chip chip-teal">#{h.id.toString()}</span></td>
                      <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}><a href={explorerLink("address", h.recipient)} target="_blank" rel="noopener noreferrer" style={{ color:"var(--teal)" }}>{h.recipient.slice(0,8)}…{h.recipient.slice(-6)}</a></td>
                      <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"var(--teal)" }}>${formatUSDC(h.amount)}</td>
                      <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.startTime)*1000).toLocaleDateString()}</td>
                      <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.endTime)*1000).toLocaleDateString()}</td>
                      <td>{h.txHash && <a href={explorerLink("tx", h.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.txHash.slice(0,8)}… ↗</a>}</td>
                      <td><div style={{ display:"flex", gap:6 }}><button className="btn btn-ghost btn-sm" onClick={() => fillWithdraw(h.id.toString())}>Withdraw</button><button className="btn btn-danger btn-sm" onClick={() => fillCancel(h.id.toString())}>Cancel</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}