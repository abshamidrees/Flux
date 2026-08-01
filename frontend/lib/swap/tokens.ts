// lib/swap/tokens.ts
// Arc Testnet (5042002) token registry for swap.
//
// Addresses are VERIFIED (Phase 0): USDC matches Flux's own NEXT_PUBLIC_USDC_ADDRESS,
// and all three match XyloNet's live StableSwap pools. Do not add a token here
// without a verified on-chain address — the aggregator never fabricates a pair.
//
// Verified on-chain (Phase B): the ERC-20 USDC at 0x3600…0000 (6dp) is the
// settlement asset and a NORMAL ERC-20 — it needs a router allowance to swap and
// is NOT the native gas token. Arc's native gas token is a separate 18-decimal
// token, so selling the full USDC balance does not starve gas (no Max buffer).

export interface TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  /** True only for the native gas token. None of the swap tokens are native here. */
  isNative?: boolean;
}

export const USDC: TokenInfo = {
  symbol: "USDC",
  name: "USD Coin",
  address: "0x3600000000000000000000000000000000000000",
  decimals: 6,
};

export const EURC: TokenInfo = {
  symbol: "EURC",
  name: "Euro Coin",
  address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  decimals: 6,
};

export const USYC: TokenInfo = {
  symbol: "USYC",
  name: "US Yield Coin",
  address: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
  decimals: 6,
};

/** Settlement currency — every other Flux feature is denominated in it. */
export const SETTLEMENT_TOKEN = USDC;

/** Launch set (Phase 0 decision: USDC · EURC · USYC). */
export const TOKENS: TokenInfo[] = [USDC, EURC, USYC];

export function tokenByAddress(address: string): TokenInfo | undefined {
  const a = address.toLowerCase();
  return TOKENS.find((t) => t.address.toLowerCase() === a);
}

export function tokenBySymbol(symbol: string): TokenInfo | undefined {
  const s = symbol.toUpperCase();
  return TOKENS.find((t) => t.symbol.toUpperCase() === s);
}

export function isSameToken(a: TokenInfo, b: TokenInfo): boolean {
  return a.address.toLowerCase() === b.address.toLowerCase();
}
