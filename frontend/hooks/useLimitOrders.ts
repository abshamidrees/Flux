// hooks/useLimitOrders.ts
// Real execution against FluxLimitOrder: approve (exact amountIn, separate
// confirmation) → createOrder, and cancelOrder — both receipt-verified, same
// discipline as useSwapExecution. No-ops cleanly if the contract isn't deployed
// yet (FLUX_LIMIT_ORDER_ADDRESS unset).

"use client";

import { useCallback, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { FLUX_LIMIT_ORDER_ADDRESS, FLUX_LIMIT_ORDER_ABI } from "../lib/arc";
import { ERC20_ABI } from "../lib/swap/abis";
import { fetchOpenOrders, type OpenOrder } from "../lib/swap/limitOrders";

export type LimitOrderStatus = "idle" | "approving" | "approve-pending" | "creating" | "pending" | "success" | "failed";

export const LIMIT_ORDERS_LIVE = !!FLUX_LIMIT_ORDER_ADDRESS;

/* eslint-disable @typescript-eslint/no-explicit-any */
function isUserRejection(e: any): boolean {
  const s = (e?.shortMessage || e?.message || "").toLowerCase();
  return e?.name === "UserRejectedRequestError" || e?.cause?.code === 4001 || e?.code === 4001 || s.includes("rejected") || s.includes("denied");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useLimitOrders() {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<LimitOrderStatus>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => { setStatus("idle"); setTxHash(null); setError(null); }, []);

  const approve = useCallback(
    async (token: `0x${string}`, amountIn: bigint) => {
      if (!client) return;
      try {
        setStatus("approving"); setError(null);
        const hash = await writeContractAsync({
          address: token, abi: ERC20_ABI, functionName: "approve", args: [FLUX_LIMIT_ORDER_ADDRESS, amountIn],
        });
        setStatus("approve-pending"); setTxHash(hash);
        const rcpt = await client.waitForTransactionReceipt({ hash });
        setStatus(rcpt.status === "success" ? "idle" : "failed");
        if (rcpt.status !== "success") setError("Approval failed. Please try again.");
      } catch (e) {
        if (isUserRejection(e)) setStatus("idle");
        else { setStatus("failed"); setError((e as Error)?.message ?? "Approval failed."); }
      }
    },
    [client, writeContractAsync],
  );

  const createOrder = useCallback(
    async (params: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint; minAmountOut: bigint; expirySec: number }) => {
      if (!client) return;
      try {
        setStatus("creating"); setError(null);
        const hash = await writeContractAsync({
          address: FLUX_LIMIT_ORDER_ADDRESS, abi: FLUX_LIMIT_ORDER_ABI, functionName: "createOrder",
          args: [params.tokenIn, params.tokenOut, params.amountIn, params.minAmountOut, BigInt(params.expirySec)],
        });
        setStatus("pending"); setTxHash(hash);
        const rcpt = await client.waitForTransactionReceipt({ hash });
        if (rcpt.status === "success") setStatus("success");
        else { setStatus("failed"); setError("Order creation reverted on-chain. Open the transaction on ArcScan for the reason."); }
      } catch (e) {
        if (isUserRejection(e)) setStatus("idle");
        else { setStatus("failed"); setError((e as Error)?.message ?? "Order creation failed."); }
      }
    },
    [client, writeContractAsync],
  );

  const cancelOrder = useCallback(
    async (orderId: bigint) => {
      if (!client) return false;
      try {
        const hash = await writeContractAsync({
          address: FLUX_LIMIT_ORDER_ADDRESS, abi: FLUX_LIMIT_ORDER_ABI, functionName: "cancelOrder", args: [orderId],
        });
        const rcpt = await client.waitForTransactionReceipt({ hash });
        return rcpt.status === "success";
      } catch {
        return false;
      }
    },
    [client, writeContractAsync],
  );

  return { status, txHash, error, approve, createOrder, cancelOrder, reset };
}

export function useOpenOrders(address: string | undefined) {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address || !LIMIT_ORDERS_LIVE) { setOrders([]); return; }
    setLoading(true);
    try {
      setOrders(await fetchOpenOrders(address));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { orders, loading, load };
}
