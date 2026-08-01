// app/docs/layout.tsx
// Restructured per spec §6.2: persistent left sidebar, on-page TOC on the
// right (components/docs/TableOfContents.tsx, self-scanning per page),
// breadcrumbs (rendered per-page via Breadcrumbs — path segments alone can't
// produce the right label casing/grouping), copy buttons on code blocks
// (components/docs/DocsUI.tsx CodeBlock), and a persistent network badge.
//
// Logo fix (spec §6.1): the old layout pointed <img src="/logo.png"> at a
// file that was never in public/ — a broken image, not a missing-logo bug
// with an easy one-line fix. The landing page's actual mark is the inline
// FluxMark SVG component (components/UI.tsx), not an image file at all, so
// this reuses that component exactly rather than pointing at a new asset.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { FluxMark, Arrow } from "../../components/UI";
import { TableOfContents } from "../../components/docs/TableOfContents";

const NAV = [
  { section: "INTRODUCTION", links: [{ href: "/docs", label: "Introduction" }] },
  { section: "PAYMENTS", links: [
    { href: "/docs/batch",   label: "Batch Settlement" },
    { href: "/docs/streams", label: "Payment Streams" },
    { href: "/docs/agents",  label: "Agent Registry" },
  ]},
  { section: "SWAP", links: [{ href: "/docs/swap", label: "Swap" }] },
  { section: "REFERENCE", links: [
    { href: "/docs/reference", label: "Contracts & events" },
    { href: "/docs/faq",       label: "FAQ" },
  ]},
];

function NetworkBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: "var(--tx3)", background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 999, padding: "4px 11px" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal-l)" }} />
      Arc Testnet · 5042002
    </span>
  );
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid var(--bdr)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
              <FluxMark size={26} />
              <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--tx)", letterSpacing: "-0.03em" }}>Flux</span>
            </Link>
            <span style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 600, background: "var(--bg3)", padding: "2px 8px", borderRadius: 6, border: "1px solid var(--bdr)" }}>Docs</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <NetworkBadge />
            <Link href="/app" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
              Launch app <Arrow size={13} color="#fff" />
            </Link>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", maxWidth: 1320, margin: "0 auto", width: "100%", padding: "0 24px" }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, paddingTop: 32, paddingRight: 24, position: "sticky", top: 56, height: "calc(100vh - 56px)", overflowY: "auto", borderRight: "1px solid var(--bdr)" }}>
          {NAV.map((sec) => (
            <div key={sec.section} style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--tx3)", letterSpacing: "0.08em", marginBottom: 8 }}>{sec.section}</div>
              {sec.links.map((l) => {
                const active = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    style={{
                      display: "block", fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? "var(--teal-l)" : "var(--tx2)", background: active ? "var(--teal-10)" : "transparent",
                      textDecoration: "none", padding: "5px 10px", borderRadius: 7, marginBottom: 2,
                    }}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0, paddingTop: 32, paddingLeft: 40, paddingBottom: 80, maxWidth: 720 }}>
          {children}
        </main>

        {/* On-page TOC */}
        <TableOfContents />
      </div>
    </div>
  );
}
