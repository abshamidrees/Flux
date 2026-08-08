// lib/blockchain.ts
// Uses ArcScan (Blockscout) Etherscan-compatible API — instant indexed data
// NOTE: ArcScan only supports topic0_1_opr (not topic0_2_opr).
// StreamCreated/StreamCancelled filter client-side since sender is topic2.

const ARCSCAN = "https://testnet.arcscan.app/api";
const FLUX    = (process.env.NEXT_PUBLIC_FLUX_ADDRESS || "") as string;
const FLUX_AGENT_REGISTRY = (process.env.NEXT_PUBLIC_FLUX_AGENT_REGISTRY_ADDRESS || "") as string;

// Keccak256 topic hashes (precomputed)
const TOPIC = {
  BatchSettled:    "0xca3c7dc392dcfaca15d8d7939e1a39afbc5af4b01f042a03c47229d813b20376",
  StreamCreated:   "0xbbec72eb7bd3974d4e8c1fc5132a9f2ba8a64a6c0d9cf90c39f4b3f7a899854f",
  StreamCancelled: "0xfeed183d9f143664e4ca27ca57080be96d765ab4bff9d02e3bb0a9b04e149c25",
  StreamWithdrawn:    "0xb8794a93ad70d58bd94788f8523cd8ebcff47f5541f8816ade60c636f1b57827",
  AgentRegistered:    "0x023c5efe572c42192271951adb0e77f97d7fc84bc761d026189ac08617346824",
  AgentPayment:       "0x7ab1062c7eaf9411dc76e1a6f5502f8b00b0c19da0277147bb9f4070d75755e5",
} as const;

// FluxAgentRegistry (Phase H3) event topics — computed via
// keccak256(toHex("EventName(type,type,...)")) against the real contract
// ABI, not hand-transcribed. Distinct from FLuxSettlement's own (differently
// shaped) AgentRegistered/AgentPayment events above — same event names,
// different contracts, different signatures, different topic0 hashes.
const REGISTRY_TOPIC = {
  AgentRegistered:       "0x01d632321f06a9f7bd0c4656af37870504ba6f91baca523986e932ff08d17881",
  CapsUpdated:           "0x7ecda6a3349e60994b84106c9fa5d732011ca844e035ff52642190b0c748b21f",
  AgentPaused:           "0x5561eb580af870fbf8b9a0506a6ebe92e64c9182edba8560cac1bab55b908a94",
  AgentResumed:          "0x62637348b7e22ec324516e93125a967308efd1559b84d505bf18e582255b2053",
  AgentRevoked:          "0xfff7a38bd0a2d198492b996b82c6bd083b224b0f43294f8a62fa6085f4d24ba4",
  RecipientListUpdated:  "0xfa8f2f5e794bcb3c8049bf70f02c03aeebb1910a4e7c0dffc99d6fb5f803718f",
  AllowlistModeSet:      "0x3555b6d98fd770d33564c66dc93a6a6a858762c5a8c063aad353295b431632bf",
  AgentPayment:          "0x934dc4ea117b9006fee63b6f5c9c57253b2fd83b0a6a09d6a0311209e1162a15",
} as const;

function padAddress(addr: string): string {
  return "0x000000000000000000000000" + addr.toLowerCase().replace("0x", "");
}

interface ArcLog {
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
  timeStamp: string;
}

// All messages that mean "no results" (ArcScan varies)
const NO_RESULTS = ["no records found", "no logs found", "no transactions found", "result not found"];

async function fetchLogs(params: Record<string, string>): Promise<ArcLog[]> {
  const url = new URL(ARCSCAN);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", FLUX);
  url.searchParams.set("fromBlock", "0");
  url.searchParams.set("toBlock", "latest");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`ArcScan HTTP ${res.status}`);
  const json = await res.json();
  // Treat any "no results" variant as empty — not an error
  if (json.status === "0") {
    const msg = (json.message || "").toLowerCase();
    if (NO_RESULTS.some(n => msg.includes(n))) return [];
    throw new Error(json.message || "ArcScan API error");
  }
  return (json.result as ArcLog[]) || [];
}

