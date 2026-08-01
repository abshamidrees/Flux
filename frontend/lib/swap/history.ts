// lib/swap/history.ts
// Swap history reconstructed from chain state via ArcScan (spec §3) — no
// localStorage, so history follows the wallet, not the browser. Swaps execute
// against third-party routers, so we cannot emit our own events: we read the
// account's transaction list, keep those sent to a known route router, and derive
// the in/out legs from the account's token transfers in the same transaction.

import { TOKENS, tokenByAddress, type TokenInfo } from "./tokens";
import { XYLONET, UNITFLOW, UNITFLOW_V3, ROUTES } from "./constants";
import type { RouteId } from "./types";

const ARCSCAN = "https://testnet.arcscan.app/api";

// Router address → route id. Extend as adapters go live.
// Note: Circle's swap-kit isn't included here — it doesn't expose a single
// fixed on-chain router address the way an AMM does (its SDK abstracts
// execution), so Circle swaps currently aren't attributed to a route in
// reconstructed history/volume. Revisit if swap-kit publishes a stable
// execution contract address.
const ROUTER_TO_ROUTE: Record<string, RouteId> = {
  [XYLONET.router.toLowerCase()]: "xylonet",
  [UNITFLOW.liquidityRouter.toLowerCase()]: "unitflow", // V2.5, superseded but kept for old history
  [UNITFLOW.universalRouter.toLowerCase()]: "unitflow",
  [UNITFLOW_V3.router.toLowerCase()]: "unitflow",
};

export interface SwapRecord {
  txHash: string;
  timestamp: number;          // unix seconds
  routeId: RouteId | null;
  routeName: string;
  tokenIn: TokenInfo | null;
  tokenOut: TokenInfo | null;
  amountIn: bigint;
  amountOut: bigint;
  /** Gas paid, in the native token (18dp) — displayed in USD terms. */
  gasPaid: number;
  failed: boolean;
  errorText?: string;
}

interface ArcTx {
  hash: string;
  from: string;
  to: string;
  timeStamp: string;
  gasUsed: string;
  gasPrice: string;
  isError?: string;
  txreceipt_status?: string;
}

interface ArcTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

const NO_RESULTS = ["no records found", "no transactions found", "no logs found", "result not found"];

async function arcscan<T>(params: Record<string, string>): Promise<T[]> {
  const url = new URL(ARCSCAN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`ArcScan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === "0") {
    const msg = (json.message || "").toLowerCase();
    if (NO_RESULTS.some((n) => msg.includes(n))) return [];
    throw new Error(json.message || "ArcScan error");
  }
  return (json.result as T[]) || [];
}

/** Real revert reason for one failed tx (Blockscout's Etherscan-compatible
 *  transaction&action=getstatus, verified to return `errDescription`). Only
 *  called for transactions already known to have failed. */
async function fetchRevertReason(txHash: string): Promise<string | undefined> {
  try {
    const url = new URL(ARCSCAN);
    url.searchParams.set("module", "transaction");
    url.searchParams.set("action", "getstatus");
    url.searchParams.set("txhash", txHash);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return undefined;
    const json = await res.json();
    const reason = json?.result?.errDescription;
    return typeof reason === "string" && reason.trim() ? reason.trim() : undefined;
  } catch {
    return undefined; // fall back to the generic message — never block the row on this
  }
}

/**
 * Fetch the connected address's swap history. Returns newest-first.
 * Failures are included (spec §3) rather than hidden.
 */
export async function fetchSwapHistory(address: string): Promise<SwapRecord[]> {
  const [txs, tokenTxs] = await Promise.all([
    arcscan<ArcTx>({ module: "account", action: "txlist", address, startblock: "0", endblock: "latest", sort: "desc" }),
    arcscan<ArcTokenTx>({ module: "account", action: "tokentx", address, startblock: "0", endblock: "latest", sort: "desc" }),
  ]);

  // Group this account's token transfers by transaction.
  const byHash = new Map<string, ArcTokenTx[]>();
  for (const t of tokenTxs) {
    const k = t.hash.toLowerCase();
    if (!byHash.has(k)) byHash.set(k, []);
    byHash.get(k)!.push(t);
  }

  const me = address.toLowerCase();
  const pending: Array<Omit<SwapRecord, "errorText"> & { failed: boolean }> = [];

  for (const tx of txs) {
    const to = (tx.to || "").toLowerCase();
    const routeId = ROUTER_TO_ROUTE[to];
    if (!routeId) continue; // not a swap through a known router

    const transfers = byHash.get(tx.hash.toLowerCase()) ?? [];
    let tokenIn: TokenInfo | null = null;
    let tokenOut: TokenInfo | null = null;
    let amountIn = 0n;
    let amountOut = 0n;

    for (const t of transfers) {
      const token = tokenByAddress(t.contractAddress) ?? guessToken(t);
      if (!token) continue;
      const val = BigInt(t.value || "0");
      if (t.from.toLowerCase() === me) { tokenIn = token; amountIn += val; }
      else if (t.to.toLowerCase() === me) { tokenOut = token; amountOut += val; }
    }

    const failed = tx.isError === "1" || tx.txreceipt_status === "0";
    pending.push({
      txHash: tx.hash,
      timestamp: Number(tx.timeStamp),
      routeId,
      routeName: ROUTES[routeId]?.displayName ?? routeId,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      gasPaid: (Number(tx.gasUsed || 0) * Number(tx.gasPrice || 0)) / 1e18,
      failed,
    });
  }

  // Real revert reasons for failed swaps, fetched in parallel — never hide a
  // failure behind a generic message when ArcScan actually has one.
  const records: SwapRecord[] = await Promise.all(
    pending.map(async (r) => ({
      ...r,
      errorText: r.failed ? (await fetchRevertReason(r.txHash)) ?? "Transaction reverted" : undefined,
    })),
  );

  return records.sort((a, b) => b.timestamp - a.timestamp);
}

/** Build a TokenInfo for a transfer of a token outside our registry. */
function guessToken(t: ArcTokenTx): TokenInfo | null {
  if (!t.tokenSymbol) return null;
  const known = TOKENS.find((x) => x.symbol.toLowerCase() === t.tokenSymbol!.toLowerCase());
  if (known) return known;
  return {
    symbol: t.tokenSymbol,
    name: t.tokenSymbol,
    address: t.contractAddress as `0x${string}`,
    decimals: Number(t.tokenDecimal ?? 18),
  };
}

/**
 * USD value of one swap record — whichever side has a known price, output
 * first. Shared between the History tab's Value column and the dashboard's
 * swap-volume stat so the two are always computed the same way.
 */
export function swapUsdValue(r: SwapRecord, priceOf: (t: TokenInfo) => number | null): number | null {
  if (r.tokenOut) {
    const p = priceOf(r.tokenOut);
    if (p != null) return (Number(r.amountOut) / 10 ** r.tokenOut.decimals) * p;
  }
  if (r.tokenIn) {
    const p = priceOf(r.tokenIn);
    if (p != null) return (Number(r.amountIn) / 10 ** r.tokenIn.decimals) * p;
  }
  return null;
}

/** Relative under an hour, absolute after (spec §3). */
export function formatWhen(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const d = new Date(unixSeconds * 1000);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return sameDay ? time : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}
