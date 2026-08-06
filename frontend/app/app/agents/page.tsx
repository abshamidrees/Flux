"use client";
// app/app/agents/page.tsx
// Phase H5 — the agentic Agent Registry dashboard, wired to
// FluxAgentRegistry (Phase H3), replacing the old static list that was
// wired to FluxSettlement's custodial agent pool. That contract/its
// registerAgent/depositForAgents/agentPay functions still exist on-chain,
// untouched — this is a frontend page swap for the new non-custodial
// model, not a contract migration.
//
// Enforcement note shown throughout: Circle's own wallet-layer spending
// policies are documented mainnet-only (testnet policy-set calls are
// rejected), and Arc is testnet-only today — so FluxAgentRegistry's
// on-chain caps ARE the real enforcement here, not a redundant layer on
// top of Circle's. When Circle's policies reach Arc mainnet, this contract
// keeps working the same way; Flux would align its UI to Circle's model
// at that point, not replace the enforcement.

import { useState, useRef, useEffect, useCallback } from "react";
import { useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "../../../lib/wallet/WalletContext";
import {
  FLUX_AGENT_REGISTRY_ABI, FLUX_AGENT_REGISTRY_ADDRESS,
  USDC_ABI, USDC_ADDRESS,
  parseUSDC, formatUSDC, shortAddress, explorerLink,
} from "../../../lib/arc";
import { fetchMyAgents, fetchAgentPayments, type RegistryAgentSummary, type AgentPaymentRecord } from "../../../lib/blockchain";
import { Tooltip, ConfirmModal, EmptyState, Skeleton, TxBanner } from "../../../components/UI";
import { IconAgent, IconEmptyAgent, IconActivity } from "../../../components/icons";

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const AGENT_STATUS = ["Active", "Paused", "Revoked"] as const;

function FieldError({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>⚠ {msg}</div>;
}

function CapMeter({ label, spent, cap }: { label: string; spent: bigint; cap: bigint }) {
  const pct = cap > 0n ? Math.min(100, Number((spent * 100n) / cap)) : 0;
  const color = pct > 85 ? "var(--red)" : pct > 60 ? "var(--amber)" : "var(--teal)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 11, color: "var(--tx2)", fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--tx3)" }}>${formatUSDC(spent)} / ${formatUSDC(cap)}</span>
      </div>
      <div className="prog-track"><div className="prog-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

function ExpiryCountdown({ expiry }: { expiry: bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);
  if (expiry === 0n) return <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}>No expiry</span>;
  const secs = Number(expiry) - now;
  if (secs <= 0) return <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 700 }}>Expired</span>;
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const text = days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h left` : `${Math.floor(secs / 60)}m left`;
  return <span style={{ fontSize: 11, color: secs < 3600 ? "var(--amber)" : "var(--tx3)", fontWeight: 600 }}>{text}</span>;
}

/* ─── Policy editor (caps, allow/blocklist, allowlist mode) ─────────── */
function PolicyEditor({ agentId, agent, onDone }: { agentId: bigint; agent: any; onDone: () => void }) {
  // Migrated to the unified wallet context (close-out pass): this page is
  // owner-action-only (a human signing to manage their own agent's policy,
  // never the agent itself), so every write here works identically whether
  // the owner connected via Privy or Circle — writeContract() dispatches to
  // the right signing path either way. See lib/wallet/WalletContext.tsx's
  // top-of-file note for why swap/batch/streams were NOT migrated the same
  // way in this pass.
  const { writeContract } = useWallet();
  const perTx = useRef(formatUSDC(agent.perTxCap));
  const daily = useRef(formatUSDC(agent.dailyCap));
  const total = useRef(formatUSDC(agent.totalCap));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listAddr, setListAddr] = useState("");

  const submitCaps = async () => {
    setErr(""); setBusy(true);
    try {
      const p = parseUSDC(perTx.current), d = parseUSDC(daily.current), t = parseUSDC(total.current);
      if (p <= 0n || d <= 0n || t <= 0n) throw new Error("All caps must be greater than 0");
      if (p > d) throw new Error("Per-tx cap can't exceed daily cap");
      if (d > t) throw new Error("Daily cap can't exceed total cap");
      await writeContract({
        address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI,
        functionName: "updateCaps", args: [agentId, p, d, t, agent.expiry],
      });
      onDone();
    } catch (e: unknown) {
      setErr((e as { shortMessage?: string; message?: string }).shortMessage || (e as Error).message || "Update failed");
    } finally { setBusy(false); }
  };

  const toggleAllowlistMode = async () => {
    setBusy(true);
    try {
      await writeContract({
        address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI,
        functionName: "setRestrictToAllowlist", args: [agentId, !agent.restrictToAllowlist],
      });
      onDone();
    } catch { /* surfaced via banner elsewhere */ } finally { setBusy(false); }
  };

  const addToList = async (mode: "allow" | "block") => {
    if (!ADDR.test(listAddr.trim())) { setErr("Enter a valid 0x address"); return; }
    setBusy(true); setErr("");
    try {
      await writeContract({
        address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI,
        functionName: mode === "allow" ? "setAllowlisted" : "setBlocklisted",
        args: [agentId, [listAddr.trim() as `0x${string}`], true],
      });
      setListAddr("");
      onDone();
    } catch (e: unknown) {
      setErr((e as { shortMessage?: string }).shortMessage || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ borderTop: "1px solid var(--bdr)", marginTop: 14, paddingTop: 14 }}>
      <div className="lbl" style={{ marginBottom: 10 }}>
        <Tooltip text="On-chain payments can never exceed these caps. Gateway payments only respect them if the agent's code checks first.">
          Policy editor
        </Tooltip>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><label className="lbl" style={{ fontSize: 10 }}>Per-tx</label><input className="inp" defaultValue={perTx.current} onChange={e => perTx.current = e.target.value} /></div>
        <div><label className="lbl" style={{ fontSize: 10 }}>Daily</label><input className="inp" defaultValue={daily.current} onChange={e => daily.current = e.target.value} /></div>
        <div><label className="lbl" style={{ fontSize: 10 }}>Total</label><input className="inp" defaultValue={total.current} onChange={e => total.current = e.target.value} /></div>
      </div>
      {err && <FieldError msg={err} />}
      <button className="btn btn-secondary btn-sm" onClick={submitCaps} disabled={busy} style={{ marginBottom: 14 }}>{busy ? "Saving…" : "Save caps"}</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Tooltip text="When on, this agent can only pay addresses you've allowlisted.">
          <span className="lbl" style={{ marginBottom: 0 }}>Restrict to allowlist</span>
        </Tooltip>
        <button className={`btn btn-sm ${agent.restrictToAllowlist ? "btn-primary" : "btn-ghost"}`} onClick={toggleAllowlistMode} disabled={busy}>
          {agent.restrictToAllowlist ? "On" : "Off"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input className="inp" placeholder="0x… recipient" value={listAddr} onChange={e => setListAddr(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => addToList("allow")} disabled={busy}>Allow</button>
        <button className="btn btn-danger btn-sm" onClick={() => addToList("block")} disabled={busy}>Block</button>
      </div>
    </div>
  );
}

/* ─── Per-agent card ──────────────────────────────────────────────── */
function AgentCard({ summary, connectedAddress }: { summary: RegistryAgentSummary; connectedAddress?: string }) {
  const { agentId } = summary;
  const { writeContract } = useWallet();
  const [editing, setEditing] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [approveTx, setApproveTx] = useState<`0x${string}` | undefined>();

  const { data: agent, isLoading, refetch } = useReadContract({
    address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI,
    functionName: "getAgent", args: [agentId], query: { enabled: !!FLUX_AGENT_REGISTRY_ADDRESS },
  });

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "allowance",
    args: connectedAddress ? [connectedAddress as `0x${string}`, FLUX_AGENT_REGISTRY_ADDRESS] : undefined,
    query: { enabled: !!connectedAddress && !!USDC_ADDRESS },
  });

  const { isLoading: approveConf } = useWaitForTransactionReceipt({ hash: approveTx });

  const isSelfOperated = connectedAddress && agent && connectedAddress.toLowerCase() === (agent as any).agentWallet.toLowerCase();
  const needsApproval = isSelfOperated && (allowance as bigint | undefined) !== undefined && (allowance as bigint) === 0n;

  const doAction = async (name: "pause" | "resume" | "revoke") => {
    setBusy(name); setActionErr("");
    try {
      await writeContract({
        address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI,
        functionName: name, args: [agentId],
      });
      setRevokeConfirm(false);
      refetch();
    } catch (e: unknown) {
      setActionErr((e as { shortMessage?: string }).shortMessage || "Action failed");
    } finally { setBusy(null); }
  };

  const doApprove = async () => {
    setBusy("approve");
    try {
      const { txHash } = await writeContract({
        address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve",
        args: [FLUX_AGENT_REGISTRY_ADDRESS, 2n ** 256n - 1n],
      });
      setApproveTx(txHash as `0x${string}` | undefined);
    } catch { /* ignore, banner-less: allowance re-check on refetch */ } finally { setBusy(null); }
  };

  if (isLoading || !agent) return <div className="card card-p"><Skeleton h={100} w="100%" /></div>;
  const a = agent as any;
  const status = AGENT_STATUS[a.status] ?? "Unknown";

  return (
    <div className="card">
      {revokeConfirm && (
        <ConfirmModal
          title="Revoke agent"
          message={<p>This permanently disables agent #{agentId.toString()}. It can't be reactivated. Register a new agent if you need one later.</p>}
          confirmLabel="Revoke permanently"
          onConfirm={() => doAction("revoke")}
          onCancel={() => setRevokeConfirm(false)}
        />
      )}
      <div className="card-p">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--bg3)", border: "1px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx3)", flexShrink: 0 }}>
            <IconAgent size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--tx)" }}>Agent #{agentId.toString()}</div>
              <span className={`chip ${status === "Active" ? "chip-up" : status === "Paused" ? "chip-muted" : "chip-down"}`} style={{ fontSize: 10, flexShrink: 0 }}>● {status}</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--tx3)" }}>{shortAddress(a.agentWallet)}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
          <CapMeter label="Today" spent={a.spentToday} cap={a.dailyCap} />
          <CapMeter label="Lifetime" spent={a.spentTotal} cap={a.totalCap} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <ExpiryCountdown expiry={a.expiry} />
          <a href={explorerLink("address", a.agentWallet)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Manrope',sans-serif", fontSize: 11, fontWeight: 600, color: "var(--teal)" }}>ArcScan ↗</a>
        </div>

        {needsApproval && (
          <div className="banner warn" style={{ marginBottom: 10, fontSize: 12 }}>
            This wallet is the agent. Approve USDC spending to let it pay.
            <button className="btn btn-primary btn-sm" onClick={doApprove} disabled={busy === "approve"} style={{ marginTop: 8, width: "100%" }}>
              {busy === "approve" || approveConf ? "Approving…" : "Approve FluxAgentRegistry"}
            </button>
          </div>
        )}

        {actionErr && <FieldError msg={actionErr} />}

        <div style={{ display: "flex", gap: 8 }}>
          {status === "Active" && <button className="btn btn-secondary btn-sm" onClick={() => doAction("pause")} disabled={!!busy} style={{ flex: 1 }}>{busy === "pause" ? "…" : "Pause"}</button>}
          {status === "Paused" && <button className="btn btn-secondary btn-sm" onClick={() => doAction("resume")} disabled={!!busy} style={{ flex: 1 }}>{busy === "resume" ? "…" : "Resume"}</button>}
          {status !== "Revoked" && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(v => !v)} style={{ flex: 1 }}>{editing ? "Close" : "Edit policy"}</button>}
          {status !== "Revoked" && (
            <button className="btn btn-danger btn-sm" onClick={() => setRevokeConfirm(true)} disabled={!!busy} style={{ flex: 1 }}>
              {busy === "revoke" ? "…" : "Kill-switch"}
            </button>
          )}
        </div>

        {editing && status !== "Revoked" && <PolicyEditor agentId={agentId} agent={a} onDone={refetch} />}
      </div>
    </div>
  );
}

/* ─── Register form ───────────────────────────────────────────────── */
function RegisterForm({ onRegistered }: { onRegistered: () => void }) {
  const { isConnected, writeContract } = useWallet();
  const walletVal = useRef(""), perTxVal = useRef(""), dailyVal = useRef(""), totalVal = useRef(""), expiryVal = useRef("");
  const walletDom = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [snap, setSnap] = useState({ wallet: "", perTx: "", daily: "", total: "", days: "" });
  const [tx, setTx] = useState<`0x${string}` | undefined>();
  const { isLoading: conf } = useWaitForTransactionReceipt({ hash: tx });

  const handleClick = () => {
    setErr("");
    const wallet = walletVal.current.trim(), perTx = perTxVal.current.trim(), daily = dailyVal.current.trim(), total = totalVal.current.trim(), days = expiryVal.current.trim();
    if (!ADDR.test(wallet)) { setErr("Enter a valid agent wallet address"); walletDom.current?.focus(); return; }
    const p = parseFloat(perTx), d = parseFloat(daily), t = parseFloat(total);
    if (!p || p <= 0) { setErr("Enter a per-tx cap greater than 0"); return; }
    if (!d || d <= 0) { setErr("Enter a daily cap greater than 0"); return; }
    if (!t || t <= 0) { setErr("Enter a total cap greater than 0"); return; }
    if (p > d) { setErr("Per-tx cap can't exceed daily cap"); return; }
    if (d > t) { setErr("Daily cap can't exceed total cap"); return; }
    setSnap({ wallet, perTx, daily, total, days });
    setConfirm(true);
  };

  const doRegister = async () => {
    setConfirm(false); setBusy(true);
    try {
      const expiry = snap.days ? BigInt(Math.floor(Date.now() / 1000) + Number(snap.days) * 86400) : 0n;
      const { txHash } = await writeContract({
        address: FLUX_AGENT_REGISTRY_ADDRESS, abi: FLUX_AGENT_REGISTRY_ABI,
        functionName: "registerAgent",
        args: [snap.wallet as `0x${string}`, parseUSDC(snap.perTx), parseUSDC(snap.daily), parseUSDC(snap.total), expiry],
      });
      setTx(txHash as `0x${string}` | undefined);
      walletVal.current = ""; perTxVal.current = ""; dailyVal.current = ""; totalVal.current = ""; expiryVal.current = "";
      if (walletDom.current) walletDom.current.value = "";
      setTimeout(onRegistered, 3000);
    } catch (e: unknown) {
      setErr((e as { shortMessage?: string }).shortMessage || "Registration failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="card">
      {confirm && (
        <ConfirmModal
          title="Register Agent"
          message={
            <div>
              <p style={{ marginBottom: 12 }}>Register this agent wallet with the following caps:</p>
              <div style={{ background: "var(--bg3)", borderRadius: 9, padding: "14px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>
                <div style={{ marginBottom: 5, wordBreak: "break-all" }}><span style={{ color: "var(--tx3)" }}>Wallet: </span>{snap.wallet}</div>
                <div style={{ marginBottom: 5 }}><span style={{ color: "var(--tx3)" }}>Per-tx: </span><span style={{ color: "var(--teal)", fontWeight: 700 }}>${parseFloat(snap.perTx).toFixed(2)}</span></div>
                <div style={{ marginBottom: 5 }}><span style={{ color: "var(--tx3)" }}>Daily: </span><span style={{ color: "var(--teal)", fontWeight: 700 }}>${parseFloat(snap.daily).toFixed(2)}</span></div>
                <div><span style={{ color: "var(--tx3)" }}>Total: </span><span style={{ color: "var(--teal)", fontWeight: 700 }}>${parseFloat(snap.total).toFixed(2)}</span></div>
              </div>
            </div>
          }
          confirmLabel="Register Agent" onConfirm={doRegister} onCancel={() => setConfirm(false)}
        />
      )}
      <div className="card-hd">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--teal-10)", border: "1px solid var(--teal-20)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconAgent size={14} /></div>
          <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 14, fontWeight: 800, color: "var(--tx)" }}>Register Agent</span>
        </div>
      </div>
      <div className="card-p">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="lbl"><Tooltip text="The wallet that will make payments. Any wallet works for on-chain payments. Gateway payments need a plain wallet, not a Circle wallet.">Agent Wallet Address</Tooltip></label>
            <input ref={walletDom} className="inp" placeholder="0x…" onChange={e => { walletVal.current = e.target.value; setErr(""); }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><label className="lbl" style={{ fontSize: 10 }}>Per-tx cap</label><input className="inp" type="number" min="0" step="0.01" placeholder="10.00" onChange={e => perTxVal.current = e.target.value} /></div>
            <div><label className="lbl" style={{ fontSize: 10 }}>Daily cap</label><input className="inp" type="number" min="0" step="0.01" placeholder="50.00" onChange={e => dailyVal.current = e.target.value} /></div>
            <div><label className="lbl" style={{ fontSize: 10 }}>Total cap</label><input className="inp" type="number" min="0" step="0.01" placeholder="1000.00" onChange={e => totalVal.current = e.target.value} /></div>
          </div>
          {/* Not fine print — the two enforcement tiers genuinely carry
              different guarantees, and hiding that in a tooltip would be
              exactly the kind of silent gap this note exists to avoid. Kept
              short on purpose; full explanation lives in the docs. */}
          <div style={{ background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, color: "var(--tx2)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--tx)" }}>Heads up:</strong> on-chain payments can never exceed these caps. Gateway payments only respect them if the agent's own code checks first.{" "}
            <a href="/docs/agents#enforcement" style={{ color: "var(--teal-l)" }}>Learn more</a>
          </div>
          <div>
            <label className="lbl"><Tooltip text="Leave blank for no expiry. After this many days, the agent can't spend anymore.">Expires in (days, optional)</Tooltip></label>
            <input className="inp" type="number" min="0" step="1" placeholder="No expiry" onChange={e => expiryVal.current = e.target.value} />
          </div>
          {err && <FieldError msg={err} />}
          {!isConnected && <div className="banner warn">Connect wallet to register agents</div>}
          {tx ? <TxBanner hash={tx} loading={conf} explorerUrl={explorerLink("tx", tx)} /> : (
            <button className="btn btn-primary btn-full" onClick={handleClick} disabled={!isConnected || busy}>{busy ? "Registering…" : "Register Agent"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Marketplace (honest empty state) ───────────────────────────── */
function MarketplaceTab() {
  return (
    <div className="card">
      <EmptyState
        icon={<IconActivity size={28} />}
        title="No marketplace services yet"
        desc="Nothing published yet. This section goes live once real services are available."
      />
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────── */
export default function AgentsPage() {
  const { isConnected, address } = useWallet();
  const [tab, setTab] = useState<"agents" | "activity" | "marketplace">("agents");

  const [myAgents, setMyAgents] = useState<RegistryAgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsErr, setAgentsErr] = useState("");

  const [payments, setPayments] = useState<AgentPaymentRecord[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [payErr, setPayErr] = useState("");

  const loadAgents = useCallback(async () => {
    if (!address || !FLUX_AGENT_REGISTRY_ADDRESS) return;
    setAgentsLoading(true); setAgentsErr("");
    try {
      setMyAgents(await fetchMyAgents(address));
    } catch (e: unknown) {
      setAgentsErr(`Could not load agents: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)}`);
    } finally { setAgentsLoading(false); }
  }, [address]);

  const loadPayments = useCallback(async () => {
    if (!FLUX_AGENT_REGISTRY_ADDRESS) return;
    setPayLoading(true); setPayErr("");
    try {
      const ids = myAgents.map(a => a.agentId);
      setPayments(await fetchAgentPayments(ids.length ? ids : undefined));
    } catch (e: unknown) {
      setPayErr(`Could not load activity: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)}`);
    } finally { setPayLoading(false); }
  }, [myAgents]);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { if (tab === "activity") loadPayments(); }, [tab, loadPayments]);

  const notDeployed = !FLUX_AGENT_REGISTRY_ADDRESS;

  return (
    <div className="page-pad">
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: "var(--tx)", letterSpacing: "-0.03em", marginBottom: 3 }}>Agent Registry</h1>
          <a href="/docs/agents" style={{ fontSize: 12, fontWeight: 600, color: "var(--teal-l)" }}>Read the docs →</a>
        </div>
        <p style={{ fontSize: 13, color: "var(--tx3)", fontWeight: 500, maxWidth: 640 }}>
          Give an AI agent its own USDC wallet with hard spending limits, then let it pay on its own.
        </p>
      </div>

      {notDeployed && <div className="banner warn" style={{ marginBottom: 16 }}>FluxAgentRegistry address not configured.</div>}

      <div className="tabs" style={{ maxWidth: 340, marginBottom: 22 }}>
        <button className={`tab ${tab === "agents" ? "active" : ""}`} onClick={() => setTab("agents")}>My Agents</button>
        <button className={`tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>Activity</button>
        <button className={`tab ${tab === "marketplace" ? "active" : ""}`} onClick={() => setTab("marketplace")}>Marketplace</button>
      </div>

      {tab === "agents" && (
        <div className="form-grid-2">
          <RegisterForm onRegistered={loadAgents} />
          <div>
            <div className="lbl" style={{ marginBottom: 12 }}>Your Agents {agentsLoading ? "" : `(${myAgents.length})`}</div>
            {!isConnected ? (
              <div className="card"><EmptyState icon={<IconEmptyAgent size={28} />} title="Connect a wallet" desc="Connect to see and manage agents you've registered." /></div>
            ) : agentsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2].map(i => <div key={i} className="card card-p"><Skeleton h={100} w="100%" /></div>)}</div>
            ) : agentsErr ? (
              <div className="card card-p"><div className="banner err" style={{ marginBottom: 12 }}>{agentsErr}</div><button className="btn btn-ghost btn-sm" onClick={loadAgents}>Try again</button></div>
            ) : myAgents.length === 0 ? (
              <div className="card"><EmptyState icon={<IconEmptyAgent size={28} />} title="No agents registered" desc="Register your first policy-controlled agent wallet." /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {myAgents.map(a => <AgentCard key={a.agentId.toString()} summary={a} connectedAddress={address ?? undefined} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-hd">
            <div className="lbl" style={{ marginBottom: 0 }}>Live Payment Feed</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 500 }}>Reconstructed from AgentPayment events</span>
              <button className="btn btn-ghost btn-sm" onClick={loadPayments} disabled={payLoading} style={{ fontSize: 11, padding: "2px 8px" }}>{payLoading ? "Loading…" : "↻ Refresh"}</button>
            </div>
          </div>
          {payLoading ? (
            <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--tx3)", fontSize: 14 }}>Loading activity…</div>
          ) : payErr ? (
            <div style={{ padding: 24 }}><div className="banner err" style={{ marginBottom: 12 }}>{payErr}</div><button className="btn btn-ghost btn-sm" onClick={loadPayments}>Try again</button></div>
          ) : payments.length === 0 ? (
            <EmptyState icon={<IconActivity size={28} />} title="No payments yet" desc="Agent payments show up here live as they happen." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Agent</th><th>Recipient</th><th>Amount</th><th>Running total</th><th>Tx</th></tr></thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td>#{p.agentId.toString()}</td>
                      <td><a href={explorerLink("address", p.to)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--teal)" }}>{shortAddress(p.to)}</a></td>
                      <td style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, color: "var(--teal)" }}>${formatUSDC(p.amount)}</td>
                      <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--tx3)" }}>${formatUSDC(p.spentTotal)}</td>
                      <td><a href={explorerLink("tx", p.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--teal)" }}>{p.txHash.slice(0, 8)}… ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "marketplace" && <MarketplaceTab />}
    </div>
  );
}
