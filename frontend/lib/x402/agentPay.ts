// lib/x402/agentPay.ts
// SERVER-ONLY. Takes a raw private key — never import this from a "use
// client" file, and never let a key reach the browser bundle.
//
// This is the client/payer half of Phase H4: an agent calls an
// x402-protected service, pays for it, and every payment is gated by
// FluxAgentRegistry. Built entirely on Circle's own tooling
// (@circle-fin/x402-batching/client's GatewayClient) — per Circle's own
// skill docs, hand-rolling the EIP-3009/EIP-712 signing here is explicitly
// out of bounds ("NEVER hand-roll signature/settlement logic"), and this
// doesn't: GatewayClient does the signing and settlement internally.
//
// Confirmed empirically against the SDK's own compiled types (not the doc
// site): GATEWAY_DOMAINS.arcTestnet === 26, and CHAIN_CONFIGS.arcTestnet
// resolves to the real Arc Testnet USDC address (matches this app's own
// canonical address exactly) plus real gatewayWallet/gatewayMinter
// contracts — Arc Testnet genuinely is a supported Gateway chain.
//
// IMPORTANT — read this before assuming these caps are bulletproof: this
// module gates spend on TWO separate hooks:
//   - onBeforePaymentCreation: reads FluxAgentRegistry.isPayable() and
//     aborts the payment BEFORE Circle signs anything if it would fail.
//   - onPaymentResponse: after the paid HTTP call actually completes,
//     ONLY if settleResponse.success is true (a real receipt, not an
//     assumption), calls recordExternalSpend() to book the spend on-chain
//     for the audit trail / dashboard.
// Both hooks run in THIS process, using the SAME key that can already sign
// Gateway payments. That is fundamentally different from recordPayment's
// enforcement (Part H3), where the registry contract itself moves the
// funds and a caller cannot simply skip the check. Here, the check is
// real and does run for any code that calls payViaAgent — but it is not
// trustless in the way on-chain enforcement is: nothing stops a different
// integration from signing a Gateway payment through GatewayClient
// directly, bypassing these hooks entirely. Surface this distinction
// honestly in the dashboard (Phase H5) rather than implying parity with
// recordPayment's guarantees.
//
// This file is the PAYER side only (agents paying for services). The
// SELLER side — Flux itself publishing x402-priced endpoints so agents pay
// Flux (Phase H6) — is a deliberate, explicit future item, not built here.
// Flux stays one-sided for now: agents pay for services, they don't sell
// them through Flux.
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, FLUX_AGENT_REGISTRY_ADDRESS, FLUX_AGENT_REGISTRY_ABI } from "../arc";

export interface AgentPayResult<T = unknown> {
  data: T;
  amount: bigint;
  formattedAmount: string;
  transaction: string;
}

export interface AgentPayParams {
  /** The FluxAgentRegistry agent ID — must already be registered with agentWallet == the address derived from privateKey. */
  agentId: bigint;
  /** Raw private key for the agent's EOA. Server-only; never expose to the browser. */
  privateKey: `0x${string}`;
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

/**
 * Pay for an x402-protected resource as a registered Flux agent, gated by
 * FluxAgentRegistry's caps/allowlist/blocklist/expiry/active-status.
 */
export async function payViaAgent<T = unknown>(params: AgentPayParams): Promise<AgentPayResult<T>> {
  if (!FLUX_AGENT_REGISTRY_ADDRESS) {
    throw new Error("FluxAgentRegistry not deployed (NEXT_PUBLIC_FLUX_AGENT_REGISTRY_ADDRESS unset)");
  }

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const account = privateKeyToAccount(params.privateKey);
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });

  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: params.privateKey });

  gateway.onBeforePaymentCreation(async (ctx) => {
    const amount = BigInt(ctx.selectedRequirements.amount);
    const to = ctx.selectedRequirements.payTo as `0x${string}`;
    const [ok, reason] = await publicClient.readContract({
      address: FLUX_AGENT_REGISTRY_ADDRESS,
      abi: FLUX_AGENT_REGISTRY_ABI,
      functionName: "isPayable",
      args: [params.agentId, to, amount],
    });
    if (!ok) return { abort: true, reason };
  });

  gateway.onPaymentResponse(async (ctx) => {
    // Only book a spend against a confirmed, successful settlement — never
    // on an assumption. If this hook throws, the payment already happened
    // (Circle's Gateway is the source of truth for that); it only means
    // Flux's own audit trail misses this one entry.
    if (!ctx.settleResponse?.success) return;
    const amount = BigInt(ctx.requirements.amount);
    const to = ctx.requirements.payTo as `0x${string}`;
    const hash = await walletClient.writeContract({
      address: FLUX_AGENT_REGISTRY_ADDRESS,
      abi: FLUX_AGENT_REGISTRY_ABI,
      functionName: "recordExternalSpend",
      args: [params.agentId, to, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  });

  const result = await gateway.pay<T>(params.url, { method: params.method, body: params.body });
  return { data: result.data, amount: result.amount, formattedAmount: result.formattedAmount, transaction: result.transaction };
}
