import React from "react";
function H1({ c }: { c: React.ReactNode }) { return <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:28, fontWeight:800, color:"var(--tx)", letterSpacing:"-0.03em", marginBottom:10, marginTop:0 }}>{c}</h1>; }
function H2({ c }: { c: React.ReactNode }) { return <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize:18, fontWeight:800, color:"var(--tx)", marginTop:36, marginBottom:8 }}>{c}</h2>; }
function P({ c }: { c: React.ReactNode }) { return <p style={{ fontSize:14, color:"var(--tx2)", lineHeight:1.75, fontWeight:500, marginBottom:14 }}>{c}</p>; }
function Pre({ c }: { c: string }) { return <pre style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, background:"var(--bg2)", border:"1px solid var(--bdr)", borderRadius:10, padding:"16px 18px", color:"var(--tx2)", lineHeight:1.65, overflowX:"auto", marginBottom:18 }}>{c}</pre>; }
function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div style={{ display:"flex", gap:14, marginBottom:18 }}>
      <div style={{ width:28, height:28, borderRadius:"50%", background:"var(--teal-10)", border:"1px solid var(--teal-20)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700, color:"var(--teal)" }}>{n}</div>
      <div><div style={{ fontFamily:"'Manrope',sans-serif", fontWeight:700, fontSize:14, color:"var(--tx)", marginBottom:3 }}>{title}</div><div style={{ fontSize:13, color:"var(--tx2)", lineHeight:1.6, fontWeight:500 }}>{desc}</div></div>
    </div>
  );
}

export default function DocsBatchPage() {
  return (
    <div>
      <H1 c="Batch Settlement" />
      <P c="Send USDC to up to 500 recipients in a single on-chain transaction. Flux batches all transfers into one contract call, charging a flat 0.1% platform fee on the total amount settled." />

      <H2 c="How it works" />
      <Step n={1} title="Add recipients" desc="Upload a CSV with 'address' and 'amount' columns, or add wallets manually one by one." />
      <Step n={2} title="Review summary" desc="The right panel shows total recipients, total USDC, fee (0.1%), and the exact amount you need in your wallet." />
      <Step n={3} title="Sign two transactions" desc="First: approve USDC spending. Second: execute the batch. MetaMask shows both in sequence." />
      <Step n={4} title="Confirmed on-chain" desc="All payments land in the same block. View the transaction on ArcScan with a full token transfer breakdown." />

      <H2 c="CSV format" />
      <P c="Your CSV must have exactly two columns: address and amount. Header names are case-insensitive." />
      <Pre c={`address,amount\n0x89e6c2...7216F6,0.23\n0x1934b9...aD49D6,0.10\n0xA2b255...EC2a7a,0.15`} />

      <H2 c="Fee structure" />
      <P c="Flux charges 0.1% of the total USDC settled per batch. The fee is deducted automatically from the total you approve — you only sign once for the full amount including the fee." />
      <Pre c={`Total USDC to send:  $7.20\nFee (0.1%):          $0.0072\nTotal you approve:   $7.2072`} />

      <H2 c="Limits" />
      <P c="Up to 500 recipients per batch. Minimum amount per recipient: any positive value. There is no maximum per batch — the gas limit is set dynamically based on recipient count (80,000 base + 65,000 per recipient)." />

      <H2 c="History" />
      <P c="The History tab loads all your past batch settlements live from the blockchain — no cache, no localStorage. Every settled batch shows: timestamp, recipient count, total USDC, fee, and a link to the ArcScan transaction. You can also export your full history as a CSV." />
    </div>
  );
}
