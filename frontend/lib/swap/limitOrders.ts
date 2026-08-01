// lib/swap/limitOrders.ts
// Open limit orders reconstructed from FluxLimitOrder events via ArcScan, same
// pattern as lib/blockchain.ts. ArcScan only supports topic0_1_opr, so maker
// (topic2) is filtered client-side — mirrors fetchReceivedStreams's topic3
// handling. Only meaningful once FLUX_LIMIT_ORDER_ADDRESS is set post-deploy.
//
// Two readers: fetchOpenOrders(maker) for the wallet-scoped History view, and
// fetchAllOpenOrders() for the keeper, which must see every maker's orders.

import { FLUX_LIMIT_ORDER_ADDRESS } from "../arc";
import { TOKENS, tokenByAddress, type TokenInfo } from "./tokens";

const ARCSCAN = "https://testnet.arcscan.app/api";

const TOPIC = {
  OrderCreated:   "0xd4dd83098743e2cc4e36c6cabd9d5e2d436df189d90a92c943f460d6bf9999d5",
  OrderCancelled: "0xc4058ebc534b64ecb27b2d4eaa1904f98997ec18ebe6ada4117593dde89478cc",
  OrderFilled:    "0x1e7abafb1a786c4e6394b5c494f50a97e3802ff2ce462eca4fe6a2dd4e1f92e8",
} as const;

export interface OpenOrder {
  id: bigint;
  maker: string;
  tokenIn: TokenInfo | null;
  tokenOut: TokenInfo | null;
  amountIn: bigint;
  minAmountOut: bigint;
  expiry: number; // unix seconds
  txHash: string;
  isExpired: boolean;
}

interface ArcLog {
  topics: string[];
  data: string;
  transactionHash: string;
}

const NO_RESULTS = ["no records found", "no logs found", "no transactions found", "result not found"];

function padAddress(addr: string): string {
  return "0x000000000000000000000000" + addr.toLowerCase().replace("0x", "");
}

function hex64(data: string, wordIndex: number): bigint {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  const word = clean.slice(wordIndex * 64, (wordIndex + 1) * 64);
  return word ? BigInt("0x" + word) : 0n;
}

async function fetchLogs(topic0: string): Promise<ArcLog[]> {
  const url = new URL(ARCSCAN);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", FLUX_LIMIT_ORDER_ADDRESS);
  url.searchParams.set("fromBlock", "0");
  url.searchParams.set("toBlock", "latest");
  url.searchParams.set("topic0", topic0);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`ArcScan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === "0") {
    const msg = (json.message || "").toLowerCase();
    if (NO_RESULTS.some((n) => msg.includes(n))) return [];
    throw new Error(json.message || "ArcScan error");
  }
  return (json.result as ArcLog[]) || [];
}

function tokenOrGuess(address: string): TokenInfo | null {
  return tokenByAddress(address) ?? TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase()) ?? null;
}

function parseOrderLog(l: ArcLog): OpenOrder {
  const id = BigInt(l.topics[1]);
  const maker = "0x" + l.topics[2].slice(26);
  const tokenIn = "0x" + hex64(l.data, 0).toString(16).padStart(40, "0");
  const tokenOut = "0x" + hex64(l.data, 1).toString(16).padStart(40, "0");
  const amountIn = hex64(l.data, 2);
  const minAmountOut = hex64(l.data, 3);
  const expiry = Number(hex64(l.data, 4));
  const now = Date.now() / 1000;
  return {
    id,
    maker,
    tokenIn: tokenOrGuess(tokenIn),
    tokenOut: tokenOrGuess(tokenOut),
    amountIn,
    minAmountOut,
    expiry,
    txHash: l.transactionHash,
    isExpired: expiry > 0 && expiry <= now,
  };
}

async function fetchOpenOrderLogs(): Promise<ArcLog[]> {
  if (!FLUX_LIMIT_ORDER_ADDRESS) return [];
  const [created, cancelled, filled] = await Promise.all([
    fetchLogs(TOPIC.OrderCreated),
    fetchLogs(TOPIC.OrderCancelled),
    fetchLogs(TOPIC.OrderFilled),
  ]);
  const closedIds = new Set<string>([
    ...cancelled.map((l) => BigInt(l.topics[1]).toString()),
    ...filled.map((l) => BigInt(l.topics[1]).toString()),
  ]);
  return created.filter((l) => !closedIds.has(BigInt(l.topics[1]).toString()));
}

/** Every OrderCreated by `maker` that is still Open — for the wallet-scoped History view. */
export async function fetchOpenOrders(maker: string): Promise<OpenOrder[]> {
  const paddedMaker = padAddress(maker);
  const open = await fetchOpenOrderLogs();
  return open
    .filter((l) => l.topics[2]?.toLowerCase() === paddedMaker.toLowerCase())
    .map(parseOrderLog)
    .sort((a, b) => Number(b.id - a.id));
}

/** Every open order from every maker — for the keeper, which fills on anyone's behalf. */
export async function fetchAllOpenOrders(): Promise<OpenOrder[]> {
  const open = await fetchOpenOrderLogs();
  return open.map(parseOrderLog).sort((a, b) => Number(a.id - b.id));
}
