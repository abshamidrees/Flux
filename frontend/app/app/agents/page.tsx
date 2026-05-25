"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { FLUX_ABI, FLUX_ADDRESS, USDC_ABI, USDC_ADDRESS, parseUSDC, formatUSDC, shortAddress, explorerLink } from "../../../lib/arc";
import { fetchAgentActivity, type AgentActivity } from "../../../lib/blockchain";
import { Tooltip, ConfirmModal, EmptyState, Skeleton, TxBanner } from "../../../components/UI";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

function FieldError({ msg }: { msg: string }) {
  return <div style={{ fontSize:12, color:"#fca5a5", fontWeight:600, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>⚠ {msg}</div>;
}

function SpendBar({ spent, cap }: { spent: bigint; cap: bigint }) {
  const pct   = cap > 0n ? Math.min(100, Number((spent * 100n) / cap)) : 0;
  const color = pct > 85 ? "var(--red)" : pct > 60 ? "var(--amber)" : "var(--teal)";
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ fontFamily:"'Manrope',sans-serif", fontSize:12, color:"var(--tx2)", fontWeight:600 }}>${formatUSDC(spent)} spent</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx3)" }}>${formatUSDC(cap)} cap</span>
      </div>
      <div className="prog-track"><div className="prog-fill" style={{ width:`${pct}%`, background:color }} /></div>
      <div style={{ fontSize:11, color:"var(--tx3)", marginTop:4, fontWeight:500 }}>{pct.toFixed(0)}% of budget used</div>
    </div>
  );
}

