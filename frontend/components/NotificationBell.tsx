"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { fetchStreams } from "../lib/blockchain";
import { explorerLink, formatUSDC } from "../lib/arc";

interface Announcement {
  id: string; title: string; message: string; date: string; type: "info" | "warn" | "success";
}

interface ReceivedStream {
  id: bigint; sender: string; amount: bigint; startTime: bigint; endTime: bigint; txHash: string;
}

// ── Fetch streams where user is RECIPIENT (topic3) ────────────────────────
async function fetchReceivedStreams(recipientAddress: string): Promise<ReceivedStream[]> {
  const ARCSCAN   = "https://testnet.arcscan.app/api";
  const FLUX      = process.env.NEXT_PUBLIC_FLUX_ADDRESS || "";
  const TOPIC_SC  = "0xbbec72eb7bd3974d4e8c1fc5132a9f2ba8a64a6c0d9cf90c39f4b3f7a899854f"; // StreamCreated
  const padded    = "0x000000000000000000000000" + recipientAddress.toLowerCase().replace("0x","");
  const NO_RESULT = ["no records found","no logs found","no transactions found","result not found"];

  const url = new URL(ARCSCAN);
  url.searchParams.set("module","logs"); url.searchParams.set("action","getLogs");
  url.searchParams.set("address",FLUX);  url.searchParams.set("fromBlock","0");
  url.searchParams.set("toBlock","latest");
  url.searchParams.set("topic0", TOPIC_SC);
  // topic3 = recipient (indexed) — filter by it
  url.searchParams.set("topic3", padded);
  url.searchParams.set("topic0_3_opr","and");

  const res  = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (json.status === "0") {
    const msg = (json.message||"").toLowerCase();
    if (NO_RESULT.some(n => msg.includes(n))) return [];
    // Fallback: fetch all and filter client-side
    return fetchReceivedStreamsClientFilter(recipientAddress);
  }

  const hex64 = (data: string, i: number) => {
    const clean = data.startsWith("0x") ? data.slice(2) : data;
    const word  = clean.slice(i*64,(i+1)*64);
    return word ? BigInt("0x"+word) : 0n;
  };

  return (json.result as any[]).map(l => ({
    id:        BigInt(l.topics[1]),
    sender:    "0x" + l.topics[2].slice(26),
    amount:    hex64(l.data, 0),
    startTime: hex64(l.data, 1),
    endTime:   hex64(l.data, 2),
    txHash:    l.transactionHash,
  }));
}

// Fallback: fetch all StreamCreated and filter by recipient client-side
async function fetchReceivedStreamsClientFilter(recipientAddress: string): Promise<ReceivedStream[]> {
  const ARCSCAN  = "https://testnet.arcscan.app/api";
  const FLUX     = process.env.NEXT_PUBLIC_FLUX_ADDRESS || "";
  const TOPIC_SC = "0xbbec72eb7bd3974d4e8c1fc5132a9f2ba8a64a6c0d9cf90c39f4b3f7a899854f";
  const padded   = ("0x000000000000000000000000" + recipientAddress.toLowerCase().replace("0x","")).toLowerCase();
  const NO_RESULT = ["no records found","no logs found","no transactions found","result not found"];

  const url = new URL(ARCSCAN);
  url.searchParams.set("module","logs"); url.searchParams.set("action","getLogs");
  url.searchParams.set("address",FLUX);  url.searchParams.set("fromBlock","0");
  url.searchParams.set("toBlock","latest"); url.searchParams.set("topic0",TOPIC_SC);
  const res  = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (json.status === "0") { const m=(json.message||"").toLowerCase(); if(NO_RESULT.some(n=>m.includes(n))) return []; return []; }

  const hex64 = (data: string, i: number) => {
    const clean = data.startsWith("0x") ? data.slice(2) : data;
    const word  = clean.slice(i*64,(i+1)*64);
    return word ? BigInt("0x"+word) : 0n;
  };

  return (json.result as any[])
    .filter(l => l.topics[3]?.toLowerCase() === padded)
    .map(l => ({
      id:        BigInt(l.topics[1]),
      sender:    "0x" + l.topics[2].slice(26),
      amount:    hex64(l.data, 0),
      startTime: hex64(l.data, 1),
      endTime:   hex64(l.data, 2),
      txHash:    l.transactionHash,
    }));
}

const SEEN_KEY  = "flux_seen_notif";
const getSeen   = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)||"[]")); } catch { return new Set(); } };
const markSeen  = (ids: string[]) => { try { const s=getSeen(); ids.forEach(i=>s.add(i)); localStorage.setItem(SEEN_KEY,JSON.stringify([...s])); } catch {} };

