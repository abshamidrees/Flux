import { defineChain } from "viem";

// Optional override so a better (e.g. Circle-issued, API-keyed) Arc Testnet RPC
// can be dropped in via env with no code change. Falls back to the public one.
export const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

// ── Arc Testnet chain definition ──────────────────────────
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    decimals: 6,
    name: "USD Coin",
    symbol: "USDC",
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  // Verified deployed on Arc Testnet (eth_getCode returns real bytecode at the
  // canonical address). Without this, wagmi's useReadContracts / useReadContract
  // silently falls back to one eth_call PER contract instead of batching them
  // into a single multicall — on a rate-limited public RPC that's the direct
  // cause of balances intermittently showing $0 (a rate-limited individual call
  // fails silently to the allowFailure fallback instead of erroring visibly).
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
  testnet: true,
});

// ── Contract addresses ────────────────────────────────────
export const FLUX_ADDRESS = (process.env.NEXT_PUBLIC_FLUX_ADDRESS || "") as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "") as `0x${string}`;
// Empty until scripts/deployLimitOrder.ts has been run — swap UI treats this as "not live yet".
export const FLUX_LIMIT_ORDER_ADDRESS = (process.env.NEXT_PUBLIC_FLUX_LIMIT_ORDER_ADDRESS || "") as `0x${string}`;
// Approximate contract deployment block on Arc Testnet (used as fromBlock for getLogs)
// Set to ~May 14 2026. If events are missing, lower this value.
export const FLUX_DEPLOY_BLOCK = 42_100_000n;

// ── USDC ABI (minimal) ────────────────────────────────────
export const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "StreamWithdrawn",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamCancelled",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "refund", type: "uint256", indexed: false },
    ],
  },
  {
    name: "AgentPayment",
    type: "event",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── FluxSettlement ABI ────────────────────────────────────
export const FLUX_ABI = [
  // batchSettle
  {
    name: "batchSettle",
    type: "function",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // createStream
  {
    name: "createStream",
    type: "function",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "startTime", type: "uint64" },
      { name: "endTime", type: "uint64" },
    ],
    outputs: [{ name: "streamId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  // withdrawFromStream
  {
    name: "withdrawFromStream",
    type: "function",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // cancelStream
  {
    name: "cancelStream",
    type: "function",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // registerAgent
  {
    name: "registerAgent",
    type: "function",
    inputs: [
      { name: "agent", type: "address" },
      { name: "label", type: "string" },
      { name: "budgetCap", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // updateAgent
  {
    name: "updateAgent",
    type: "function",
    inputs: [
      { name: "agent", type: "address" },
      { name: "newBudgetCap", type: "uint256" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // depositForAgents
  {
    name: "depositForAgents",
    type: "function",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // withdrawFees
  {
    name: "withdrawFees",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // getStats
  {
    name: "getStats",
    type: "function",
    inputs: [],
    outputs: [
      { name: "volume", type: "uint256" },
      { name: "fees", type: "uint256" },
      { name: "batches", type: "uint256" },
      { name: "streamCount", type: "uint256" },
      { name: "agentCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  // getStream
  {
    name: "getStream",
    type: "function",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "recipient", type: "address" },
          { name: "totalAmount", type: "uint256" },
          { name: "released", type: "uint256" },
          { name: "startTime", type: "uint64" },
          { name: "endTime", type: "uint64" },
          { name: "cancelled", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  // getAgent
  {
    name: "getAgent",
    type: "function",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "budgetCap", type: "uint256" },
          { name: "spent", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "registeredAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  // getAllAgents
  {
    name: "getAllAgents",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  // claimableAmount
  {
    name: "claimableAmount",
    type: "function",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  // owner
  {
    name: "owner",
    type: "function",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  // totalSettledVolume
  {
    name: "totalSettledVolume",
    type: "function",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  // Events
  {
    name: "BatchSettled",
    type: "event",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "recipientCount", type: "uint256", indexed: false },
      { name: "totalUSDC", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamCreated",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "startTime", type: "uint64", indexed: false },
      { name: "endTime", type: "uint64", indexed: false },
    ],
  },
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "label", type: "string", indexed: false },
      { name: "budgetCap", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── FluxLimitOrder ABI (minimal) ───────────────────────────
export const FLUX_LIMIT_ORDER_ABI = [
  {
    name: "createOrder",
    type: "function",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [{ name: "orderId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "cancelOrder",
    type: "function",
    inputs: [{ name: "orderId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Keeper-only — not called from the browser UI.
  {
    name: "executeOrder",
    type: "function",
    inputs: [
      { name: "orderId", type: "uint256" },
      { name: "router", type: "address" },
      { name: "swapData", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getOrderView",
    type: "function",
    inputs: [{ name: "orderId", type: "uint256" }],
    outputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "status", type: "uint8" },
        ],
      },
      { name: "isExpired", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    name: "claimable",
    type: "function",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "OrderCreated",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "minAmountOut", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
    ],
  },
  {
    name: "OrderCancelled",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "refund", type: "uint256", indexed: false },
    ],
  },
  {
    name: "OrderFilled",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "router", type: "address", indexed: true },
      { name: "amountOut", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── Helpers ───────────────────────────────────────────────
export const USDC_DECIMALS = 6;

export function formatUSDC(amount: bigint): string {
  const n = Number(amount) / 10 ** USDC_DECIMALS;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function parseUSDC(amount: string): bigint {
  return BigInt(Math.round(parseFloat(amount) * 10 ** USDC_DECIMALS));
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function explorerLink(type: "address" | "tx", value: string): string {
  const base = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://testnet.arcscan.app";
  return `${base}/${type}/${value}`;
}