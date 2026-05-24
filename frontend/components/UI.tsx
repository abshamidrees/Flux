"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import { useAccount } from "wagmi";
import { arcTestnet } from "../lib/arc";

/* ─── Logo ──────────────────────────────────────────────── */
export function FluxMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, background: "#0f766e",
      borderRadius: size * 0.22, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
      boxShadow: "0 2px 10px rgba(15,118,110,0.35)",
    }}>
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 80 80" fill="none">
        <line x1="12" y1="22" x2="52" y2="40" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="12" y1="40" x2="52" y2="40" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="12" y1="58" x2="52" y2="40" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <circle cx="52" cy="40" r="6" fill="white"/>
        <path d="M62 33 Q70 40 62 47" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

/* ─── Premium arrow — replaces thin → everywhere ───────── */
export function Arrow({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 8H13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 4L13 8L9 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─── Tooltip — fixed: horizontal, clean corners ─────────── */
export function Tooltip({ text, children }: { text: string; children?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [flip, setFlip]       = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setFlip(r.top < 150);
  }, [visible]);

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children != null ? (
        <span style={{
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textDecorationColor: "var(--tx3, rgba(255,255,255,0.35))",
          textUnderlineOffset: "3px",
          cursor: "help",
        }}>
          {children}
        </span>
      ) : (
        <span style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "var(--bg4, #1c2235)", border: "1px solid var(--bdr2, #2a3655)",
          color: "var(--tx3, #4a5470)", fontSize: 10, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "help", flexShrink: 0, lineHeight: 1,
        }}>?</span>
      )}

      {/* Tooltip panel */}
      {visible && (
        <span style={{
          position: "absolute",
          [flip ? "top" : "bottom"]: "calc(100% + 9px)",
          left: "0",
          zIndex: 9999,
          display: "block",
          width: 230,
          pointerEvents: "none",
        }}>
          {/* Arrow */}
          <span style={{
            position: "absolute",
            [flip ? "bottom" : "top"]: -5,
            left: 12,
            display: "block",
            width: 8,
            height: 8,
            background: "var(--bg2, #1a1d24)",
            border: "1px solid var(--bdr2, rgba(255,255,255,0.1))",
            borderRadius: 2,
            transform: flip ? "rotate(225deg)" : "rotate(45deg)",
          }} />
          {/* Box */}
          <span style={{
            display: "block",
            background: "var(--bg2, #1a1d24)",
            border: "1px solid var(--bdr2, rgba(255,255,255,0.1))",
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 12,
            color: "var(--tx2, #9ca3b0)",
            fontWeight: 500,
            lineHeight: 1.6,
            fontFamily: "'Manrope', sans-serif",
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            letterSpacing: "-0.01em",
          }}>
            {text}
          </span>
        </span>
      )}
    </span>
  );
}

/* ─── Confirm modal ─────────────────────────────────────── */
interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
export function ConfirmModal({ title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box">
        <div className="modal-hd">
          <h3>{title}</h3>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 20, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 14, color: "var(--tx2)", lineHeight: 1.65 }}>{message}</div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Network banner — fix: uses wallet_addEthereumChain ── */
export function NetworkBanner() {
  const { chainId, isConnected } = useAccount();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  if (!isConnected || chainId === arcTestnet.id) return null;

  const switchToArc = async () => {
    setSwitching(true);
    setError("");
    try {
      const provider = (window as unknown as { ethereum?: unknown }).ethereum;
      if (!provider) { setError("MetaMask not detected"); setSwitching(false); return; }

      // Try switching first
      try {
        await (provider as { request: (args: { method: string; params: unknown[] }) => Promise<void> }).request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x4CBFF2" }], // 5042002 in hex
        });
      } catch (switchErr: unknown) {
        const err = switchErr as { code?: number };
        // 4902 = chain not added — add it
        if (err.code === 4902 || err.code === -32603) {
          await (provider as { request: (args: { method: string; params: unknown[] }) => Promise<void> }).request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x4CBFF2",
              chainName: "Arc Testnet",
              nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
              rpcUrls: ["https://rpc.testnet.arc.network"],
              blockExplorerUrls: ["https://testnet.arcscan.app"],
            }],
          });
        } else {
          throw switchErr;
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string; code?: number };
      if (err.code !== 4001) { // 4001 = user rejected
        setError(err.message?.slice(0, 60) || "Switch failed");
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="net-banner" style={{ margin: "16px 24px 0", maxWidth: 1120, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 13, color: "#fbbf24" }}>Wrong Network</div>
          <div style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 500 }}>
            Flux runs on Arc Testnet (Chain ID 5042002).
            {error && <span style={{ color: "#fca5a5", marginLeft: 6 }}>{error}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={switchToArc}
        disabled={switching}
        style={{
          fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 700,
          color: "#0a0b0d", background: "#f59e0b",
          padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer",
          transition: "all 0.15s", flexShrink: 0,
          opacity: switching ? 0.7 : 1,
        }}
        onMouseEnter={e => { if (!switching) (e.currentTarget as HTMLButtonElement).style.background = "#d97706"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f59e0b"; }}
      >
        {switching ? "Opening MetaMask…" : "Switch to Arc Testnet"}
      </button>
    </div>
  );
}

/* ─── Skeleton loader ────────────────────────────────────── */
export function Skeleton({ w = "100%", h = 20, br = 6 }: { w?: string | number; h?: number; br?: number }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: br }} />;
}

/* ─── Empty state ────────────────────────────────────────── */
export function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "52px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--tx)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--tx3)", marginBottom: action ? 20 : 0, maxWidth: 340, margin: "0 auto", lineHeight: 1.6 }}>{desc}</div>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

/* ─── Tx result banner ───────────────────────────────────── */
export function TxBanner({ hash, loading, explorerUrl }: { hash: string; loading: boolean; explorerUrl: string }) {
  return (
    <div className="banner ok" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>{loading ? "⏳" : "✅"}</span>
      <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 600 }}>
        {loading ? "Confirming on Arc…" : "Transaction confirmed!"}{" "}
        {!loading && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: "#34d399", fontWeight: 700, textDecoration: "underline" }}>
            View on ArcScan ↗
          </a>
        )}
      </span>
    </div>
  );
}
