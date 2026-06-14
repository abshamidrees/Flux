// lib/blockchain.ts
// Uses ArcScan (Blockscout) Etherscan-compatible API — instant indexed data
// NOTE: ArcScan only supports topic0_1_opr (not topic0_2_opr).
// StreamCreated/StreamCancelled filter client-side since sender is topic2.

const ARCSCAN = "https://testnet.arcscan.app/api";
const FLUX    = (process.env.NEXT_PUBLIC_FLUX_ADDRESS || "") as string;

// Keccak256 topic hashes (precomputed)
const TOPIC = {
  BatchSettled:    "0xca3c7dc392dcfaca15d8d7939e1a39afbc5af4b01f042a03c47229d813b20376",
  StreamCreated:   "0xbbec72eb7bd3974d4e8c1fc5132a9f2ba8a64a6c0d9cf90c39f4b3f7a899854f",
  StreamCancelled: "0xfeed183d9f143664e4ca27ca57080be96d765ab4bff9d02e3bb0a9b04e149c25",
  StreamWithdrawn:    "0xb8794a93ad70d58bd94788f8523cd8ebcff47f5541f8816ade60c636f1b57827",
  AgentRegistered:    "0x023c5efe572c42192271951adb0e77f97d7fc84bc761d026189ac08617346824",
  AgentPayment:       "0x7ab1062c7eaf9411dc76e1a6f5502f8b00b0c19da0277147bb9f4070d75755e5",
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
  txHash: string; status: "active" | "finished" | "cancelled" | "withdrawn";
  sender?: string; // only populated by fetchReceivedStreams — the OTHER party (the creator)
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
export async function fetchStreams(userAddress: string): Promise<StreamRecord[]> {
  const paddedSender = padAddress(userAddress);

  const [allCreated, allCancelled, allWithdrawn] = await Promise.all([
    fetchLogs({ topic0: TOPIC.StreamCreated }),
    fetchLogs({ topic0: TOPIC.StreamCancelled }),
    fetchLogs({ topic0: TOPIC.StreamWithdrawn }),
  ]);

  // Filter client-side: sender is topic2 for StreamCreated
  const created   = allCreated.filter(l => l.topics[2]?.toLowerCase() === paddedSender.toLowerCase());
  // sender is topic2 for StreamCancelled too
  const cancelled = allCancelled.filter(l => l.topics[2]?.toLowerCase() === paddedSender.toLowerCase());

  const cancelledIds = new Set(cancelled.map(l => BigInt(l.topics[1]).toString()));
  const createdIds   = new Set(created.map(l => BigInt(l.topics[1]).toString()));
  const withdrawnIds = new Set(
    allWithdrawn
      .filter(l => createdIds.has(BigInt(l.topics[1]).toString()))
      .map(l => BigInt(l.topics[1]).toString())
  );

  const order: Record<string, number> = { active: 0, finished: 1, withdrawn: 2, cancelled: 3 };
  const now = Date.now();

  const streams: StreamRecord[] = created.map(l => {
    const id        = BigInt(l.topics[1]);
    const recipient = "0x" + l.topics[3].slice(26);
    const amount    = hex64(l.data, 0);
    const startTime = hex64(l.data, 1);
    const endTime   = hex64(l.data, 2);
    const idStr     = id.toString();

    let status: StreamRecord["status"] = "active";
    if      (cancelledIds.has(idStr))  status = "cancelled";
    else if (withdrawnIds.has(idStr))  status = "withdrawn";

    return { id, recipient, amount, startTime, endTime, txHash: l.transactionHash, status };
  });

  const getDisplay = (s: StreamRecord) => {
    if (s.status === "cancelled" || s.status === "withdrawn") return s.status;
    if (Number(s.endTime) * 1000 < now) return "finished";
    return "active";
  };

  return streams.sort((a, b) => {
    const da = getDisplay(a), db = getDisplay(b);
    if (da !== db) return order[da] - order[db];
    return Number(b.id) - Number(a.id);
  });
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

  const [allCreated, allCancelled, allWithdrawn] = await Promise.all([
    fetchLogs({ topic0: TOPIC.StreamCreated }),
    fetchLogs({ topic0: TOPIC.StreamCancelled }),
    fetchLogs({ topic0: TOPIC.StreamWithdrawn }),
  ]);

  // topics[3] = recipient (indexed) for StreamCreated
  const received = allCreated.filter(l => l.topics[3]?.toLowerCase() === paddedRecipient.toLowerCase());

  const receivedIds = new Set(received.map(l => BigInt(l.topics[1]).toString()));
  const cancelledIds = new Set(
    allCancelled.filter(l => receivedIds.has(BigInt(l.topics[1]).toString()))
      .map(l => BigInt(l.topics[1]).toString())
  );
  const withdrawnIds = new Set(
    allWithdrawn.filter(l => receivedIds.has(BigInt(l.topics[1]).toString()))
      .map(l => BigInt(l.topics[1]).toString())
  );

  const order: Record<string, number> = { active: 0, finished: 1, withdrawn: 2, cancelled: 3 };
  const now = Date.now();

  const streams: StreamRecord[] = received.map(l => {
    const id        = BigInt(l.topics[1]);
    const sender    = "0x" + l.topics[2].slice(26);
    const amount    = hex64(l.data, 0);
    const startTime = hex64(l.data, 1);
    const endTime   = hex64(l.data, 2);
    const idStr     = id.toString();

    let status: StreamRecord["status"] = "active";
    if      (cancelledIds.has(idStr))  status = "cancelled";
    else if (withdrawnIds.has(idStr))  status = "withdrawn";

    return { id, recipient: userAddress, sender, amount, startTime, endTime, txHash: l.transactionHash, status };
  });

  const getDisplay = (s: StreamRecord) => {
    if (s.status === "cancelled" || s.status === "withdrawn") return s.status;
    if (Number(s.endTime) * 1000 < now) return "finished";
    return "active";
  };

  return streams.sort((a, b) => {
    const da = getDisplay(a), db = getDisplay(b);
    if (da !== db) return order[da] - order[db];
    return Number(b.id) - Number(a.id);
  });
}