// components/docs/TableOfContents.tsx
// Right-rail on-page TOC (spec §6.2). Scans the page's own rendered h2s after
// mount rather than requiring each page to hand-declare its section list —
// one generic component, works for every docs page automatically.

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Heading { id: string; text: string }

export function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("main h2[id]"));
      setHeadings(els.map((el) => ({ id: el.id, text: el.textContent ?? "" })));
    }, 50);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" style={{ width: 200, flexShrink: 0, paddingTop: 32, paddingLeft: 24, position: "sticky", top: 56, height: "fit-content", maxHeight: "calc(100vh - 56px)", overflowY: "auto" }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "var(--tx3)", letterSpacing: "0.08em", marginBottom: 10 }}>
        ON THIS PAGE
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, borderLeft: "1px solid var(--bdr)" }}>
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            style={{
              fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, padding: "5px 0 5px 12px", marginLeft: -1,
              borderLeft: `1px solid ${activeId === h.id ? "var(--teal)" : "transparent"}`,
              color: activeId === h.id ? "var(--teal-l)" : "var(--tx3)",
              textDecoration: "none", transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {h.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
