// components/docs/Breadcrumbs.tsx
"use client";

import Link from "next/link";

export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 12.5, fontFamily: "'Manrope',sans-serif" }}>
      {trail.map((t, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span style={{ color: "var(--tx3)" }}>/</span>}
          {t.href ? (
            <Link href={t.href} style={{ color: "var(--tx3)", textDecoration: "none", fontWeight: 600 }}>
              {t.label}
            </Link>
          ) : (
            <span style={{ color: "var(--tx2)", fontWeight: 700 }}>{t.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
