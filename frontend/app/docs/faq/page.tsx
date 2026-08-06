"use client";

import { H1, H2, P } from "../../../components/docs/DocsUI";
import { Breadcrumbs } from "../../../components/docs/Breadcrumbs";

function QA({ q, id, children }: { q: string; id: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <H2 id={id}>{q}</H2>
      {children}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx3)", marginTop: 36, marginBottom: 4 }}>
      {children}
    </div>
  );
}

export default function DocsFaqPage() {
  return (
    <div>
      <Breadcrumbs trail={[{ label: "Docs", href: "/" }, { label: "FAQ" }]} />
      <H1 id="faq">FAQ</H1>

      <GroupLabel>Getting started</GroupLabel>
      <QA id="which-network" q="What network is Flux actually on?">
        <P>Arc Testnet, Chain ID 5042002. It is not mainnet — do not send anything you consider real value.</P>
      </QA>
      <QA id="what-wallet" q="What wallet do I need?">
        <P>Any injected EVM wallet (MetaMask, Rabby) works, or you can log in with just an email via Privy, which creates an embedded wallet for you automatically.</P>
      </QA>
      <QA id="is-gas-usdc" q="Is gas paid in USDC?">
        <P>No — Arc&apos;s native gas token is a separate 18-decimal token from the 6-decimal USDC ERC-20 that Flux settles in, even though both track USD. You need a small balance of the native token to pay for any transaction; your USDC balance is unaffected by gas.</P>
      </QA>
      <QA id="get-test-usdc" q="Where do I get test USDC?">
        <P>faucet.circle.com — select Arc Testnet and request funds to your wallet address.</P>
      </QA>
      <QA id="history-storage" q="Where is my transaction history stored?">
        <P>Nowhere on your device. Every list in Flux — batches, streams, swaps — is reconstructed live from Arc itself each time you open the page. Open Flux on a different browser or device with the same wallet and everything is exactly where you left it.</P>
      </QA>

      <GroupLabel>Batch settlement</GroupLabel>
      <QA id="max-batch-size" q="What's the maximum batch size?">
        <P>500 recipients per transaction — enforced by the contract itself, not just the UI. There is no minimum beyond a positive amount per recipient.</P>
      </QA>
      <QA id="fee-separate" q="Do I pay the 0.1% fee as a separate transaction?">
        <P>No. The fee is added to the total you approve up front, so one approval and one settlement transaction cover everything — you&apos;re never asked to sign a third transaction just for the fee.</P>
      </QA>

      <GroupLabel>Payment streams</GroupLabel>
      <QA id="change-stream-dates" q="Can I change a stream's dates after creating it?">
        <P>No — start and end times are fixed at creation. There is no update function for an existing stream&apos;s schedule; if the terms need to change, cancel it and create a new one.</P>
      </QA>
      <QA id="withdraw-then-cancel" q="What happens if the recipient withdraws, then I cancel?">
        <P>The contract tracks exactly how much has already been released, so cancelling afterward only pays out the newly-vested portion since that withdrawal — the recipient is never paid twice, and you get back exactly the unvested remainder.</P>
      </QA>

      <GroupLabel>Agent registry</GroupLabel>
      <QA id="increase-budget-cap" q="Can I change an agent's caps after registering it?">
        <P>Yes — call <code>updateCaps()</code> with new per-transaction, daily, and total limits. Whatever the agent has already spent carries forward, so raising a cap just gives it more room above that.</P>
      </QA>
      <QA id="compromised-agent" q="How do I shut down a compromised agent immediately?">
        <P>Call <code>revoke()</code> — the kill switch. It takes effect instantly and permanently; the agent&apos;s next payment reverts, and it can never be reactivated. If you just want to pause it temporarily instead, use <code>pause()</code> and <code>resume()</code>.</P>
      </QA>

      <GroupLabel>Swap</GroupLabel>
      <QA id="why-no-quote" q="Why does a swap route show no quote?">
        <P>One of three reasons, always stated plainly on the row: the route has no liquidity for that specific pair, the route isn&apos;t configured yet, or the quote request timed out. Flux never substitutes a placeholder number for a route that isn&apos;t genuinely quoting.</P>
      </QA>
      <QA id="usyc-liquidity" q="Why can't I swap USYC right now?">
        <P>USYC&apos;s pools exist on-chain but currently hold no liquidity on the routes Flux has verified. The swap form will show &ldquo;No liquidity for this pair&rdquo; rather than a broken quote — this resolves automatically once a pool is funded, with no app update needed.</P>
      </QA>
      <QA id="typed-confirmation" q="Why did I have to type a phrase to confirm a swap?">
        <P>Above 15% price impact, Flux blocks the swap behind a typed confirmation (&ldquo;I will lose money&rdquo;) instead of a single click. It only appears for trades that would lose you a material amount of value to low liquidity — it is a safeguard, not friction for its own sake.</P>
      </QA>
      <QA id="limit-order-speed" q="How fast do limit orders fill?">
        <P>Not instantly. A limit order fills the next time a scheduled keeper checks open orders and finds one that clears its trigger — typically under a minute, not the same block. You can cancel anytime before it fills, including after expiry.</P>
      </QA>
    </div>
  );
}