function AgentCard({ addr, selected, onClick }: { addr: string; selected: boolean; onClick: () => void }) {
  const { data: info, isLoading } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getAgent",
    args: [addr as `0x${string}`], query: { enabled: !!FLUX_ADDRESS },
  });
  return (
    <div className="card" style={{ cursor:"pointer", border: selected ? "1px solid var(--teal)" : "1px solid var(--bdr)", transition:"all 0.18s" }}
      onClick={onClick}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor="var(--bdr2)"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor="var(--bdr)"; }}
    >
      <div className="card-p">
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:"var(--bg3)", border:"1px solid var(--bdr)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🤖</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
              <div style={{ fontFamily:"'Manrope',sans-serif", fontWeight:800, fontSize:14, color:"var(--tx)", marginBottom:2 }}>
                {isLoading ? <Skeleton h={14} w={90} /> : ((info as any)?.label || "Unnamed Agent")}
              </div>
              {!isLoading && info && (
                <span className={`chip ${(info as any).active ? "chip-up" : "chip-down"}`} style={{ fontSize:10, flexShrink:0 }}>
                  {(info as any).active ? "● Active" : "● Inactive"}
                </span>
              )}
            </div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--tx3)" }}>{shortAddress(addr)}</div>
          </div>
        </div>
        {isLoading ? <Skeleton h={8} w="100%" /> : info && <SpendBar spent={(info as any).spent} cap={(info as any).budgetCap} />}
        <a href={explorerLink("address", addr)} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily:"'Manrope',sans-serif", fontSize:12, fontWeight:600, color:"var(--teal)", display:"inline-flex", alignItems:"center", gap:4, marginTop:10 }}>ArcScan ↗</a>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [tab, setTab] = useState<"registry"|"activity">("registry");

  // Register form
  const agAddrVal = useRef(""); const agLabelVal = useRef(""); const budgetVal = useRef("");
  const agAddrDom = useRef<HTMLInputElement>(null); const agLabelDom = useRef<HTMLInputElement>(null); const budgetDom = useRef<HTMLInputElement>(null);
  const [rErr, setRErr] = useState(""); const [rBusy, setRBusy] = useState(false);
  const [rTx, setRTx]   = useState<`0x${string}`|undefined>();
  const [rConfirm, setRConfirm] = useState(false);
  const [rSnap, setRSnap] = useState({ addr:"", label:"", budget:"" });

  // Deposit form
  const depVal = useRef(""); const depDom = useRef<HTMLInputElement>(null);
  const [dErr, setDErr] = useState(""); const [dBusy, setDBusy] = useState(false);
  const [dTx, setDTx]   = useState<`0x${string}`|undefined>();
  const [dConfirm, setDConfirm] = useState(false); const [dSnap, setDSnap] = useState("");

  const [selectedAgent, setSelectedAgent] = useState<string|null>(null);
  const [activity, setActivity]           = useState<AgentActivity[]>([]);
  const [actLoading, setActLoading]       = useState(false);
  const [actError, setActError]           = useState("");

  const { isLoading: rConf } = useWaitForTransactionReceipt({ hash: rTx });
  const { isLoading: dConf } = useWaitForTransactionReceipt({ hash: dTx });

  // Contract reads
  const { data: contractOwner } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "owner",
    query: { enabled: !!FLUX_ADDRESS },
  });
  const isOwner = !!address && !!contractOwner &&
    address.toLowerCase() === (contractOwner as string).toLowerCase();

  const { data: allAgents, isLoading: agentsLoading } = useReadContract({
    address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getAllAgents",
    query: { enabled: !!FLUX_ADDRESS },
  });

  // ── Fetch agent activity from blockchain ──────────────────
  const loadActivity = useCallback(async () => {
    if (!FLUX_ADDRESS) return;
    setActLoading(true); setActError("");
    try {
      const data = await fetchAgentActivity();
      setActivity(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActError(`Could not load activity: ${msg.slice(0,100)}`);
    } finally { setActLoading(false); }
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  // ── Register ──────────────────────────────────────────────
  const handleRegisterClick = () => {
    setRErr("");
    if (!isOwner) { setRErr("Connect the contract deployer wallet to register agents."); return; }
    const addr = agAddrVal.current.trim(), label = agLabelVal.current.trim(), budget = budgetVal.current.trim();
    if (!addr)  { setRErr("Agent wallet address is required"); agAddrDom.current?.focus(); return; }
    if (!ADDR.test(addr)) { setRErr("Invalid address — 0x + 40 hex characters"); agAddrDom.current?.focus(); return; }
    if (!label) { setRErr("Label is required"); agLabelDom.current?.focus(); return; }
    if (!budget || parseFloat(budget) <= 0) { setRErr("Enter a budget cap greater than 0"); budgetDom.current?.focus(); return; }
    setRSnap({ addr, label, budget }); setRConfirm(true);
  };

  const doRegister = async () => {
    setRConfirm(false); setRBusy(true);
    try {
      const tx = await writeContractAsync({
        address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI,
        functionName: "registerAgent",
        args: [rSnap.addr as `0x${string}`, rSnap.label, parseUSDC(rSnap.budget)],
        gas: 200_000n,
      });
      setRTx(tx);
      agAddrVal.current=""; agLabelVal.current=""; budgetVal.current="";
      if (agAddrDom.current) agAddrDom.current.value="";
      if (agLabelDom.current) agLabelDom.current.value="";
      if (budgetDom.current) budgetDom.current.value="";
      setTimeout(() => loadActivity(), 3000);
    } catch (e: unknown) {
      const msg = (e as {shortMessage?:string}).shortMessage || "Transaction failed";
      setRErr(msg.includes("owner") ? "Only the contract deployer wallet can register agents." : msg.slice(0,160));
    } finally { setRBusy(false); }
  };

  // ── Deposit ───────────────────────────────────────────────
  const handleDepositClick = () => {
    setDErr("");
    if (!isOwner) { setDErr("Connect the contract deployer wallet to fund the treasury."); return; }
    const amt = depVal.current.trim();
    if (!amt || parseFloat(amt) <= 0) { setDErr("Enter a deposit amount greater than 0"); depDom.current?.focus(); return; }
    setDSnap(amt); setDConfirm(true);
  };

  const doDeposit = async () => {
    setDConfirm(false); setDBusy(true);
    if (!FLUX_ADDRESS || !USDC_ADDRESS) { setDErr("Contracts not deployed"); setDBusy(false); return; }
    try {
      const a = parseUSDC(dSnap);
      await writeContractAsync({ address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName:"approve", args:[FLUX_ADDRESS as `0x${string}`, a] });
      const tx = await writeContractAsync({ address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName:"depositForAgents", args:[a], gas:300_000n });
      setDTx(tx);
      depVal.current=""; if (depDom.current) depDom.current.value="";
    } catch (e: unknown) {
      const msg = (e as {shortMessage?:string}).shortMessage || "Transaction failed";
      setDErr(msg.includes("owner") ? "Only the contract deployer wallet can fund the treasury." : msg.slice(0,140));
    } finally { setDBusy(false); }
  };

  const myActivity = activity.filter(a => !selectedAgent || a.agent.toLowerCase()===selectedAgent.toLowerCase());

  return (
    <div style={{ maxWidth:1120, margin:"0 auto", padding:"32px 24px" }}>
      {rConfirm && <ConfirmModal title="Register Agent"
        message={<div><p style={{ marginBottom:12 }}>Register this AI agent wallet:</p><div style={{ background:"var(--bg3)", borderRadius:9, padding:"14px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}><div style={{ marginBottom:5, wordBreak:"break-all" }}><span style={{ color:"var(--tx3)" }}>Address: </span>{rSnap.addr}</div><div style={{ marginBottom:5 }}><span style={{ color:"var(--tx3)" }}>Label: </span>{rSnap.label}</div><div><span style={{ color:"var(--tx3)" }}>Budget cap: </span><span style={{ color:"var(--teal)", fontWeight:700 }}>${parseFloat(rSnap.budget).toFixed(2)} USDC</span></div></div></div>}
        confirmLabel="Register Agent" onConfirm={doRegister} onCancel={()=>setRConfirm(false)} />}
      {dConfirm && <ConfirmModal title="Fund Agent Treasury"
        message={<p>Deposit <strong>${parseFloat(dSnap).toFixed(2)} USDC</strong> into the contract treasury. Registered agents draw from this pool for autonomous payments.</p>}
        confirmLabel="Deposit" onConfirm={doDeposit} onCancel={()=>setDConfirm(false)} />}

      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:22, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:3 }}>Agent Registry</h1>
        <p style={{ fontSize:13, color:"var(--tx3)", fontWeight:500 }}>
          Register AI wallets with USDC spending caps for autonomous onchain commerce.{" "}
          <Tooltip text="An agent calls agentPay() autonomously up to its budget cap. Contract blocks any payment exceeding the cap.">What is an agent?</Tooltip>
        </p>
      </div>

      {/* Subtle owner notice */}
      {authenticated && !isOwner && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"rgba(234,179,8,0.05)", border:"1px solid rgba(234,179,8,0.14)", borderRadius:8, fontSize:12, color:"rgba(234,179,8,0.6)", fontWeight:500, marginBottom:16 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink:0 }}><circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.4"/><rect x="5.35" y="5" width="1.3" height="3.5" rx="0.65" fill="currentColor"/><circle cx="6" cy="3.2" r="0.7" fill="currentColor"/></svg>
          Owner wallet required — use the contract deployer wallet to register agents or fund treasury.
        </div>
      )}

      <div className="tabs" style={{ maxWidth:260, marginBottom:22 }}>
        <button className={`tab ${tab==="registry"?"active":""}`} onClick={()=>setTab("registry")}>Registry</button>
        <button className={`tab ${tab==="activity"?"active":""}`} onClick={()=>setTab("activity")} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <span>Activity</span>
          {activity.length>0 && <span style={{ background:"var(--teal)", color:"var(--bg)", fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0, lineHeight:"18px" }}>{activity.length}</span>}
        </button>
      </div>

      {tab==="registry" ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Register */}
            <div className="card" style={{ opacity: !isOwner && authenticated ? 0.6 : 1 }}>
              <div className="card-hd">
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--teal-10)", border:"1px solid var(--teal-20)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>◎</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"var(--tx)" }}>Register Agent</span></div>
                <span className="chip chip-muted" style={{ fontSize:10 }}>Owner only</span>
              </div>
              <div className="card-p">
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div>
                    <label className="lbl"><Tooltip text="The AI agent wallet that will call agentPay() autonomously.">Agent Wallet Address</Tooltip></label>
                    <input ref={agAddrDom} className="inp" placeholder="0x..." onChange={e=>{agAddrVal.current=e.target.value;setRErr("");}} />
                  </div>
                  <div><label className="lbl">Label</label><input ref={agLabelDom} className="inp" placeholder="Treasury Bot v1" onChange={e=>{agLabelVal.current=e.target.value;setRErr("");}} /></div>
                  <div>
                    <label className="lbl"><Tooltip text="Max cumulative USDC this agent can spend. Contract blocks payments exceeding this.">USDC Budget Cap</Tooltip></label>
                    <input ref={budgetDom} className="inp" placeholder="500.00" type="number" min="0" step="0.01" onChange={e=>{budgetVal.current=e.target.value;setRErr("");}} />
                  </div>
                  {rErr && <FieldError msg={rErr} />}
                  {!authenticated && <div className="banner warn">Connect wallet to register agents</div>}
                  {rTx ? <TxBanner hash={rTx} loading={rConf} explorerUrl={explorerLink("tx",rTx)} /> : (
                    <button className="btn btn-primary btn-full" onClick={handleRegisterClick} disabled={!authenticated||rBusy}>{rBusy?"Registering…":"Register Agent"}</button>
                  )}
                </div>
              </div>
            </div>

            {/* Fund */}
            <div className="card" style={{ opacity: !isOwner && authenticated ? 0.6 : 1 }}>
              <div className="card-hd">
                <div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:24, height:24, borderRadius:6, background:"var(--green-10)", border:"1px solid var(--green-20)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>⬡</div><span style={{ fontFamily:"'Manrope',sans-serif", fontSize:14, fontWeight:800, color:"#10b981" }}>Fund Treasury</span></div>
                <span className="chip chip-muted" style={{ fontSize:10 }}>Owner only</span>
              </div>
              <div className="card-p">
                <p style={{ fontSize:13, color:"var(--tx2)", marginBottom:12, lineHeight:1.55, fontWeight:500 }}>Deposit USDC so agents can trigger autonomous payments without manual intervention.</p>
                <div style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <input ref={depDom} className="inp" placeholder="1000.00" type="number" min="0" step="0.01" onChange={e=>{depVal.current=e.target.value;setDErr("");}} style={{ flex:1 }} />
                  <button className="btn btn-primary btn-sm" onClick={handleDepositClick} disabled={!authenticated||dBusy} style={{ background:"#10b981",flexShrink:0 }}>{dBusy?"…":"Deposit"}</button>
                </div>
                {dErr && <FieldError msg={dErr} />}
                {dTx && <TxBanner hash={dTx} loading={dConf} explorerUrl={explorerLink("tx",dTx)} />}
              </div>
            </div>

            {/* Flow */}
            <div className="card">
              <div className="card-hd"><div className="lbl" style={{ marginBottom:0 }}>Agentic commerce flow</div></div>
              <div className="card-p">
                {[["1. Register","Whitelist agent wallet + set budget cap"],["2. Fund","Deposit USDC into contract treasury"],["3. Act","Agent calls agentPay(recipient, amount)"],["4. Guard","Contract blocks payments > cap"],["5. Audit","Every payment logged on-chain"]].map(([t,d])=>(
                  <div key={t} style={{ display:"flex", gap:12, marginBottom:8 }}><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, fontWeight:700, color:"var(--teal)", flexShrink:0, minWidth:68, marginTop:2 }}>{t}</span><span style={{ fontSize:12, color:"var(--tx2)", lineHeight:1.5, fontWeight:500 }}>{d}</span></div>
                ))}
              </div>
            </div>
          </div>

          {/* Agent cards */}
          <div>
            <div className="lbl" style={{ marginBottom:12 }}>Registered Agents {agentsLoading?"":` (${(allAgents as string[])?.length ?? 0})`}</div>
            {agentsLoading ? (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>{[1,2].map(i=><div key={i} className="card card-p"><Skeleton h={80} w="100%" /></div>)}</div>
            ) : !(allAgents as string[]) || (allAgents as string[]).length===0 ? (
              <div className="card"><EmptyState icon="🤖" title="No agents registered" desc="Register your first AI agent wallet to enable autonomous USDC payments." /></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {(allAgents as string[]).map(addr=>(
                  <AgentCard key={addr} addr={addr} selected={selectedAgent===addr} onClick={()=>setSelectedAgent(selectedAgent===addr?null:addr)} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            <button className={`btn btn-sm ${!selectedAgent?"btn-primary":"btn-ghost"}`} onClick={()=>setSelectedAgent(null)}>All agents</button>
            {(allAgents as string[])?.map(addr=>(
              <button key={addr} className={`btn btn-sm ${selectedAgent===addr?"btn-primary":"btn-ghost"}`} onClick={()=>setSelectedAgent(selectedAgent===addr?null:addr)}>{shortAddress(addr)}</button>
            ))}
          </div>
          <div className="card" style={{ overflow:"hidden" }}>
            <div className="card-hd">
              <div className="lbl" style={{ marginBottom:0 }}>Agent Activity</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:12, color:"var(--tx3)", fontWeight:500 }}>Live from blockchain</span>
                <button className="btn btn-ghost btn-sm" onClick={loadActivity} disabled={actLoading} style={{ fontSize:11, padding:"2px 8px" }}>{actLoading?"Loading…":"↻ Refresh"}</button>
              </div>
            </div>
            {actLoading ? (
              <div style={{ padding:"40px 24px", textAlign:"center", color:"var(--tx3)", fontSize:14 }}>Loading activity…</div>
            ) : actError ? (
              <div style={{ padding:"24px" }}><div className="banner err" style={{ marginBottom:12 }}>{actError}</div><button className="btn btn-ghost btn-sm" onClick={loadActivity}>Try again</button></div>
            ) : myActivity.length===0 ? (
              <EmptyState icon="📡" title="No activity yet" desc="Agent registrations and payments appear here live from the blockchain." />
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table className="tbl">
                  <thead><tr><th>Event</th><th>Agent</th><th>Amount</th><th>Tx</th></tr></thead>
                  <tbody>
                    {myActivity.map((a,i)=>(
                      <tr key={i}>
                        <td><span className={`chip ${a.type==="registered"?"chip-teal":"chip-up"}`} style={{ fontSize:10 }}>{a.type==="registered"?"Registered":"Payment"}</span></td>
                        <td><a href={explorerLink("address",a.agent)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{shortAddress(a.agent)}</a></td>
                        <td style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, color:"var(--teal)" }}>${formatUSDC(a.amount)}</td>
                        <td>{a.txHash&&<a href={explorerLink("tx",a.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--teal)" }}>{a.txHash.slice(0,8)}… ↗</a>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}