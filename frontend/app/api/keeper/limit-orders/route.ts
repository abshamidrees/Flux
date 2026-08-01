// app/api/keeper/limit-orders/route.ts
// Permissionless order execution, run on a schedule (spec §5.2). Reads every
// open, unexpired FluxLimitOrder, re-quotes each pair across the on-chain
// adapters (Circle excluded — its SDK needs a browser wallet to quote, which
// doesn't exist server-side), and calls executeOrder for anything that clears
// its trigger.
//
// SECURITY — read before deploying this route:
//   - KEEPER_PRIVATE_KEY is a real, funded signer. It must be a TESTNET-ONLY
//     key, funded with the minimum needed to pay gas for fills, set as a
//     Vercel encrypted env var, and NEVER prefixed NEXT_PUBLIC_ (that would
//     ship it to every browser). This code never logs the key or the account
//     beyond its public address.
//   - CRON_SECRET gates the route: Vercel Cron automatically sends
//     `Authorization: Bearer <CRON_SECRET>` on scheduled invocations when
//     that env var is set on the project. Without a valid header this route
//     returns 401 — it is not publicly callable.
//   - The contract's own on-chain checks (router allowlist, minAmountOut,
//     expiry) are the real safety boundary — this route choosing badly can
//     waste the keeper's gas, but cannot drain more than an order's own
//     escrowed amountIn, and never below the maker's own trigger.

import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, FLUX_LIMIT_ORDER_ADDRESS, FLUX_LIMIT_ORDER_ABI } from "../../../../lib/arc";
import { fetchAllOpenOrders } from "../../../../lib/swap/limitOrders";
import { buildAdapters } from "../../../../lib/swap/adapters/registry";
import { runAggregator } from "../../../../lib/swap/aggregator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AttemptLog {
  orderId: string;
  outcome: "filled" | "skipped-no-route" | "skipped-expired" | "error";
  detail?: string;
  txHash?: string;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keeperKey = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!keeperKey) {
    return NextResponse.json({ error: "KEEPER_PRIVATE_KEY not configured" }, { status: 500 });
  }
  if (!FLUX_LIMIT_ORDER_ADDRESS) {
    return NextResponse.json({ error: "FluxLimitOrder not deployed (FLUX_LIMIT_ORDER_ADDRESS unset)" }, { status: 500 });
  }

  const account = privateKeyToAccount(keeperKey);
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });

  // Circle excluded server-side: its adapter needs window.ethereum to quote.
  const adapters = buildAdapters(publicClient).filter((a) => a.id !== "circle");

  const logs: AttemptLog[] = [];
  let filled = 0;

  const orders = await fetchAllOpenOrders();

  for (const order of orders) {
    const idStr = order.id.toString();
    if (order.isExpired) {
      logs.push({ orderId: idStr, outcome: "skipped-expired" });
      continue;
    }
    if (!order.tokenIn || !order.tokenOut) {
      logs.push({ orderId: idStr, outcome: "error", detail: "Unrecognised token in order" });
      continue;
    }

    try {
      // Quote as if the LIMIT ORDER CONTRACT itself is the recipient — it
      // holds the escrowed tokenIn and must receive tokenOut before crediting
      // the maker via pull-payment. This is NOT the maker's own address.
      const { ranked } = await runAggregator(
        adapters,
        {
          tokenIn: order.tokenIn,
          tokenOut: order.tokenOut,
          amountIn: order.amountIn,
          slippageBps: 50,
          recipient: FLUX_LIMIT_ORDER_ADDRESS,
          deadline: Math.floor(Date.now() / 1000) + 5 * 60,
        },
        { tokenOut: order.tokenOut, usdPrice: () => 1, gasPriceUsdc: 0 }, // ranking irrelevant here; only the trigger check matters
      );

      // Take the first ranked quote (any route) whose raw output clears the
      // maker's trigger — the contract re-verifies this independently via its
      // own balance-delta check, so a stale/optimistic pick here is safe.
      const eligible = ranked.find((r) => r.quote.amountOut >= order.minAmountOut);
      if (!eligible) {
        logs.push({ orderId: idStr, outcome: "skipped-no-route", detail: `Best available output does not meet trigger` });
        continue;
      }

      const tx = eligible.quote.buildTx();
      const hash = await walletClient.writeContract({
        address: FLUX_LIMIT_ORDER_ADDRESS,
        abi: FLUX_LIMIT_ORDER_ABI,
        functionName: "executeOrder",
        args: [order.id, tx.to, tx.data],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        filled++;
        logs.push({ orderId: idStr, outcome: "filled", txHash: hash, detail: eligible.quote.routeId });
      } else {
        logs.push({ orderId: idStr, outcome: "error", detail: "executeOrder reverted", txHash: hash });
      }
    } catch (e) {
      logs.push({ orderId: idStr, outcome: "error", detail: (e as Error)?.message?.slice(0, 200) });
    }
  }

  // Vercel captures function stdout as logs; also returned in the response
  // for manual curl-based debugging (spec §5.2: "log every attempt with the outcome").
  console.log(`[keeper] checked=${orders.length} filled=${filled}`, JSON.stringify(logs));

  return NextResponse.json({ checked: orders.length, filled, attempts: logs });
}
