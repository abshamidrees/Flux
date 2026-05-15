import { defineChain } from "viem";

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
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

// ── Contract addresses ────────────────────────────────────
export const FLUX_ADDRESS = (process.env.NEXT_PUBLIC_FLUX_ADDRESS || "") as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "") as `0x${string}`;

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
