"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance } from "wagmi";
import { useState, useEffect, useRef } from "react";
import { USDC_ADDRESS, shortAddress } from "../../lib/arc";
import { FluxMark, NetworkBanner } from "../../components/UI";
import { LoadingScreen } from "../../components/LoadingScreen";
import { NotificationBell } from "../../components/NotificationBell";
import { IconSun, IconMoon } from "../../components/icons";
import { SwapButton } from "../../components/swap/SwapButton";

const NAV = [
  { href: "/app",         label: "Dashboard" },
  { href: "/app/batch",   label: "Batch"     },
  { href: "/app/streams", label: "Streams"   },
  { href: "/app/agents",  label: "Agents"    },
];

function CopyIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 9V2a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}

/* ── Wallet dropdown ─────────────────────────────────────── */
function WalletMenu({ address, balance, onDisconnect }: {
  address: string;
  balance: string | null;
  onDisconnect: () => void;
}) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Same card treatment as the other header buttons (bell, theme, Swap):
          --bg3 fill, --bdr border, 36px height, bg3->bg4 hover — no teal. */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 600,
          color: "var(--tx)", background: "var(--bg3)",
          border: "1px solid var(--bdr)", height: 36, padding: "0 12px",
          borderRadius: 9, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 7, transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = "var(--bg4)"; el.style.borderColor = "var(--bdr2)"; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = "var(--bg3)"; el.style.borderColor = "var(--bdr)"; }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", flexShrink: 0 }} />
        {shortAddress(address)}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none", color: "var(--tx2)" }}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "var(--bg2)", border: "1px solid var(--bdr2)",
          borderRadius: 10, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          zIndex: 500, overflow: "hidden",
          animation: "slideUp 0.15s ease",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--bdr)" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--tx)", marginBottom: 8, wordBreak: "break-all" }}>
              {address}
            </div>
            <button
              onClick={copy}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: "'Manrope',sans-serif", fontSize: 12, fontWeight: 600,
                color: copied ? "#10b981" : "var(--tx3)",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                transition: "color 0.15s",
              }}
            >
              <CopyIcon />
              {copied ? "Copied!" : "Copy address"}
            </button>
          </div>

          {balance && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bdr)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 500 }}>Balance</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#10b981", fontWeight: 700 }}>{balance} USDC</span>
            </div>
          )}

          <button
            onClick={() => { setOpen(false); onDisconnect(); }}
            style={{
              width: "100%", padding: "11px 14px",
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 600,
              color: "#fca5a5", background: "none", border: "none",
              cursor: "pointer", textAlign: "left", transition: "background 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 7H2M2 7l2.5-2.5M2 7l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 4V3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function AppNav({ theme, toggleTheme }: { theme: string; toggleTheme: () => void }) {
  const path = usePathname();
  const { login, logout, authenticated, ready } = usePrivy();
  const { address } = useAccount();
  const { data: bal } = useBalance({
    address,
    token: USDC_ADDRESS as `0x${string}`,
    query: { enabled: !!address && !!USDC_ADDRESS },
  });

  const displayBalance = bal
    ? parseFloat(bal.formatted).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : null;

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: theme === "dark" ? "rgba(11,14,17,0.92)" : "rgba(255,255,255,0.94)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--bdr)",
    }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>

        {/* Logo + Nav */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 28, textDecoration: "none" }}>
            <FluxMark size={26} />
            <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--tx)", letterSpacing: "-0.03em" }}>Flux</span>
          </Link>

          {NAV.map(n => {
            const active = path === n.href;
            return (
              <Link key={n.href} href={n.href} style={{
                fontFamily: "'Manrope',sans-serif", fontSize: 13,
                fontWeight: active ? 700 : 600,
                color: active ? "var(--teal)" : "var(--tx2)",
                padding: "5px 12px", borderRadius: 7,
                background: active ? "var(--teal-10)" : "transparent",
                border: active ? "1px solid var(--teal-20)" : "1px solid transparent",
                textDecoration: "none", transition: "all 0.15s",
              }}>
                {n.label}
              </Link>
            );
          })}
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* Notification Bell — same .icon-btn style as theme toggle */}
          <NotificationBell />

          {/* Theme toggle — matches bell exactly */}
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>

          {/* Swap — action, left of the wallet chip (spec §5) */}
          <SwapButton />

          {/* Wallet */}
          {!ready ? (
            <div className="btn btn-ghost btn-sm" style={{ opacity: 0.5, pointerEvents: "none" }}>Loading…</div>
          ) : authenticated && address ? (
            <WalletMenu address={address} balance={displayBalance} onDisconnect={logout} />
          ) : (
            <button onClick={login} className="btn btn-primary btn-sm">
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pingDot { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.8);} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("flux-theme") || "dark";
    setTheme(saved);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("flux-theme", next);
  };

  if (!mounted) return <LoadingScreen />;

  return (
    <div className="app-root" data-theme={theme}>
      <AppNav theme={theme} toggleTheme={toggleTheme} />
      <NetworkBanner />
      <main style={{ minHeight: "calc(100vh - 56px)" }}>
        {children}
      </main>
    </div>
  );
}