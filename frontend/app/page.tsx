"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { FluxMark, Arrow } from "../components/UI";
import { GlobalLoadingScreen, triggerPageLoad } from "../components/LoadingScreen";

/* ─── Counter ─────────────────────────────────────────── */
function Counter({ to }: { to: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let s = 0;
      const t = setInterval(() => {
        s++;
        setVal(Math.round(to * Math.min(1, s / 50)));
        if (s >= 50) clearInterval(t);
      }, 1400 / 50);
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val.toLocaleString()}</span>;
}

/* ─── CTA Link with loading trigger ──────────────────── */
function AppLink({ 
  children, 
  className, 
  style, 
  onMouseEnter, 
  onMouseLeave 
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href="/app"
      className={className}
      style={style}
      onClick={triggerPageLoad}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </Link>
  );
}

/* ─── Nav ─────────────────────────────────────────────── */
function Nav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const fn = () => setSolid(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
      transition: "all 0.3s",
      background: solid ? "rgba(255,255,255,0.97)" : "transparent",
      backdropFilter: solid ? "blur(20px)" : "none",
      borderBottom: solid ? "1px solid #e2e8f0" : "1px solid transparent",
      boxShadow: solid ? "0 1px 20px rgba(0,0,0,0.06)" : "none",
    }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", height: 66, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FluxMark size={34} />
          <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 19, color: "#0f172a", letterSpacing: "-0.03em" }}>Flux</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {[{ l: "Features", h: "#features" }, { l: "How it works", h: "#how-it-works" }, { l: "FAQ", h: "#faq" }].map(n => (
            <a key={n.l} href={n.h} style={{ fontFamily: "'Manrope',sans-serif", fontSize: 14, fontWeight: 600, color: "#475569", padding: "8px 13px", borderRadius: 8, textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#0f172a"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#475569"; }}>
              {n.l}
            </a>
          ))}
          <div style={{ width: 1, height: 18, background: "#e2e8f0", margin: "0 8px" }} />
          <AppLink style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "'Manrope',sans-serif", fontSize: 14, fontWeight: 700,
            color: "#fff", padding: "10px 22px", borderRadius: 9,
            background: "#0f766e", textDecoration: "none", transition: "all 0.2s",
            boxShadow: "0 2px 14px rgba(15,118,110,0.3)",
          }}>
            Get Started <Arrow size={14} color="#fff" />
          </AppLink>
        </div>
      </div>
    </nav>
  );
}

