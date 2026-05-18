"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent, usePublicClient } from "wagmi";
import { readContract } from "wagmi/actions";
import { usePrivy } from "@privy-io/react-auth";
import Papa from "papaparse";
import { FLUX_ABI, FLUX_ADDRESS, USDC_ABI, USDC_ADDRESS, parseUSDC, formatUSDC, explorerLink, FLUX_DEPLOY_BLOCK } from "../../../lib/arc";
import { wagmiConfig } from "../../providers";
import { Tooltip, ConfirmModal, EmptyState, TxBanner } from "../../../components/UI";

interface Row { address: string; amount: string; valid: boolean; error?: string; }
interface HistoryItem { count: bigint; totalUSDC: bigint; fee: bigint; timestamp: bigint; txHash?: string; }

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
  return (
    <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600, fontFamily: "'Manrope',sans-serif", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
      <span>⚠</span> {msg}
    </div>
  );
}

export default function BatchPage() {
  const { address } = useAccount();
  const { authenticated } = usePrivy();
  const publicClient = usePublicClient();

  const addrVal = useRef(""); const amtVal = useRef("");
  const addrDom = useRef<HTMLInputElement>(null); const amtDom = useRef<HTMLInputElement>(null);

  const [rows, setRows]       = useState<Row[]>([]);
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy]       = useState(false);
  const [txHash, setTxHash]   = useState<`0x${string}` | undefined>();
  const [drag, setDrag]       = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab]         = useState<"settle"|"history">("settle");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const { writeContractAsync } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const valid = rows.filter(r => r.valid);
  const total = valid.reduce((s, r) => s + parseFloat(r.amount), 0);
  const fee   = total * 0.001;

  // ── Fetch ALL batch history from blockchain ──────────────
  const fetchHistory = useCallback(async () => {
    if (!address || !FLUX_ADDRESS || !publicClient) return;
    setLoadingHistory(true); setHistoryError("");
    try {
      const events = await publicClient.getContractEvents({
        address: FLUX_ADDRESS as `0x${string}`,
        abi: FLUX_ABI,
        eventName: "BatchSettled",
        args: { sender: address as `0x${string}` }, // filter by indexed sender
        fromBlock: FLUX_DEPLOY_BLOCK,
        toBlock: "latest",
      });
      const items: HistoryItem[] = events
        .map(e => ({
          count:     (e.args as any).recipientCount as bigint,
          totalUSDC: (e.args as any).totalUSDC as bigint,
          fee:       (e.args as any).fee as bigint,
          timestamp: (e.args as any).timestamp as bigint,
          txHash:    e.transactionHash ?? undefined,
        }))
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp)); // newest first
      setHistory(items);
    } catch (err) {
      console.error("Failed to load batch history:", err);
      setHistoryError("Could not load history from chain. Check your connection and refresh.");
    } finally { setLoadingHistory(false); }
  }, [address, publicClient]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Real-time: new batch settled → refresh history
  useWatchContractEvent({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, eventName: "BatchSettled",
    enabled: !!FLUX_ADDRESS,
    onLogs: (logs) => {
      const mine = logs.filter(l => (l as any).args?.sender?.toLowerCase() === address?.toLowerCase());
      if (mine.length > 0) { setTimeout(fetchHistory, 2000); } // re-fetch after 2s
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
    const a = addrVal.current.trim(); const v = amtVal.current.trim();
    if (!a) { setFormErr("Wallet address is required"); addrDom.current?.focus(); return; }
    if (!ADDR.test(a)) { setFormErr("Invalid address — must be 0x + 40 hex characters"); addrDom.current?.focus(); return; }
    if (!v || parseFloat(v) <= 0) { setFormErr("Enter a valid USDC amount greater than 0"); amtDom.current?.focus(); return; }
    setRows(p => [...p, validateRow({ address: a, amount: v })]);
    addrVal.current = ""; amtVal.current = "";
    if (addrDom.current) addrDom.current.value = "";
    if (amtDom.current)  amtDom.current.value  = "";
    addrDom.current?.focus();
  };

  const doSettle = async () => {
    setConfirm(false); setBusy(true); setFormErr("");
    if (!FLUX_ADDRESS || !USDC_ADDRESS) {
      setFormErr("Contracts not deployed — set NEXT_PUBLIC_FLUX_ADDRESS in .env.local");
      setBusy(false); return;
    }
    try {
      const recipients = valid.map(r => r.address as `0x${string}`);
      const amounts    = valid.map(r => parseUSDC(r.amount));
      const sum        = amounts.reduce((a, b) => a + b, 0n);
      const feeAmt     = (sum * 10n) / 10000n;
      const totalNeeded = sum + feeAmt;

      const usdcBalance = await readContract(wagmiConfig, {
        address: USDC_ADDRESS as `0x${string}`,
        abi: USDC_ABI, functionName: "balanceOf",
        args: [address as `0x${string}`],
      }) as bigint;

      if (usdcBalance < totalNeeded) {
        setFormErr(`Insufficient USDC. You have ${formatUSDC(usdcBalance)} but need ${formatUSDC(totalNeeded)} USDC.`);
        setBusy(false); return;
      }

      const gasLimit = BigInt(80_000 + recipients.length * 65_000);
      await writeContractAsync({ address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [FLUX_ADDRESS as `0x${string}`, totalNeeded] });
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "batchSettle", args: [recipients, amounts], gas: gasLimit });
      setTxHash(tx);
    } catch (e: unknown) {
      setFormErr(((e as any).shortMessage || "Transaction failed").slice(0, 200));
    } finally { setBusy(false); }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(history.map(h => ({
      recipients: h.count.toString(),
      totalUSDC: `$${(Number(h.totalUSDC) / 1e6).toFixed(4)}`,
      fee: `$${(Number(h.fee) / 1e6).toFixed(4)}`,
      timestamp: new Date(Number(h.timestamp) * 1000).toISOString(),
      txHash: h.txHash || "",
    })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "flux-batch-history.csv"; a.click();
  };

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px" }}>
      {confirm && (
        <ConfirmModal title="Confirm Batch Settlement"
          message={<div><p style={{ marginBottom:12 }}>You are about to settle:</p><div style={{ background:"var(--bg3)", borderRadius:9, padding:"14px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ color:"var(--tx3)" }}>Recipients</span><span style={{ color:"var(--tx)", fontWeight:700 }}>{valid.length}</span></div><div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ color:"var(--tx3)" }}>Total USDC</span><span style={{ color:"#10b981", fontWeight:700 }}>${total.toFixed(2)}</span></div><div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"var(--tx3)" }}>Fee (0.1%)</span><span style={{ color:"var(--amber)" }}>${fee.toFixed(4)}</span></div></div><p style={{ marginTop:10, fontSize:12, color:"var(--tx3)" }}>Two wallet signatures: approve USDC, then execute batch.</p></div>}
          confirmLabel={`Settle $${(total + fee).toFixed(4)}`} onConfirm={doSettle} onCancel={() => setConfirm(false)} />
      )}

      <div style={{ marginBottom:22, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>Batch Settlement</h1>
          <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>Send USDC to up to 500 recipients in one transaction.{" "}<Tooltip text="Flux charges 0.1% of total USDC as a platform fee."><span style={{ color:"var(--teal)", cursor:"help", fontWeight:700 }}>0.1% fee (?)</span></Tooltip></p>
        </div>
        {rows.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { setRows([]); setFormErr(""); }}>Clear all</button>}
      </div>

      {/* Tabs — flex keeps badge inline at any count */}
      <div className="tabs" style={{ maxWidth:260, marginBottom:22 }}>
        <button className={`tab ${tab==="settle"?"active":""}`} onClick={() => setTab("settle")}>Settle</button>
        <button className={`tab ${tab==="history"?"active":""}`} onClick={() => setTab("history")}
          style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <span>History</span>
          {history.length > 0 && (
            <span style={{ background:"var(--teal)", color:"var(--bg)", fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0, lineHeight:"18px" }}>
              {history.length}
            </span>
          )}
        </button>
      </div>

      {tab === "settle" ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* CSV drop */}
            <div className="card" style={{ borderStyle:"dashed", cursor:"pointer", borderColor:drag?"var(--teal)":"var(--bdr2)", background:drag?"var(--teal-10)":"var(--bg2)", transition:"all 0.2s" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) parseCSV(f); }}>
              <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e => e.target.files?.[0] && parseCSV(e.target.files[0])} />
              <div style={{ padding:"24px", textAlign:"center" }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
                <div style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:14, color:"var(--tx)", marginBottom:4 }}>Drop a CSV or click to upload</div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx3)" }}>Required columns: <span style={{ color:"var(--amber)" }}>address</span>, <span style={{ color:"var(--amber)" }}>amount</span></div>
              </div>
            </div>

            {/* Manual entry */}
            <div className="card">
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Add manually</div></div>
              <div className="card-p">
                <div style={{ display:"grid", gridTemplateColumns:"1fr 150px auto", gap:10, alignItems:"flex-end" }}>
                  <div><label className="lbl">Wallet address</label><input ref={addrDom} className="inp" placeholder="0x..." onChange={e => { addrVal.current = e.target.value; setFormErr(""); }} onKeyDown={e => e.key==="Enter" && addRow()} /></div>
                  <div><label className="lbl">USDC amount</label><input ref={amtDom} className="inp" placeholder="100.00" type="number" min="0" step="0.01" onChange={e => { amtVal.current = e.target.value; setFormErr(""); }} onKeyDown={e => e.key==="Enter" && addRow()} /></div>
                  <button className="btn btn-secondary" onClick={addRow} style={{ height:40 }}>+ Add</button>
                </div>
                {formErr && <FieldError msg={formErr} />}
              </div>
            </div>

            {/* Rows table */}
            {rows.length > 0 && (
              <div className="card" style={{ overflow:"hidden" }}>
                <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}><span style={{ color:"#10b981" }}>{valid.length} valid</span>{rows.length - valid.length > 0 && <span style={{ color:"var(--red)", marginLeft:8 }}>{rows.length - valid.length} invalid</span>}</div></div>
                <div style={{ maxHeight:260, overflowY:"auto" }}>
                  <table className="tbl">
                    <thead><tr><th>#</th><th>Address</th><th>USDC</th><th>Status</th></tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx3)", width:32 }}>{i+1}</td>
                          <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx2)" }}>{r.address ? `${r.address.slice(0,8)}…${r.address.slice(-6)}` : <span style={{ color:"var(--red)" }}>empty</span>}</td>
                          <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:13, color:r.valid?"#10b981":"var(--tx3)" }}>{r.valid ? `$${parseFloat(r.amount).toFixed(2)}` : "—"}</td>
                          <td>{r.valid ? <span className="chip chip-up">✓ valid</span> : <span className="chip chip-down">{r.error}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <div className="card" style={{ position:"sticky", top:72 }}>
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Summary</div></div>
              <div className="card-p">
                {[{l:"Recipients",v:valid.length.toString(),c:"var(--tx)"},{l:"Total USDC",v:`$${total.toFixed(2)}`,c:"#10b981"},{l:"Fee (0.1%)",v:`$${fee.toFixed(4)}`,c:"var(--amber)"}].map(r => (
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
                  <TxBanner hash={txHash} loading={confirming} explorerUrl={explorerLink("tx", txHash)} />
                ) : (
                  <>
                    {!authenticated && <div className="banner warn" style={{ marginBottom:10 }}>Connect wallet to settle</div>}
                    {formErr && !formErr.includes("required") && !formErr.includes("Invalid") && !formErr.includes("Enter") && <div className="banner err" style={{ marginBottom:10 }}>{formErr}</div>}
                    <button className="btn btn-primary btn-full" style={{ padding:"12px", fontSize:14 }} onClick={() => setConfirm(true)} disabled={!authenticated||busy||valid.length===0}>
                      {busy ? "Processing…" : valid.length > 0 ? `Settle ${valid.length} payment${valid.length!==1?"s":""}` : "Add recipients to continue"}
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
        /* History tab — always from blockchain */
        <div className="card" style={{ overflow:"hidden" }}>
          <div className="card-hd">
            <div className="lbl" style={{ marginBottom:0 }}>My Batch History</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--tx3)", fontWeight:500 }}>Live from blockchain</span>
              <button className="btn btn-ghost btn-sm" onClick={fetchHistory} disabled={loadingHistory} style={{ fontSize:11, padding:"2px 8px" }}>{loadingHistory ? "Loading…" : "↻ Refresh"}</button>
              {history.length > 0 && <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{ fontSize:11, padding:"2px 8px" }}>↓ Export CSV</button>}
            </div>
          </div>
          {loadingHistory ? (
            <div style={{ padding:"40px 24px", textAlign:"center", color:"var(--tx3)", fontSize:14 }}>Loading history from blockchain…</div>
          ) : historyError ? (
            <div style={{ padding:"24px" }}><div className="banner err">{historyError}</div></div>
          ) : history.length === 0 ? (
            <EmptyState icon="📋" title="No batch history yet" desc="Your settled batches appear here. Data is always live from the blockchain — no cache." />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>Time</th><th>Recipients</th><th>Total USDC</th><th>Fee</th><th>Tx</th></tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>{new Date(Number(h.timestamp)*1000).toLocaleString()}</td>
                      <td><span className="chip chip-teal">{h.count.toString()}</span></td>
                      <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"#10b981" }}>${(Number(h.totalUSDC)/1e6).toFixed(2)}</td>
                      <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:600, color:"var(--amber)" }}>${(Number(h.fee)/1e6).toFixed(4)}</td>
                      <td>{h.txHash && <a href={explorerLink("tx", h.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{h.txHash.slice(0,8)}… ↗</a>}</td>
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