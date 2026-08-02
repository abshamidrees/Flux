"use client";

import { H1, H2, P, CodeBlock, Step, AddressLink } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";
import { FLUX_ADDRESS } from "../../../lib/arc";

export default function DocsBatchPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/" }, { label: "Batch Settlement" }]} />
      <H1 id="batch-settlement">Batch Settlement</H1>
      <P>Send USDC to up to 500 recipients in a single on-chain transaction. Flux batches all transfers into one contract call, charging a flat 0.1% platform fee on the total amount settled.</P>

      <H2 id="how-it-works">How it works</H2>
      <Step n={1} title="Add recipients">Upload a CSV with <code>address</code> and <code>amount</code> columns, or add wallets manually one by one.</Step>
      <Step n={2} title="Review summary">The right panel shows total recipients, total USDC, fee (0.1%), and the exact amount you need in your wallet.</Step>
      <Step n={3} title="Sign two transactions">First: approve USDC spending. Second: execute the batch. Your wallet shows both in sequence.</Step>
      <Step n={4} title="Confirmed on-chain">All payments land in the same block. View the transaction on ArcScan with a full token transfer breakdown.</Step>

      <H2 id="csv-format">CSV format</H2>
      <P>Your CSV must have exactly two columns: <code>address</code> and <code>amount</code>. Header names are case-insensitive.</P>
      <CodeBlock label="recipients.csv">{`address,amount
0x89e6c2...7216F6,0.23
0x1934b9...aD49D6,0.10
0xA2b255...EC2a7a,0.15`}</CodeBlock>

      <H2 id="fee-structure">Fee structure</H2>
      <P>Flux charges 0.1% of the total USDC settled per batch. The fee is deducted automatically from the total you approve — you only sign once for the full amount including the fee.</P>
      <CodeBlock label="Example">{`Total USDC to send:  $7.20
Fee (0.1%):          $0.0072
Total you approve:   $7.2072`}</CodeBlock>

      <H2 id="limits">Limits</H2>
      <P>Up to 500 recipients per batch. Minimum amount per recipient: any positive value. There is no maximum per batch — the gas limit is set dynamically based on recipient count.</P>
      <CodeBlock label="Gas limit formula">{`gasLimit = 80,000 + (recipients.length × 65,000)`}</CodeBlock>

      <H2 id="history">History</H2>
      <P>The History tab loads all your past batch settlements live from the blockchain — no cache, no local storage. Every settled batch shows timestamp, recipient count, total USDC, fee, and a link to the ArcScan transaction. You can export your full history as a CSV.</P>

      <H2 id="contract">Contract</H2>
      <P>Batch settlement is handled by <code>FluxSettlement.batchSettle()</code>. Full ABI and events are in the <a href="/reference" style={{ color: "var(--teal-l)" }}>Reference</a> page.</P>
      <P><AddressLink address={FLUX_ADDRESS || "0x0BBBc1C77ada4d584445383B77b88DDdDAae2F6A"} label="FluxSettlement on ArcScan" /></P>
    </div>
  );
}