/* ─── Mock UI ──────────────────────────────────────────── */
function MockUI() {
  return (
    <div style={{ background: "#0b0d13", border: "1px solid #1f2840", borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.28)" }}>
      <div style={{ padding: "11px 16px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid #1f2840", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "rgba(255,255,255,0.28)" }}>flux · batch settlement</span>
        <div style={{ width: 36 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #1f2840" }}>
        {[{ l: "SETTLED", v: "$42,800", c: "#10b981" }, { l: "RECIPIENTS", v: "284", c: "#f59e0b" }].map((s, i) => (
          <div key={i} style={{ padding: "14px 18px", borderRight: i === 0 ? "1px solid #1f2840" : "none" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 5 }}>{s.l}</div>
            <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 12px" }}>
        {[["0x1a2b…3c4d","$1,200",true],["0x9e8f…7a6b","$850",true],["0x5c4d…3e2f","$2,100",true],["0x7b8a…9c0d","$440",false]].map(([a,v,ok],i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderRadius: 7, marginBottom: 2, background: !ok ? "rgba(245,158,11,0.05)" : "transparent" }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "rgba(255,255,255,0.42)" }}>{a as string}</span>
            <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 12, fontWeight: 700, color: "#10b981" }}>{v as string}</span>
            <span>{ok ? <span style={{ color:"#10b981",fontSize:12 }}>✓</span> : <span style={{ color:"#f59e0b",fontSize:12 }}>⟳</span>}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 12px 14px" }}>
        <div style={{ background: "#0f766e", borderRadius: 9, padding: "12px 16px", textAlign: "center", fontFamily: "'Manrope',sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>
          Settle 284 payments — $42,800
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ item ─────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #e2e8f0" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", paddingRight: 24, lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontSize: 24, color: "#0f766e", flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "none", fontWeight: 300 }}>+</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 22, fontFamily: "'Manrope',sans-serif", fontSize: 15, color: "#475569", lineHeight: 1.72, fontWeight: 500 }}>
          {a}
        </div>
      )}
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div style={{ fontFamily: "'Manrope',sans-serif", overflowX: "hidden" }}>
      {/* Global loading screen singleton */}
      <GlobalLoadingScreen />

      <Nav />

      {/* ══ HERO ══════════════════════════════════════════ */}
      <section style={{
        position: "relative", minHeight: "100vh",
        background: "linear-gradient(145deg, #c8f5e9 0%, #e8fdf5 25%, #f8fafc 55%, #ddeeff 80%, #d4e8ff 100%)",
        display: "flex", alignItems: "center", overflow: "hidden",
      }}>
        {/* Large glow orbs for visual depth */}
        <div style={{ position: "absolute", top: "-15%", right: "-8%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(15,118,110,0.13) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "0%", left: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(15,118,110,0.09) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "30%", left: "40%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "130px 32px 90px", width: "100%", position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1fr 370px", gap: 56, alignItems: "center" }}>
          <div>
            {/* Live badge */}
            <div className="fu0" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(15,118,110,0.12)", border: "1px solid rgba(15,118,110,0.28)", borderRadius: 100, padding: "7px 16px", marginBottom: 28 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0f766e", animation: "pingDot 2s ease-in-out infinite" }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, color: "#0f766e", letterSpacing: "0.08em" }}>LIVE ON ARC TESTNET</span>
            </div>

            {/* Headline */}
            <h1 className="fu1" style={{
              fontFamily: "'Manrope',sans-serif",
              fontSize: "clamp(40px, 5.5vw, 66px)",
              fontWeight: 800, color: "#0f172a",
              lineHeight: 1.04, letterSpacing: "-0.03em",
              marginBottom: 20, textTransform: "uppercase",
            }}>
              MOVE MONEY<br />
              <span style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                AUTONOMOUSLY
              </span>
            </h1>

            {/* Sub */}
            <p className="fu2" style={{ fontSize: 18, color: "#334155", lineHeight: 1.7, maxWidth: 500, marginBottom: 36, fontWeight: 500 }}>
              Programmable USDC payment rails for AI agents, DAOs, and enterprise treasuries.
              Batch 500 payouts in one transaction. Sub-second finality.
            </p>

            {/* CTA */}
            <div className="fu3" style={{ marginBottom: 52 }}>
              <AppLink
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  fontFamily: "'Manrope',sans-serif", fontSize: 16, fontWeight: 700,
                  color: "#fff", padding: "15px 34px", borderRadius: 10,
                  background: "#0f766e", textDecoration: "none", transition: "all 0.2s",
                  boxShadow: "0 4px 20px rgba(15,118,110,0.35)",
                }}
              >
                Launch App <Arrow size={16} color="#fff" />
              </AppLink>
            </div>

            {/* Stats strip */}
            <div className="fu4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: "1px solid rgba(15,118,110,0.2)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)" }}>
              {[
                { v: <><Counter to={500} />+</>, l: "Recipients / tx" },
                { v: "<1s",   l: "Finality" },
                { v: "0.1%", l: "Platform fee" },
                { v: "USDC", l: "Gas token" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "16px 20px", borderRight: i < 3 ? "1px solid rgba(15,118,110,0.12)" : "none" }}>
                  <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 4 }}>{s.v}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Mock UI */}
          <div className="float"><MockUI /></div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══════════════════════════════════ */}
      <section id="how-it-works" style={{ background: "#ffffff", padding: "96px 32px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ display: "inline-block", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0f766e", background: "rgba(15,118,110,0.08)", padding: "5px 14px", borderRadius: 100, marginBottom: 14 }}>How it works</div>
            <h2 style={{ fontFamily: "'Manrope',sans-serif", fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>Three steps to settlement</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {[
              { n: "01", icon: "🔑", title: "Connect & approve", desc: "Add Arc testnet to MetaMask. Approve USDC once. Flux handles everything — no per-transaction approvals.", color: "#0f766e" },
              { n: "02", icon: "📋", title: "Upload recipients",  desc: "Drag a CSV or add wallets manually. Flux validates every address and calculates totals including the 0.1% fee.", color: "#0f766e" },
              { n: "03", icon: "⚡", title: "Settle in one tx",   desc: "One transaction. Sub-second Arc finality. USDC reaches every wallet simultaneously. Explorer link instant.", color: "#0f766e" },
            ].map(s => (
              <div 
                key={s.n} 
                className="land-card" 
                style={{ 
                  position: "relative", 
                  backgroundColor: "#CCF6EC", /* Changed card background here */
                  padding: "24px",            /* Added standard padding just in case land-card styling needs a baseline layout */
                  borderRadius: "12px"        /* Clean matching border radius */
                }}
              >
                <div style={{ position: "absolute", top: 22, right: 22, width: 26, height: 26, borderRadius: "50%", background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: s.color, marginBottom: 18, opacity: 0.7 }}>{s.n}</div>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{s.icon}</div>
                <h3 style={{ fontFamily: "'Manrope',sans-serif", fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", marginBottom: 8 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FEATURES ══════════════════════════════════════ */}
      <section id="features" style={{ background: "#acc6e9", padding: "96px 32px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-block", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0f766e", background: "rgba(15,118,110,0.08)", padding: "5px 14px", borderRadius: 100, marginBottom: 16 }}>Features</div>
            <h2 style={{ fontFamily: "'Manrope',sans-serif", fontSize: "clamp(26px,4vw,42px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1.13, marginBottom: 16 }}>Built for the<br />agentic economy</h2>
            <p style={{ fontSize: 16, color: "#475569", lineHeight: 1.7, marginBottom: 28, maxWidth: 420, fontWeight: 500 }}>The only USDC payment infrastructure on Arc designed for AI agents, DAOs, and enterprise treasury operations.</p>
            <AppLink
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontFamily: "'Manrope',sans-serif", fontSize: 15, fontWeight: 700,
                color: "#fff", padding: "13px 26px", borderRadius: 10,
                background: "#0f766e", textDecoration: "none", transition: "all 0.2s",
                boxShadow: "0 4px 18px rgba(15,118,110,0.28)",
              }}
              onMouseEnter={(e: React.MouseEvent) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 10px 28px rgba(15,118,110,0.38)"; }}
              onMouseLeave={(e: React.MouseEvent) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "none"; el.style.boxShadow = "0 4px 18px rgba(15,118,110,0.28)"; }}
            >
              Start building <Arrow size={15} color="#fff" />
            </AppLink>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {[
              { title: "Batch Settlement", desc: "Send USDC to 500 wallets in a single transaction. Payroll, grants, airdrops.", tag: "v1", tc: "#0f766e" },
              { title: "Payment Streams",  desc: "Linear USDC vesting for payroll and contractor agreements. Cancel anytime.", tag: "v1", tc: "#0f766e" },
              { title: "Agent Registry",   desc: "Register AI wallets with USDC spending caps for autonomous agent commerce.", tag: "v1", tc: "#0f766e" },
              
            ].map(f => (
              <div key={f.title} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 14, cursor: "default", transition: "all 0.2s" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.07)"; el.style.transform = "translateX(4px)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "none"; el.style.transform = "none"; }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${f.tc}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: f.tc }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{f.title}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${f.tc}12`, color: f.tc }}>{f.tag}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ POWERED BY ════════════════════════════════════ */}
      <section style={{ background: "#fff", padding: "56px 32px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#94a3b8", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 28 }}>Powered by</p>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 48, flexWrap: "wrap" }}>
            {[["Arc Network","EVM L1"],["Circle USDC","Native gas"],["Hardhat","Contracts"],["wagmi + viem","Web3 frontend"],["Vercel","Deployment"]].map(([n,s]) => (
              <div key={n} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: "#0f172a", letterSpacing: "-0.02em" }}>{n}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ═══════════════════════════════════════════ */}
      <section id="faq" style={{ background: "#f8fafc", padding: "96px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ display: "inline-block", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0f766e", background: "rgba(15,118,110,0.08)", padding: "5px 14px", borderRadius: 100, marginBottom: 14 }}>FAQ</div>
            <h2 style={{ fontFamily: "'Manrope',sans-serif", fontSize: "clamp(26px,4vw,40px)", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>Frequently asked questions</h2>
          </div>
          <FAQItem q="What is Flux and who is it for?" a="Flux is a programmable USDC settlement layer on Arc — Circle's EVM-compatible L1 with native USDC gas. It's designed for AI agents, DAOs, enterprises, and payroll platforms that need to send USDC to many recipients cheaply and instantly. If you're moving money onchain, Flux is your settlement rail." />
          <FAQItem q="How does the 0.1% platform fee work?" a="When you call batchSettle(), Flux calculates 0.1% of the total USDC and adds it to the required approval. Settling $10,000 to 100 recipients costs a $10 platform fee. The fee accumulates in the contract and is withdrawable by the owner. Payment streams have no fee beyond minimal Arc gas." />
          <FAQItem q="What is an AI Agent in Flux and how does it work?" a="An Agent is any wallet registered by the owner with a USDC spending cap. Once registered and funded, that wallet autonomously calls agentPay(recipient, amount) without human approval. The contract enforces the budget cap and logs every payment as an onchain event — perfect for treasury bots and autonomous systems." />
          <FAQItem q="How do I get test USDC to try Flux on Arc testnet?" a="Go to faucet.circle.com and request test USDC for Arc testnet (Chain ID 5042002). If Arc isn't listed on the Circle faucet, check docs.arc.network for the current URL. You only need a small amount — a few test USDC is enough to run batch settlements and streams in development." />
        </div>
      </section>

      {/* ══ BOTTOM CTA — strong gradient as requested ═════ */}
      <section style={{
        padding: "100px 32px", textAlign: "center",
        background: "linear-gradient(145deg, #0f766e 0%, #0a5f59 35%, #0d4a6e 70%, #0a3d5c 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 800, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,255,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 560, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <h2 style={{ fontFamily: "'Manrope',sans-serif", fontSize: "clamp(28px,5vw,48px)", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>
            Ready to move money at the speed of code?
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.75)", marginBottom: 36, lineHeight: 1.65, fontWeight: 500 }}>
            Connect your wallet. Deploy in minutes. Start settling.
          </p>
          <AppLink
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              fontFamily: "'Manrope',sans-serif", fontSize: 16, fontWeight: 700,
              color: "#0f172a", padding: "15px 36px", borderRadius: 10,
              background: "#ffffff", textDecoration: "none", transition: "all 0.2s",
              boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            }}
            onMouseEnter={(e: React.MouseEvent) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 10px 36px rgba(0,0,0,0.35)"; }}
            onMouseLeave={(e: React.MouseEvent) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "none"; el.style.boxShadow = "0 4px 24px rgba(0,0,0,0.25)"; }}
          >
            Launch App <Arrow size={16} color="#0f172a" />
          </AppLink>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════ */}
      <footer style={{ background: "#0f172a", padding: "64px 32px 32px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <FluxMark size={30} />
                <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 17, color: "#f0f4fa", letterSpacing: "-0.03em" }}>Flux</span>
              </div>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, marginBottom: 14, maxWidth: 200, fontWeight: 500 }}>Programmable USDC payment rails on Arc. Built for AI agents and enterprises.</p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#14b8a6", background: "rgba(15,118,110,0.12)", border: "1px solid rgba(15,118,110,0.25)", padding: "4px 10px", borderRadius: 5 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#14b8a6" }} />
                Arc Testnet · Chain 5042002
              </div>
            </div>
            {[
              { title: "Product",   links: [{ l: "Batch Settlement", h: "/app/batch" }, { l: "Payment Streams", h: "/app/streams" }, { l: "Agent Registry", h: "/app/agents" }, { l: "Dashboard", h: "/app" }] },
              // CHANGED HERE: Updated to point to /docs
              { title: "Resources", links: [{ l: "Documentation", h: "/docs" }, { l: "ArcScan Explorer", h: "https://testnet.arcscan.app" }, { l: "Circle Faucet", h: "https://faucet.circle.com" }] },
              { title: "Ecosystem", links: [{ l: "Arc Network", h: "https://www.arc.network" }, { l: "Circle USDC", h: "https://www.circle.com" }] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569", marginBottom: 14 }}>{col.title}</div>
                {col.links.map(link => (
                  <Link 
                    key={link.l} 
                    href={link.h} 
                    // CHANGED HERE: Updated from .startsWith("/app") to .startsWith("/") so your loading screen works on /docs too
                    onClick={link.h.startsWith("/") ? triggerPageLoad : undefined} 
                    style={{ display: "block", fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 9, fontWeight: 500, transition: "color 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#64748b"; }}>
                    {link.l}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, color: "#334155", fontWeight: 500 }}>© 2026 Flux. Open source · MIT License</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#334155" }}>Built on Arc · Powered by Circle USDC</div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pingDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.8);}}
        @keyframes floatY{0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);}}
      `}</style>
    </div>
  );
}