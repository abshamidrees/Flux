// lib/blockchain.ts
// ── ArcScan (Blockscout) API — instant indexed data, no block scanning ──
// Used by: batch history, streams, agent activity

const ARCSCAN = "https://testnet.arcscan.app/api";
const FLUX    = (process.env.NEXT_PUBLIC_FLUX_ADDRESS || "") as string;

// ── Keccak256 topic hashes (precomputed) ──
const TOPIC = {
  BatchSettled:    "0xca3c7dc392dcfaca15d8d7939e1a39afbc5af4b01f042a03c47229d813b20376",
  StreamCreated:   "0xbbec72eb7bd3974d4e8c1fc5132a9f2ba8a64a6c0d9cf90c39f4b3f7a899854f",
  StreamCancelled: "0xfeed183d9f143664e4ca27ca57080be96d765ab4bff9d02e3bb0a9b04e149c25",
  StreamWithdrawn: "0xb8794a93ad70d58bd94788f8523cd8ebcff47f5541f8816ade60c636f1b57827",
} as const;

// Pad an address to 32-byte topic format
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
  // status "0" with message "No records found" is fine — return []
  if (json.status === "0" && json.message === "No records found") return [];
  if (json.status !== "1") throw new Error(json.message || "ArcScan error");
  return (json.result as ArcLog[]) || [];
}

// ── Decode helpers ──
function hex64(data: string, wordIndex: number): bigint {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  const word = clean.slice(wordIndex * 64, (wordIndex + 1) * 64);
  return word ? BigInt("0x" + word) : 0n;
}

// ── Public API ──

export interface BatchRecord {
  count: bigint; totalUSDC: bigint; fee: bigint;
  timestamp: bigint; txHash: string;
}

export interface StreamRecord {
  id: bigint; recipient: string; amount: bigint;
  startTime: bigint; endTime: bigint;
  txHash: string; status: "active"|"finished"|"cancelled"|"withdrawn";
}

export async function fetchBatchHistory(userAddress: string): Promise<BatchRecord[]> {
  // topic0 = BatchSettled, topic1 = sender (indexed)
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

export async function fetchStreams(userAddress: string): Promise<StreamRecord[]> {
  // Fetch created, cancelled, withdrawn in parallel — all instant from ArcScan index
  const [created, cancelled, withdrawn] = await Promise.all([
    fetchLogs({ topic0: TOPIC.StreamCreated,   topic2: padAddress(userAddress), topic0_2_opr: "and" }),
    fetchLogs({ topic0: TOPIC.StreamCancelled, topic2: padAddress(userAddress), topic0_2_opr: "and" }),
    fetchLogs({ topic0: TOPIC.StreamWithdrawn }),
  ]);

  const cancelledIds = new Set(cancelled.map(l => BigInt(l.topics[1]).toString()));

  // For withdrawn, cross-ref with stream IDs from created
  const createdIds   = new Set(created.map(l => BigInt(l.topics[1]).toString()));
  const withdrawnIds = new Set(
    withdrawn
      .filter(l => createdIds.has(BigInt(l.topics[1]).toString()))
      .map(l => BigInt(l.topics[1]).toString())
  );

  const order: Record<string, number> = { active:0, finished:1, withdrawn:2, cancelled:3 };

  const streams: StreamRecord[] = created.map(l => {
    const id        = BigInt(l.topics[1]);
    const recipient = "0x" + l.topics[3].slice(26); // last 20 bytes of topic3
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
    if (Number(s.endTime) * 1000 < Date.now()) return "finished";
    return "active";
  };

  return streams.sort((a, b) => {
    const da = getDisplay(a), db = getDisplay(b);
    if (da !== db) return order[da] - order[db];
    return Number(b.id) - Number(a.id);
  });
}