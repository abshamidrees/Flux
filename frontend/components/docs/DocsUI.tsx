// components/docs/DocsUI.tsx
// Shared building blocks for every docs page — replaces the H1/H2/P/Pre
// duplicated per-page across the old docs. CodeBlock gets a copy button here,
// once, instead of needing it re-added to every page individually.

"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export function H1({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h1 id={id} style={{ fontFamily: "'Manrope',sans-serif", fontSize: 32, fontWeight: 800, color: "var(--tx)", letterSpacing: "-0.03em", marginBottom: 12, marginTop: 0, scrollMarginTop: 80 }}>
      {children}
    </h1>
  );
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} style={{ fontFamily: "'Manrope',sans-serif", fontSize: 19, fontWeight: 800, color: "var(--tx)", letterSpacing: "-0.02em", marginTop: 40, marginBottom: 10, scrollMarginTop: 80 }}>
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 style={{ fontFamily: "'Manrope',sans-serif", fontSize: 15, fontWeight: 700, color: "var(--tx)", marginTop: 24, marginBottom: 6 }}>{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 14, color: "var(--tx2)", lineHeight: 1.75, fontWeight: 500, marginBottom: 14 }}>{children}</p>;
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 5, padding: "1px 6px", color: "var(--teal-l)" }}>
      {children}
    </code>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 9V2a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2.5 6.5l2.5 2.5 5-5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Code block with a copy button (spec §6.2 — "copy buttons on every code block"). */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ position: "relative", marginBottom: 18 }}>
      {label && (
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--tx3)", marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <pre style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, background: "var(--bg2)", border: "1px solid var(--bdr)", borderRadius: 10, padding: "16px 44px 16px 18px", color: "var(--tx2)", lineHeight: 1.65, overflowX: "auto", margin: 0 }}>
          {children}
        </pre>
        <button
          onClick={copy}
          aria-label="Copy code"
          style={{
            position: "absolute", top: 10, right: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 6,
            background: "var(--bg3)", border: "1px solid var(--bdr)",
            color: copied ? "var(--teal-l)" : "var(--tx3)", cursor: "pointer",
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

export function Callout({ tone = "teal", children }: { tone?: "teal" | "amber" | "red"; children: ReactNode }) {
  const bg = { teal: "var(--teal-10)", amber: "var(--amber-10)", red: "var(--red-10)" }[tone];
  const bdr = { teal: "var(--teal-20)", amber: "rgba(245,158,11,0.2)", red: "rgba(239,68,68,0.2)" }[tone];
  return <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 10, padding: "13px 16px", marginBottom: 16, fontSize: 13, color: "var(--tx2)", fontWeight: 500, lineHeight: 1.6 }}>{children}</div>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--teal-10)", border: "1px solid var(--teal-20)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color: "var(--teal)" }}>
        {n}
      </div>
      <div>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx)", marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.6, fontWeight: 500 }}>{children}</div>
      </div>
    </div>
  );
}

/** Contract/token address — ArcScan-linked, monospace, teal (Flux convention). */
export function AddressLink({ address, label }: { address: string; label?: string }) {
  const short = `${address.slice(0, 8)}…${address.slice(-6)}`;
  return (
    <a
      href={`https://testnet.arcscan.app/address/${address}`}
      target="_blank" rel="noopener noreferrer"
      style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--teal-l)", textDecoration: "none" }}
    >
      {label ?? short} ↗
    </a>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: "ready" | "pending" }) {
  const color = tone === "ready" ? "var(--teal-l)" : "var(--tx3)";
  const bg = tone === "ready" ? "var(--teal-10)" : "var(--bg3)";
  const bdr = tone === "ready" ? "var(--teal-20)" : "var(--bdr)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, border: `1px solid ${bdr}`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

export function FeatureCard({ icon, title, desc, href }: { icon: ReactNode; title: string; desc: string; href: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{ background: "var(--bg2)", border: "1px solid var(--bdr)", borderRadius: 12, padding: "18px 20px", cursor: "pointer", transition: "border-color 0.15s", height: "100%" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--teal)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--bdr)"; }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--bg3)", border: "1px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--teal-l)", marginBottom: 12 }}>
          {icon}
        </div>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--tx)", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 500, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </Link>
  );
}