// Same shape as fetchLogs, targeting FluxAgentRegistry's address instead of
// FluxSettlement's — a separate contract (Phase H3), so it needs its own
// query target even though the ArcScan call shape is identical.
async function fetchRegistryLogs(params: Record<string, string>): Promise<ArcLog[]> {
  const url = new URL(ARCSCAN);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", FLUX_AGENT_REGISTRY);
  url.searchParams.set("fromBlock", "0");
  url.searchParams.set("toBlock", "latest");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`ArcScan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === "0") {
    const msg = (json.message || "").toLowerCase();
    if (NO_RESULTS.some(n => msg.includes(n))) return [];
    throw new Error(json.message || "ArcScan API error");
  }
  return (json.result as ArcLog[]) || [];
}

function hex64(data: string, wordIndex: number): bigint {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  const word = clean.slice(wordIndex * 64, (wordIndex + 1) * 64);
  return word ? BigInt("0x" + word) : 0n;
}

// ── Public types ──────────────────────────────────────────
export interface BatchRecord {
  count: bigint; totalUSDC: bigint; fee: bigint;
  timestamp: bigint; txHash: string;
}

export interface StreamRecord {
  id: bigint; recipient: string; amount: bigint;
  startTime: bigint; endTime: bigint;
  txHash: string;
  sender?: string; // only populated by fetchReceivedStreams — the OTHER party (the creator)
}

// ── Protocol-wide totals ────────────────────────────────────
// Unfiltered (no sender/recipient match) — every StreamCreated log ever
// emitted, summed. Real, on-chain, and genuinely protocol-wide: streams are
// created directly on Flux's own contract, unlike swaps (which execute
// against third-party routers Flux doesn't own, so a true protocol-wide swap
// total isn't computable from on-chain data alone).
export async function fetchTotalStreamedVolume(): Promise<bigint> {
  const logs = await fetchLogs({ topic0: TOPIC.StreamCreated });
  return logs.reduce((sum, l) => sum + hex64(l.data, 0), 0n);
}

// ── Batch history ─────────────────────────────────────────
// BatchSettled: topic0=hash, topic1=sender (indexed) → use topic0_1_opr=and
export async function fetchBatchHistory(userAddress: string): Promise<BatchRecord[]> {
  const logs = await fetchLogs({
    topic0: TOPIC.BatchSettled,
    topic1: padAddress(userAddress),
    topic0_1_opr: "and",
  });

  return logs
    .map(l => ({
      count:     hex64(l.data, 0),
      totalUSDC: hex64(l.data, 1),
      fee:       hex64(l.data, 2),
      timestamp: hex64(l.data, 3),
      txHash:    l.transactionHash,
    }))
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

// ── Streams ───────────────────────────────────────────────
// StreamCreated: topic0=hash, topic1=id, topic2=sender, topic3=recipient
// ArcScan only supports topic0_1_opr → fetch all, filter client-side by topic2
// Discovery only — who created what, for whom, how much, over what window.
// This is immutable creation-time data, safe to reconstruct from the
// StreamCreated event alone. Current state (released/claimable/cancelled)
// changes after creation and must come from a live contract read
// (hooks/useStreamLiveState.ts), never from replaying StreamWithdrawn
// events — see that hook's header comment for why.
export async function fetchStreams(userAddress: string): Promise<StreamRecord[]> {
  const paddedSender = padAddress(userAddress);

  const allCreated = await fetchLogs({ topic0: TOPIC.StreamCreated });
  // Filter client-side: sender is topic2 for StreamCreated
  const created = allCreated.filter(l => l.topics[2]?.toLowerCase() === paddedSender.toLowerCase());

  const streams: StreamRecord[] = created.map(l => ({
    id:        BigInt(l.topics[1]),
    recipient: "0x" + l.topics[3].slice(26),
    amount:    hex64(l.data, 0),
    startTime: hex64(l.data, 1),
    endTime:   hex64(l.data, 2),
    txHash:    l.transactionHash,
  }));

  return streams.sort((a, b) => Number(b.id) - Number(a.id));
}

// ── Agent activity ────────────────────────────────────────
export interface AgentActivity {
  type: "registered" | "payment";
  agent: string;
  label?: string;
  amount: bigint;
  txHash: string;
}

export async function fetchAgentActivity(): Promise<AgentActivity[]> {
  const [registered, payments] = await Promise.all([
    fetchLogs({ topic0: TOPIC.AgentRegistered }),
    fetchLogs({ topic0: TOPIC.AgentPayment }),
  ]);

  const regItems: AgentActivity[] = registered.map(l => ({
    type: "registered" as const,
    agent: "0x" + l.topics[1].slice(26),
    amount: hex64(l.data, 1), // budgetCap
    txHash: l.transactionHash,
  }));

  const payItems: AgentActivity[] = payments.map(l => ({
    type: "payment" as const,
    agent: "0x" + l.topics[1].slice(26),
    amount: hex64(l.data, 0),
    txHash: l.transactionHash,
  }));

  return [...regItems, ...payItems];
}

// ── Received streams (where the user is RECIPIENT, not creator) ──────────
// Used so a recipient can find and withdraw streams created FOR them.
export async function fetchReceivedStreams(userAddress: string): Promise<StreamRecord[]> {
  const paddedRecipient = padAddress(userAddress);

  const allCreated = await fetchLogs({ topic0: TOPIC.StreamCreated });
  // topics[3] = recipient (indexed) for StreamCreated
  const received = allCreated.filter(l => l.topics[3]?.toLowerCase() === paddedRecipient.toLowerCase());

  const streams: StreamRecord[] = received.map(l => ({
    id:        BigInt(l.topics[1]),
    sender:    "0x" + l.topics[2].slice(26),
    recipient: userAddress,
    amount:    hex64(l.data, 0),
    startTime: hex64(l.data, 1),
    endTime:   hex64(l.data, 2),
    txHash:    l.transactionHash,
  }));

  return streams.sort((a, b) => Number(b.id) - Number(a.id));
}

// ── Agent Registry (Phase H3/H5) ────────────────────────────
export interface RegistryAgentSummary {
  agentId: bigint;
  owner: string;
  agentWallet: string;
  perTxCap: bigint;
  dailyCap: bigint;
  totalCap: bigint;
  expiry: bigint;
  txHash: string;
}

// AgentRegistered: topic0=hash, topic1=agentId, topic2=owner, topic3=agentWallet
// (all three indexed) — owner filtering happens client-side, same limitation
// as fetchStreams above (ArcScan only supports topic0_1_opr, not topic0_2_opr).
// Only gives the REGISTRATION-time snapshot; current live state (status,
// spentToday, etc.) is read fresh from getAgent() by the dashboard, not
// reconstructed from this event.
export async function fetchMyAgents(ownerAddress: string): Promise<RegistryAgentSummary[]> {
  if (!FLUX_AGENT_REGISTRY) return [];
  const paddedOwner = padAddress(ownerAddress);
  const logs = await fetchRegistryLogs({ topic0: REGISTRY_TOPIC.AgentRegistered });
  return logs
    .filter(l => l.topics[2]?.toLowerCase() === paddedOwner.toLowerCase())
    .map(l => ({
      agentId:     BigInt(l.topics[1]),
      owner:       "0x" + l.topics[2].slice(26),
      agentWallet: "0x" + l.topics[3].slice(26),
      perTxCap:    hex64(l.data, 0),
      dailyCap:    hex64(l.data, 1),
      totalCap:    hex64(l.data, 2),
      expiry:      hex64(l.data, 3),
      txHash:      l.transactionHash,
    }))
    .sort((a, b) => Number(b.agentId) - Number(a.agentId));
}

export interface AgentPaymentRecord {
  agentId: bigint;
  to: string;
  amount: bigint;
  spentToday: bigint;
  spentTotal: bigint;
  txHash: string;
  blockNumber: bigint;
  timestamp: bigint;
}

// AgentPayment: topic0=hash, topic1=agentId, topic2=to (indexed);
// data = amount, spentToday, spentTotal (non-indexed). Emitted identically
// by both recordPayment (on-chain, trustlessly enforced) and
// recordExternalSpend (x402/Gateway, audit-only) — see FluxAgentRegistry.sol
// — so this feed can't itself distinguish the two paths from the log alone.
export async function fetchAgentPayments(agentIds?: bigint[]): Promise<AgentPaymentRecord[]> {
  if (!FLUX_AGENT_REGISTRY) return [];
  const logs = await fetchRegistryLogs({ topic0: REGISTRY_TOPIC.AgentPayment });
  const idSet = agentIds ? new Set(agentIds.map(String)) : null;
  return logs
    .filter(l => !idSet || idSet.has(BigInt(l.topics[1]).toString()))
    .map(l => ({
      agentId:     BigInt(l.topics[1]),
      to:          "0x" + l.topics[2].slice(26),
      amount:      hex64(l.data, 0),
      spentToday:  hex64(l.data, 1),
      spentTotal:  hex64(l.data, 2),
      txHash:      l.transactionHash,
      blockNumber: BigInt(l.blockNumber),
      timestamp:   BigInt(l.timeStamp),
    }))
    .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
}