// hooks/useStreamLiveState.ts
// Live per-stream state (released, claimable, cancelled) read directly from
// FluxSettlement — the ONLY source of truth for "can this recipient withdraw
// right now." StreamCreated/StreamWithdrawn/StreamCancelled events are fine
// for discovering which stream IDs exist (lib/blockchain.ts), but reducing
// "has a StreamWithdrawn event ever fired" to a permanent status was the
// exact bug this hook exists to avoid repeating: withdrawFromStream is fully
// repeatable (claims vested-minus-released each call, no one-shot flag), so
// the only correct signal for the Withdraw button is a fresh claimableAmount
// read, not event history.
//
// Batched into one Multicall3 round trip regardless of stream count — same
// pattern as hooks/useTokenBalances.ts (allowFailure + keepPreviousData so a
// transient RPC blip shows the last known-good numbers instead of flashing
// back to zero/unknown).
"use client";

import { useReadContracts } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";
import { FLUX_ABI, FLUX_ADDRESS } from "../lib/arc";

export interface StreamLiveState {
  totalAmount: bigint;
  released: bigint;
  claimable: bigint;
  cancelled: boolean;
}

export function useStreamLiveState(ids: bigint[]) {
  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((id) => [
      { address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "getStream" as const, args: [id] },
      { address: FLUX_ADDRESS as `0x${string}`, abi: FLUX_ABI, functionName: "claimableAmount" as const, args: [id] },
    ]),
    query: {
      enabled: ids.length > 0 && !!FLUX_ADDRESS,
      refetchInterval: 4_000,
      staleTime: 4_000,
      placeholderData: keepPreviousData,
    },
  });

  const live = new Map<string, StreamLiveState>();
  ids.forEach((id, i) => {
    const streamRes = data?.[i * 2];
    const claimRes = data?.[i * 2 + 1];
    if (streamRes?.status === "success" && claimRes?.status === "success") {
      const s = streamRes.result as { totalAmount: bigint; released: bigint; cancelled: boolean };
      live.set(id.toString(), {
        totalAmount: s.totalAmount,
        released: s.released,
        claimable: claimRes.result as bigint,
        cancelled: s.cancelled,
      });
    }
  });

  return { live, isLoading, refetch };
}
