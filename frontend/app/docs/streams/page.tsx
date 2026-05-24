import React from "react";
function H1({ c }: { c: React.ReactNode }) { return <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:28, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:10, marginTop:0 }}>{c}</h1>; }
function H2({ c }: { c: React.ReactNode }) { return <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize:18, fontWeight:800, color:"var(--tx)", marginTop:36, marginBottom:8 }}>{c}</h2>; }
function P({ c }: { c: React.ReactNode }) { return <p style={{ fontSize:14, color:"var(--tx2)", lineHeight:1.75, fontWeight:500, marginBottom:14 }}>{c}</p>; }
function Pre({ c }: { c: string }) { return <pre style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, background:"var(--bg2)", border:"1px solid var(--bdr)", borderRadius:10, padding:"16px 18px", color:"var(--tx2)", lineHeight:1.65, overflowX:"auto", marginBottom:18 }}>{c}</pre>; }
function Pill({ label, color }: { label: string; color: string }) {
  return <span style={{ background:`${color}15`, border:`1px solid ${color}30`, borderRadius:999, padding:"2px 10px", fontSize:11, fontWeight:700, color, marginRight:6 }}>{label}</span>;
}

export default function DocsStreamsPage() {
  return (
    <div>
      <H1 c="Payment Streams" />
      <P c="Lock USDC in the Flux contract and release it linearly over time to a recipient. Used for payroll, contractor payments, token grants, and subscription billing." />

      <H2 c="Mechanics" />
      <P c="When you create a stream, the full USDC amount is locked in the contract immediately. The recipient can withdraw their vested share at any time. The formula is:" />
      <Pre c={`vested = totalAmount × (currentTime - startTime) / (endTime - startTime)`} />

      <H2 c="Stream states" />
      <div style={{ marginBottom:18 }}>
        <div style={{ marginBottom:8 }}><Pill label="● Active" color="#14b8a6" />Stream is running. Recipient can withdraw vested amount anytime.</div>
        <div style={{ marginBottom:8 }}><Pill label="✓ Finished" color="#94a3b8" />End date passed. Recipient can withdraw full amount.</div>
        <div style={{ marginBottom:8 }}><Pill label="↓ Withdrawn" color="#a78bfa" />Recipient has claimed all vested USDC.</div>
        <div style={{ marginBottom:8 }}><Pill label="✕ Cancelled" color="#f87171" />Sender cancelled. Vested portion went to recipient; unvested returned to sender.</div>
      </div>

      <H2 c="Creating a stream" />
      <P c="Fill in: recipient address, total USDC amount, start date, end date. The preview shows duration and daily release rate. You sign two transactions: approve USDC, then create stream." />

      <H2 c="Withdrawing" />
      <P c="Recipients enter the stream ID (visible in My Streams) and click Withdraw. The contract calculates exactly how much has vested and transfers it to the recipient's wallet instantly." />

      <H2 c="Cancelling" />
      <P c="Only the stream creator can cancel. On cancel: the vested amount transfers to the recipient immediately, and the unvested amount returns to the sender. The stream ID becomes permanently cancelled." />

      <H2 c="Finding stream IDs" />
      <P c="Go to Streams → My Streams tab. All streams you've created are listed with their ID, status, amount, and dates. IDs are assigned by the contract sequentially starting from 0." />
    </div>
  );
}