export function NotificationBell() {
  const { address } = useAccount();
  const [open,        setOpen]        = useState(false);
  const [streams,     setStreams]      = useState<ReceivedStream[]>([]);
  const [announces,   setAnnounces]   = useState<Announcement[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Load announcements
      const r = await fetch("/announcements.json");
      const anns: Announcement[] = r.ok ? await r.json() : [];
      setAnnounces(anns);

      // Load received streams
      const received = address ? await fetchReceivedStreams(address) : [];
      setStreams(received);

      // Compute unread
      const seen = getSeen();
      const annIds = anns.map(a => `ann-${a.id}`);
      const strIds = received.map(s => `str-${s.id.toString()}`);
      const unseen = [...annIds, ...strIds].filter(id => !seen.has(id));
      setUnreadCount(unseen.length);
    } catch {}
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(v => !v);
    // Mark everything as seen
    const annIds = announces.map(a => `ann-${a.id}`);
    const strIds = streams.map(s => `str-${s.id.toString()}`);
    markSeen([...annIds, ...strIds]);
    setUnreadCount(0);
  };

  const typeColor = (t: string) => t==="warn"?"#f59e0b":t==="success"?"#10b981":"var(--teal)";

  return (
    <div ref={ref} style={{ position:"relative" }}>
      {/* Bell button */}
      <button onClick={handleOpen} style={{ position:"relative", width:36, height:36, borderRadius:9, background:"var(--bg3)", border:"1px solid var(--bdr)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all 0.15s" }}
        onMouseEnter={e=>(e.currentTarget.style.borderColor="var(--bdr2)")}
        onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--bdr)")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position:"absolute", top:-4, right:-4, minWidth:16, height:16, borderRadius:999, background:"var(--teal)", color:"var(--bg)", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", fontFamily:"'IBM Plex Mono',monospace", border:"2px solid var(--bg)" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:320, background:"var(--bg2)", border:"1px solid var(--bdr2)", borderRadius:12, boxShadow:"0 12px 36px rgba(0,0,0,0.5)", zIndex:1000, overflow:"hidden" }}>
          <div style={{ padding:"13px 16px 11px", borderBottom:"1px solid var(--bdr)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:"'Manrope',sans-serif", fontWeight:800, fontSize:13, color:"var(--tx)" }}>Notifications</span>
            <button onClick={loadAll} disabled={loading} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"'Manrope',sans-serif", fontSize:11, color:"var(--teal)", fontWeight:600 }}>{loading?"Loading…":"↻ Refresh"}</button>
          </div>

          <div style={{ maxHeight:380, overflowY:"auto" }}>
            {/* Announcements */}
            {announces.map(a => (
              <div key={a.id} style={{ padding:"13px 16px", borderBottom:"1px solid var(--bdr)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:typeColor(a.type), flexShrink:0 }} />
                  <span style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:12, color:"var(--tx)" }}>{a.title}</span>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--tx3)", marginLeft:"auto" }}>{a.date}</span>
                </div>
                <p style={{ fontSize:12, color:"var(--tx2)", lineHeight:1.55, fontWeight:500, margin:0 }}>{a.message}</p>
              </div>
            ))}

            {/* Received streams */}
            {streams.length > 0 && (
              <div style={{ padding:"10px 16px 6px", borderBottom:"1px solid var(--bdr)" }}>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, fontWeight:700, color:"var(--tx3)", letterSpacing:"0.06em", marginBottom:8 }}>STREAMS RECEIVED</div>
                {streams.map((s,i) => (
                  <div key={i} style={{ padding:"10px 0", borderBottom: i<streams.length-1?"1px solid var(--bdr)":"none" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <span className="chip chip-teal" style={{ fontSize:9, padding:"1px 6px" }}>#{s.id.toString()}</span>
                        <span style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:13, color:"var(--teal)" }}>${formatUSDC(s.amount)} USDC</span>
                      </div>
                      <a href={explorerLink("tx",s.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--teal)" }}>↗</a>
                    </div>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--tx3)", marginBottom:2 }}>
                      From: {s.sender.slice(0,8)}…{s.sender.slice(-6)}
                    </div>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--tx3)" }}>
                      {new Date(Number(s.startTime)*1000).toLocaleDateString()} → {new Date(Number(s.endTime)*1000).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {announces.length===0 && streams.length===0 && (
              <div style={{ padding:"32px 16px", textAlign:"center", color:"var(--tx3)", fontSize:13 }}>No notifications yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}