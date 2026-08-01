// hooks/useTokenBalances.ts
// Real ERC-20 balances for the swap token set via wagmi's multicall (Arc has no
// balance indexer — Synthra surfaces the same limitation — so this must always be
// direct balanceOf reads, batched into one Multicall3 round trip).
//
// P0 fix: a rate-limited or in-flight read must never render as a confirmed `0`.
// `formatted`/`raw` are `null` until a read genuinely succeeds at least once;
// `0` only appears once a call has actually returned zero. `placeholderData:
// keepPreviousData` means a later refetch that stalls or errors keeps showing
// the last known-good number instead of flashing back to unknown.

"use client";

import { useReadContracts, useAccount } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";
import { USDC_ABI } from "../lib/arc";
import { TOKENS, type TokenInfo } from "../lib/swap/tokens";

export type BalanceStatus = "loading" | "ready" | "error";

export interface TokenBalance {
  token: TokenInfo;
  raw: bigint | null;
  formatted: number | null;
  status: BalanceStatus;
}

export function useTokenBalances() {
  const { address } = useAccount();

  const { data, isLoading, isError, refetch } = useReadContracts({
    allowFailure: true,
    contracts: TOKENS.map((t) => ({
      address: t.address,
      abi: USDC_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
    })),
    query: {
      enabled: !!address,
      refetchInterval: 20_000,
      staleTime: 20_000,
      placeholderData: keepPreviousData,
    },
  });

  const balances: Record<string, TokenBalance> = {};
  TOKENS.forEach((t, i) => {
    const result = data?.[i];
    let status: BalanceStatus;
    let raw: bigint | null;

    if (result?.status === "success") {
      status = "ready";
      raw = result.result as bigint;
    } else if (!data) {
      // Nothing has ever resolved for this address yet — genuinely unknown.
      status = isError ? "error" : "loading";
      raw = null;
    } else {
      // Multicall itself succeeded but this one token's call failed within it.
      status = "error";
      raw = null;
    }

    balances[t.address.toLowerCase()] = {
      token: t,
      raw,
      formatted: raw !== null ? Number(raw) / 10 ** t.decimals : null,
      status,
    };
  });

  const balanceOf = (token: TokenInfo): TokenBalance =>
    balances[token.address.toLowerCase()] ?? { token, raw: null, formatted: null, status: "loading" };

  return { balances, balanceOf, isLoading, refetch };
}
