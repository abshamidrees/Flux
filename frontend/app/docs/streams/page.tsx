"use client";

import { H1, H2, P, CodeBlock, StatusPill, AddressLink } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";
import { FLUX_ADDRESS } from "../../../lib/arc";

export default function DocsStreamsPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/" }, { label: "Payment Streams" }]} />
      <H1 id="payment-streams">Payment Streams</H1>
      <P>Lock USDC in the Flux contract and release it linearly over time to a recipient. Used for payroll, contractor payments, token grants, and subscription billing.</P>

      <H2 id="mechanics">Mechanics</H2>
      <P>When you create a stream, the full USDC amount is locked in the contract immediately. The recipient can withdraw their vested share at any time. The formula is:</P>
      <CodeBlock>{`vested = totalAmount × (currentTime - startTime) / (endTime - startTime)`}</CodeBlock>

      <H2 id="stream-states">Stream states</H2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><StatusPill label="Active" tone="ready" /><span style={{ fontSize: 13, color: "var(--tx2)" }}>Stream is running. Recipient can withdraw vested amount anytime.</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><StatusPill label="Finished" tone="pending" /><span style={{ fontSize: 13, color: "var(--tx2)" }}>End date passed. Recipient can withdraw the full amount.</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><StatusPill label="Withdrawn" tone="pending" /><span style={{ fontSize: 13, color: "var(--tx2)" }}>Recipient has claimed all vested USDC.</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><StatusPill label="Cancelled" tone="pending" /><span style={{ fontSize: 13, color: "var(--tx2)" }}>Sender cancelled. Vested portion went to recipient; unvested returned to sender.</span></div>
      </div>

      <H2 id="creating-a-stream">Creating a stream</H2>
      <P>Fill in: recipient address, total USDC amount, start date, end date. The preview shows duration and daily release rate. You sign two transactions: approve USDC, then create the stream.</P>

      <H2 id="withdrawing">Withdrawing</H2>
      <P>Recipients enter the stream ID (visible in My Streams) and click Withdraw. The contract calculates exactly how much has vested and transfers it to the recipient&apos;s wallet instantly.</P>

      <H2 id="cancelling">Cancelling</H2>
      <P>Only the stream creator can cancel. On cancel: the vested amount transfers to the recipient immediately, and the unvested amount returns to the sender. The stream ID becomes permanently cancelled.</P>

      <H2 id="finding-stream-ids">Finding stream IDs</H2>
      <P>Go to Streams → My Streams. All streams you&apos;ve created are listed with their ID, status, amount, and dates. IDs are assigned by the contract sequentially, starting from 0.</P>

      <H2 id="contract">Contract</H2>
      <P>Streams are handled by <code>FluxSettlement.createStream()</code>, <code>withdrawFromStream()</code>, and <code>cancelStream()</code>. Full ABI and events are in the <a href="/reference" style={{ color: "var(--teal-l)" }}>Reference</a> page.</P>
      <P><AddressLink address={FLUX_ADDRESS || "0x0BBBc1C77ada4d584445383B77b88DDdDAae2F6A"} label="FluxSettlement on ArcScan" /></P>
    </div>
  );
}
