"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from "wagmi";
import { readContract } from "wagmi/actions";
import { usePrivy } from "@privy-io/react-auth";
import Papa from "papaparse";
import { useWallet } from "../../../lib/wallet/WalletContext";
import { FLUX_ABI, FLUX_ADDRESS, USDC_ABI, USDC_ADDRESS, parseUSDC, formatUSDC, explorerLink } from "../../../lib/arc";
import { fetchBatchHistory, type BatchRecord } from "../../../lib/blockchain";
import { wagmiConfig } from "../../providers";
import { Tooltip, ConfirmModal, EmptyState, TxBanner } from "../../../components/UI";
import { IconDocument, IconEmptyList } from "../../../components/icons";

interface Row { address: string; amount: string; valid: boolean; error?: string; }
const ADDR = /^0x[0-9a-fA-F]{40}$/;

function validateRow(raw: Record<string, string>): Row {
  const address = (raw.address || raw.Address || "").trim();
  const amount  = (raw.amount  || raw.Amount  || "").trim();
  if (!ADDR.test(address)) return { address, amount, valid: false, error: "Invalid address" };
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return { address, amount, valid: false, error: "Bad amount" };
  return { address, amount, valid: true };
}

function FieldError({ msg }: { msg: string }) {
  return <div style={{ fontSize:12, color:"#fca5a5", fontWeight:600, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>⚠ {msg}</div>;
}

export default function BatchPage() {
  const { address }  = useAccount();
  const { authenticated } = usePrivy();
  // Batch settlement's execution still goes through wagmi directly
  // (useWriteContract below) — a pre-existing, tested financial flow this
  // close-out pass deliberately did NOT rewrite (see
  // lib/wallet/WalletContext.tsx's top-of-file note). `authenticated`
  // above is the correct, accurate gate for "can this button actually
  // execute" — it is Privy's own state, and Privy IS the wagmi connector
  // this page signs through. `source` is read separately, only to tell a
  // Circle-connected user the truth (this feature doesn't support their
  // wallet type yet) instead of either silently mis-enabling the button or
  // showing the generic "connect wallet" message they'd correctly read as
  // wrong, since they ARE connected.
  const { source: walletSource } = useWallet();
  const addrVal = useRef(""); const amtVal = useRef("");
  const addrDom = useRef<HTMLInputElement>(null); const amtDom = useRef<HTMLInputElement>(null);

  const [rows,    setRows]    = useState<Row[]>([]);
  const [formErr, setFormErr] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [txHash,  setTxHash]  = useState<`0x${string}`|undefined>();
  const [drag,    setDrag]    = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab,     setTab]     = useState<"settle"|"history">("settle");
  const [history,        setHistory]       = useState<BatchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError,   setHistoryError]   = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const { writeContractAsync } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const valid = rows.filter(r => r.valid);
  const total = valid.reduce((s, r) => s + parseFloat(r.amount), 0);
  const fee   = total * 0.001;

  // ── Fetch via ArcScan API (instant, pre-indexed) ──────────
  // `silent` drives the stale-while-revalidate behaviour the background poll
  // below needs: the FIRST load (nothing on screen yet) shows the loading
  // state and surfaces errors normally, but every polled refresh after that
  // updates history/historyError only on success and never touches
  // loadingHistory — so the table already on screen never gets replaced by
  // a "Loading…" flash or an error banner over a transient blip. A poll
  // that fails just leaves the last good data up and quietly retries next
  // tick, same as ArcScan/Relay never blank their list between polls.
  const loadHistory = useCallback(async (silent = false) => {
    if (!address || !FLUX_ADDRESS) return;
    if (!silent) { setLoadingHistory(true); setHistoryError(""); }
    try {
      const items = await fetchBatchHistory(address);
      setHistory(items);
      if (!silent) setHistoryError("");
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err);
        setHistoryError(`Could not load history: ${msg.slice(0, 100)}`);
      }
    } finally { if (!silent) setLoadingHistory(false); }
  }, [address]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Live, like ArcScan — the history tab keeps itself current in the
  // background, no manual refresh and no visible loading flicker every
  // second. Only runs while the tab is actually open.
  useEffect(() => {
    if (tab !== "history") return;
    const id = setInterval(() => loadHistory(true), 1000);
    return () => clearInterval(id);
  }, [tab, loadHistory]);

  useWatchContractEvent({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, eventName: "BatchSettled",
    enabled: !!FLUX_ADDRESS,
    onLogs: (logs) => {
      const mine = logs.filter(l => (l as any).args?.sender?.toLowerCase() === address?.toLowerCase());
      if (mine.length > 0) setTimeout(() => loadHistory(), 2000);
    },
  });

  const parseCSV = useCallback((f: File) => {
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => setRows((res.data as Record<string, string>[]).map(validateRow)),
    });
  }, []);

  const addRow = () => {
    setFormErr("");
    const a = addrVal.current.trim(), v = amtVal.current.trim();
    if (!a) { setFormErr("Wallet address is required"); addrDom.current?.focus(); return; }
    if (!ADDR.test(a)) { setFormErr("Invalid address — 0x + 40 hex characters"); addrDom.current?.focus(); return; }
    if (!v || parseFloat(v) <= 0) { setFormErr("Enter a valid USDC amount > 0"); amtDom.current?.focus(); return; }
    setRows(p => [...p, validateRow({ address: a, amount: v })]);
    addrVal.current = ""; amtVal.current = "";
    if (addrDom.current) addrDom.current.value = "";
    if (amtDom.current)  amtDom.current.value  = "";
    addrDom.current?.focus();
  };

  const doSettle = async () => {
    setConfirm(false); setBusy(true); setFormErr("");
    if (!FLUX_ADDRESS || !USDC_ADDRESS) { setFormErr("Contracts not deployed"); setBusy(false); return; }
    try {
      const recipients  = valid.map(r => r.address as `0x${string}`);
      const amounts     = valid.map(r => parseUSDC(r.amount));
      const sum         = amounts.reduce((a, b) => a + b, 0n);
      const feeAmt      = (sum * 10n) / 10000n;
      const totalNeeded = sum + feeAmt;

      const usdcBalance = await readContract(wagmiConfig, {
        address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI,
        functionName: "balanceOf", args: [address as `0x${string}`],
      }) as bigint;

      if (usdcBalance < totalNeeded) {
        setFormErr(`Insufficient USDC. Have ${formatUSDC(usdcBalance)}, need ${formatUSDC(totalNeeded)}.`);
        setBusy(false); return;
      }

      const gasLimit = BigInt(80_000 + recipients.length * 65_000);
      await writeContractAsync({ address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName:"approve", args:[FLUX_ADDRESS as `0x${string}`, totalNeeded] });
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName:"batchSettle", args:[recipients, amounts], gas: gasLimit });
      setTxHash(tx);
    } catch (e: unknown) {
      setFormErr(((e as {shortMessage?:string}).shortMessage || "Transaction failed").slice(0, 200));
    } finally { setBusy(false); }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(history.map(h => ({
      recipients: h.count.toString(),
      totalUSDC:  `$${(Number(h.totalUSDC)/1e6).toFixed(4)}`,
      fee:        `$${(Number(h.fee)/1e6).toFixed(4)}`,
      timestamp:  new Date(Number(h.timestamp)*1000).toISOString(),
      txHash:     h.txHash || "",
    })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = "flux-batch-history.csv"; a.click();
  };

  return (
    <div className="page-pad">
      {confirm && (
        <ConfirmModal title="Confirm Batch Settlement"
          message={<div><p style={{ marginBottom:12 }}>You are about to settle:</p><div style={{ background:"var(--bg3)", borderRadius:9, padding:"14px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ color:"var(--tx3)" }}>Recipients</span><span style={{ fontWeight:700 }}>{valid.length}</span></div><div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ color:"var(--tx3)" }}>Total USDC</span><span style={{ color:"#10b981", fontWeight:700 }}>${total.toFixed(2)}</span></div><div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"var(--tx3)" }}>Fee (0.1%)</span><span style={{ color:"var(--amber)" }}>${fee.toFixed(4)}</span></div></div><p style={{ marginTop:10, fontSize:12, color:"var(--tx3)" }}>Two signatures: approve USDC, then execute batch.</p></div>}
          confirmLabel={`Settle $${(total+fee).toFixed(4)}`} onConfirm={doSettle} onCancel={()=>setConfirm(false)} />
      )}

      <div style={{ marginBottom:22, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>Batch Settlement</h1>
          <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>
            Send USDC to up to 500 recipients in one transaction.{" "}
            <Tooltip text="Flux charges 0.1% of the total USDC settled as a platform fee.">0.1% fee</Tooltip>
          </p>
        </div>
        {rows.length > 0 && <button className="btn btn-ghost btn-sm" onClick={()=>{setRows([]);setFormErr("");}}>Clear all</button>}
      </div>

      <div className="tabs" style={{ maxWidth:260, marginBottom:22 }}>
        <button className={`tab ${tab==="settle"?"active":""}`} onClick={()=>setTab("settle")}>Settle</button>
        <button className={`tab ${tab==="history"?"active":""}`} onClick={()=>setTab("history")} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <span>History</span>
          {history.length>0 && <span style={{ background:"var(--teal)", color:"var(--bg)", fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0, lineHeight:"18px" }}>{history.length}</span>}
        </button>
      </div>

      {tab==="settle" ? (
        <div className="batch-grid">
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div className="card" style={{ borderStyle:"dashed", cursor:"pointer", borderColor:drag?"var(--teal)":"var(--bdr2)", background:drag?"var(--teal-10)":"var(--bg2)", transition:"all 0.2s" }}
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDrag(true);}}
              onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseCSV(f);}}>
              <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e=>e.target.files?.[0]&&parseCSV(e.target.files[0])} />
              <div style={{ padding:"24px", textAlign:"center" }}>
                <div style={{ marginBottom:8, display:"flex", justifyContent:"center", color:"var(--tx3)" }}><IconDocument size={28} /></div>
                <div style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:14, color:"var(--tx)", marginBottom:4 }}>Drop a CSV or click to upload</div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx3)" }}>Required columns: <span style={{ color:"var(--amber)" }}>address</span>, <span style={{ color:"var(--amber)" }}>amount</span></div>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Add manually</div></div>
              <div className="card-p">
                <div className="batch-add-row">
                  <div><label className="lbl">Wallet address</label><input ref={addrDom} className="inp" placeholder="0x..." onChange={e=>{addrVal.current=e.target.value;setFormErr("");}} onKeyDown={e=>e.key==="Enter"&&addRow()} /></div>
                  <div><label className="lbl">USDC amount</label><input ref={amtDom} className="inp" placeholder="100.00" type="number" min="0" step="0.01" onChange={e=>{amtVal.current=e.target.value;setFormErr("");}} onKeyDown={e=>e.key==="Enter"&&addRow()} /></div>
                  <button className="btn btn-secondary" onClick={addRow} style={{ height:40 }}>+ Add</button>
                </div>
                {formErr && <FieldError msg={formErr} />}
              </div>
            </div>

            {rows.length>0 && (
              <div className="card" style={{ overflow:"hidden" }}>
                <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}><span style={{ color:"#10b981" }}>{valid.length} valid</span>{rows.length-valid.length>0&&<span style={{ color:"var(--red)", marginLeft:8 }}>{rows.length-valid.length} invalid</span>}</div></div>
                <div style={{ maxHeight:260, overflowY:"auto" }}>
                  <table className="tbl">
                    <thead><tr><th>#</th><th>Address</th><th>USDC</th><th>Status</th></tr></thead>
                    <tbody>
                      {rows.map((r,i)=>(
                        <tr key={i}>
                          <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx3)", width:32 }}>{i+1}</td>
                          <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{r.address?`${r.address.slice(0,8)}…${r.address.slice(-6)}`:<span style={{ color:"var(--red)" }}>empty</span>}</td>
                          <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:13, color:r.valid?"#10b981":"var(--tx3)" }}>{r.valid?`$${parseFloat(r.amount).toFixed(2)}`:"—"}</td>
                          <td>{r.valid?<span className="chip chip-up">✓ valid</span>:<span className="chip chip-down">{r.error}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{ position:"sticky", top:72 }}>
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Summary</div></div>
              <div className="card-p">
                {[{l:"Recipients",v:valid.length.toString(),c:"var(--tx)"},{l:"Total USDC",v:`$${total.toFixed(2)}`,c:"#10b981"},{l:"Fee (0.1%)",v:`$${fee.toFixed(4)}`,c:"var(--amber)"}].map(r=>(
                  <div key={r.l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid var(--bdr)" }}>
                    <span style={{ fontSize:13, color:"var(--tx2)", fontWeight:500 }}>{r.l}</span>
                    <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:r.c }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 0" }}>
                  <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:700, color:"var(--tx)" }}>Total needed</span>
                  <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:17, fontWeight:800, color:"var(--teal)" }}>${(total+fee).toFixed(4)}</span>
                </div>
                {txHash ? (
                  <TxBanner hash={txHash} loading={confirming} explorerUrl={explorerLink("tx",txHash)} />
                ) : (
                  <>
                    {!authenticated && walletSource === "circle" && (
                      <div className="banner warn" style={{ marginBottom:10 }}>
                        Batch settlement needs a Privy-connected wallet for now — your Circle (email) wallet isn&apos;t supported here yet.
                      </div>
                    )}
                    {!authenticated && walletSource !== "circle" && <div className="banner warn" style={{ marginBottom:10 }}>Connect wallet to settle</div>}
                    {formErr && <div className="banner err" style={{ marginBottom:10 }}>{formErr}</div>}
                    <button className="btn btn-primary btn-full" style={{ padding:"12px", fontSize:14 }} onClick={()=>setConfirm(true)} disabled={!authenticated||busy||valid.length===0}>
                      {busy?"Processing…":valid.length>0?`Settle ${valid.length} payment${valid.length!==1?"s":""}`:"Add recipients to continue"}
                    </button>
                  </>
                )}
                <hr className="divider" />
                <div className="lbl" style={{ marginBottom:7 }}>CSV format</div>
                <pre style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx2)", lineHeight:1.65, background:"var(--bg3)", padding:"10px 12px", borderRadius:7, overflow:"auto", border:"1px solid var(--bdr)" }}>{`address,amount\n0x1a2b…,100.00\n0x9e8f…,250.50`}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow:"hidden" }}>
          <div className="card-hd">
            <div className="lbl" style={{ marginBottom:0 }}>My Batch History</div>
            {history.length>0 && (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{ fontSize:11, padding:"2px 8px" }}>↓ Export CSV</button>
              </div>
            )}
          </div>
          {loadingHistory ? (
            <div style={{ padding:"40px 24px", textAlign:"center", color:"var(--tx3)", fontSize:14 }}>Loading history…</div>
          ) : historyError ? (
            <div style={{ padding:"24px" }}><div className="banner err" style={{ marginBottom:12 }}>{historyError}</div><button className="btn btn-ghost btn-sm" onClick={() => loadHistory()}>Try again</button></div>
          ) : history.length===0 ? (
            <EmptyState icon={<IconEmptyList size={28} />} title="No batch history yet" desc="Your settled batches appear here instantly from the blockchain." />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>Time</th><th>Recipients</th><th>Total USDC</th><th>Fee</th><th>Tx</th></tr></thead>
                <tbody>
                  {history.map((h,i)=>(
                    <tr key={i}>
                      <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.timestamp)*1000).toLocaleString()}</td>
                      <td><span className="chip chip-teal">{h.count.toString()}</span></td>
                      <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"#10b981" }}>${(Number(h.totalUSDC)/1e6).toFixed(2)}</td>
                      <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:600, color:"var(--amber)" }}>${(Number(h.fee)/1e6).toFixed(4)}</td>
                      <td>{h.txHash&&<a href={explorerLink("tx",h.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.txHash.slice(0,8)}… ↗</a>}</td>
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