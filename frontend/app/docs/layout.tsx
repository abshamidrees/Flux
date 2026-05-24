"use client";

import Link from "next/link";
import { ReactNode } from "react";

const NAV = [
  { section: "OVERVIEW",  links: [
    { href: "/docs",              label: "Introduction" },
    { href: "/docs/quick-start",  label: "Quick Start" },
  ]},
  { section: "FEATURES", links: [
    { href: "/docs/batch",   label: "Batch Settlement" },
    { href: "/docs/streams", label: "Payment Streams" },
    { href: "/docs/agents",  label: "Agent Registry" },
  ]},
  { section: "REFERENCE", links: [
    { href: "/docs/contract", label: "Smart Contract" },
    { href: "/docs/faq",      label: "FAQ" },
  ]},
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid var(--bdr)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <img src="/logo.png" alt="Flux" style={{ width: 32, height: 32, objectFit: "contain" }} />
              <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--tx)" }}>Flux</span>
            </Link>
            <span style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 600, background: "var(--bg3)", padding: "2px 8px", borderRadius: 6, border: "1px solid var(--bdr)" }}>Docs</span>
          </div>
          <Link href="/app" style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 700, color: "var(--teal)", textDecoration: "none" }}>
            Launch App →
          </Link>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 24px" }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, paddingTop: 32, paddingRight: 24, position: "sticky", top: 56, height: "calc(100vh - 56px)", overflowY: "auto", borderRight: "1px solid var(--bdr)" }}>
          {NAV.map(sec => (
            <div key={sec.section} style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--tx3)", letterSpacing: "0.08em", marginBottom: 8 }}>{sec.section}</div>
              {sec.links.map(l => (
                <Link key={l.href} href={l.href} style={{
                  display: "block", fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 500,
                  color: "var(--tx2)", textDecoration: "none", padding: "5px 10px", borderRadius: 7,
                  marginBottom: 2, transition: "all 0.15s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; (e.currentTarget as HTMLElement).style.color = "var(--tx)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--tx2)"; }}
                >{l.label}</Link>
              ))}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main style={{ flex: 1, paddingTop: 32, paddingLeft: 40, paddingBottom: 80, maxWidth: 760 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
