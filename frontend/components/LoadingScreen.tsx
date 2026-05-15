"use client";

import { useEffect, useState } from "react";

/* Used two ways:
 * 1. <LoadingScreen /> inside AppLayout — shows while theme hydrates (prevents flash)
 * 2. <PageLoadingScreen /> — triggered by landing page link clicks
 */

const ANIM_CSS = `
  .c3 .rA,.c3 .rB,.c3 .rC{
    stroke-dasharray:6 5;stroke-dashoffset:0;opacity:0;
    animation:c3RailFade .4s ease-out forwards, c3Flow 1.4s linear .6s infinite;
  }
  .c3 .rA{animation-delay:.1s,.6s}
  .c3 .rB{animation-delay:.25s,.6s}
  .c3 .rC{animation-delay:.4s,.6s}
  @keyframes c3RailFade{to{opacity:1}}
  @keyframes c3Flow{to{stroke-dashoffset:-22}}
  .c3 .nd{transform-origin:52px 40px;animation:c3NodeIdle 2.2s ease-in-out .6s infinite}
  @keyframes c3NodeIdle{0%,100%{r:6;opacity:.9}50%{r:7;opacity:1}}
  .c3 .ring1,.c3 .ring2{opacity:0;fill:none;stroke:white;stroke-width:1.5}
  .c3 .ring1{animation:c3Ring 2.2s ease-out .7s infinite}
  .c3 .ring2{animation:c3Ring 2.2s ease-out 1.5s infinite}
  @keyframes c3Ring{0%{r:6;opacity:.7}100%{r:20;opacity:0}}
  @keyframes fluxFadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
  @keyframes fluxFadeOut{from{opacity:1}to{opacity:0;pointer-events:none}}
  @keyframes dotPulse{0%,80%,100%{opacity:.3}40%{opacity:1}}
`;

function LoadingInner({ fading }: { fading: boolean }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM_CSS }} />
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#030a08",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 24,
        animation: fading
          ? "fluxFadeOut .35s ease forwards"
          : "fluxFadeIn .25s ease",
        pointerEvents: fading ? "none" : "all",
      }}>
        <svg className="c3" width="120" height="120" viewBox="0 0 80 80" fill="none">
          <circle className="ring1" cx="52" cy="40" r="6"/>
          <circle className="ring2" cx="52" cy="40" r="6"/>
          <line className="rA" x1="12" y1="22" x2="52" y2="40" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
          <line className="rB" x1="12" y1="40" x2="52" y2="40" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
          <line className="rC" x1="12" y1="58" x2="52" y2="40" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
          <circle className="nd" cx="52" cy="40" r="6" fill="white"/>
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "'Manrope',sans-serif", fontSize: 18, fontWeight: 700,
            color: "#0f766e", letterSpacing: "0.04em", marginBottom: 8,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
          }}>
            Loading Flux
            {[0,1,2].map(i => (
              <span key={i} style={{ animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`, display: "inline-block" }}>.</span>
            ))}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "rgba(15,118,110,0.5)", letterSpacing: "0.1em" }}>
            PROGRAMMABLE USDC RAILS
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Used by AppLayout to cover theme hydration flash ── */
export function LoadingScreen() {
  const [phase, setPhase] = useState<"show"|"fade"|"gone">("show");

  useEffect(() => {
    // Hide after a short delay — just long enough for layout to hydrate
    const t1 = setTimeout(() => setPhase("fade"), 600);
    const t2 = setTimeout(() => setPhase("gone"), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "gone") return null;
  return <LoadingInner fading={phase === "fade"} />;
}

/* ── Used by landing page link clicks — global singleton ── */
let _setGlobalLoading: ((v: boolean) => void) | null = null;

export function triggerPageLoad() {
  _setGlobalLoading?.(true);
}

export function GlobalLoadingScreen() {
  const [active, setActive] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    _setGlobalLoading = (v: boolean) => {
      if (v) {
        setFading(false);
        setActive(true);
      } else {
        setFading(true);
        setTimeout(() => setActive(false), 380);
      }
    };
    return () => { _setGlobalLoading = null; };
  }, []);

  if (!active) return null;
  return <LoadingInner fading={fading} />;
}
