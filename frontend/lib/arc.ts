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
// Empty until scripts/deployAgentRegistry.ts has been run.
export const FLUX_AGENT_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_FLUX_AGENT_REGISTRY_ADDRESS || "") as `0x${string}`;
// Approximate contract deployment block on Arc Testnet (used as fromBlock for getLogs)
// Set to ~May 14 2026. If events are missing, lower this value.
export const FLUX_DEPLOY_BLOCK = 42_100_000n;
// Phase H3 deploy block (2026-08-06, redeployed after adding
// recordExternalSpend) — real value, read from the chain at deploy time
// (latest block was 55,563,641), with a small margin.
export const FLUX_AGENT_REGISTRY_DEPLOY_BLOCK = 55_563_500n;

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

// Phase H3 — FluxAgentRegistry (contracts/FluxAgentRegistry.sol). The
// on-chain enforcement layer for agent spending caps; see that file's
// header for why enforcement lives here rather than at Circle's wallet
// layer (Circle's policy API is mainnet-only; Arc is testnet-only).
export const FLUX_AGENT_REGISTRY_ABI = [
  {
    name: "registerAgent",
    type: "function",
    inputs: [
      { name: "agentWallet", type: "address" },
      { name: "perTxCap", type: "uint256" },
      { name: "dailyCap", type: "uint256" },
      { name: "totalCap", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "updateCaps",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "perTxCap", type: "uint256" },
      { name: "dailyCap", type: "uint256" },
      { name: "totalCap", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { name: "pause",  type: "function", inputs: [{ name: "agentId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "resume", type: "function", inputs: [{ name: "agentId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  // Kill-switch — instant, owner-only, irreversible.
  { name: "revoke", type: "function", inputs: [{ name: "agentId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  {
    name: "setAllowlisted",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "addrs", type: "address[]" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setBlocklisted",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "addrs", type: "address[]" },
      { name: "blocked", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setRestrictToAllowlist",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "restricted", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Called by the agent's own wallet (via a Circle contract-execution
  // challenge in Phase H4, or directly by an externally-owned agent) — not
  // called from the owner's own dashboard session. Moves USDC itself
  // (transferFrom) — trustlessly enforced, see the contract's own comment.
  {
    name: "recordPayment",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // The x402/Gateway counterpart — Circle's Gateway already moved the funds,
  // so this only validates the same guardrails and records the spend for
  // the audit trail. NOT trustlessly enforced (see the contract's own
  // doc comment) — an integration must actually call this.
  {
    name: "recordExternalSpend",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getAgent",
    type: "function",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agentWallet", type: "address" },
          { name: "owner", type: "address" },
          { name: "perTxCap", type: "uint256" },
          { name: "dailyCap", type: "uint256" },
          { name: "totalCap", type: "uint256" },
          { name: "spentToday", type: "uint256" },
          { name: "spentTotal", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "dayStart", type: "uint64" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    name: "isPayable",
    type: "function",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reason", type: "string" },
    ],
    stateMutability: "view",
  },
  { name: "nextAgentId", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    name: "allowlisted",
    type: "function",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "blocklisted",
    type: "function",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "restrictToAllowlist",
    type: "function",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agentWallet", type: "address", indexed: true },
      { name: "perTxCap", type: "uint256", indexed: false },
      { name: "dailyCap", type: "uint256", indexed: false },
      { name: "totalCap", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
    ],
  },
  {
    name: "CapsUpdated",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "perTxCap", type: "uint256", indexed: false },
      { name: "dailyCap", type: "uint256", indexed: false },
      { name: "totalCap", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
    ],
  },
  { name: "AgentPaused",  type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }] },
  { name: "AgentResumed", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }] },
  { name: "AgentRevoked", type: "event", inputs: [{ name: "agentId", type: "uint256", indexed: true }] },
  {
    name: "RecipientListUpdated",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "allowlist", type: "bool", indexed: false },
      { name: "value", type: "bool", indexed: false },
    ],
  },
  {
    name: "AllowlistModeSet",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "restricted", type: "bool", indexed: false },
    ],
  },
  {
    name: "AgentPayment",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "spentToday", type: "uint256", indexed: false },
      { name: "spentTotal", type: "uint256", indexed: false },
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