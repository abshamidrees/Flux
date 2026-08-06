// app/api/circle/challenge/route.ts
// Generic contract-execution challenge — the path every later Circle-signed
// action (swap, batch settle, stream, agent payment) routes through. Accepts
// pre-encoded calldata (viem's encodeFunctionData — same encoding already
// used for XyloNet/UnitFlow execution elsewhere in this app) rather than an
// ABI signature, since callData is mutually exclusive with abiFunctionSignature
// per the SDK's own type, and reusing our existing viem encoding avoids a
// second, parallel way of describing the same call.
//
// This route only creates the challenge; the client SDK's execute(challengeId)
// still has to run for the user to actually approve and broadcast it — Circle
// wallets are non-custodial, so nothing here can sign or spend on its own.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { circleClient, CIRCLE_USER_TOKEN_COOKIE } from "../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ChallengeRequestBody {
  walletId?: unknown;
  walletAddress?: unknown;
  contractAddress?: unknown;
  callData?: unknown;
  amount?: unknown;
  feeLevel?: unknown;
  refId?: unknown;
}

const FEE_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);
const HEX_CALLDATA_RE = /^0x[0-9a-fA-F]*$/;

export async function POST(request: Request) {
  const jar = await cookies();
  const userToken = jar.get(CIRCLE_USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json({ error: "No active Circle session — call /api/circle/users first" }, { status: 401 });
  }

  let body: ChallengeRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contractAddress = typeof body.contractAddress === "string" ? body.contractAddress : "";
  const callData = typeof body.callData === "string" ? body.callData : "";
  const walletId = typeof body.walletId === "string" ? body.walletId : undefined;
  const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress : undefined;
  const feeLevel = typeof body.feeLevel === "string" && FEE_LEVELS.has(body.feeLevel) ? body.feeLevel : "MEDIUM";

  if (!contractAddress) {
    return NextResponse.json({ error: "contractAddress is required" }, { status: 400 });
  }
  if (!HEX_CALLDATA_RE.test(callData)) {
    return NextResponse.json({ error: "callData must be 0x-prefixed hex" }, { status: 400 });
  }
  if (!walletId && !walletAddress) {
    return NextResponse.json({ error: "walletId or walletAddress is required" }, { status: 400 });
  }

  try {
    const res = await circleClient().createUserTransactionContractExecutionChallenge({
      userToken,
      contractAddress,
      callData: callData as `0x${string}`,
      ...(walletId ? { walletId } : { walletAddress, blockchain: "ARC-TESTNET" as const }),
      ...(typeof body.amount === "string" ? { amount: body.amount } : {}),
      ...(typeof body.refId === "string" ? { refId: body.refId } : {}),
      fee: { type: "level", config: { feeLevel: feeLevel as "LOW" | "MEDIUM" | "HIGH" } },
    });
    const challengeId = res.data?.challengeId;

    // createUserTransactionContractExecutionChallenge's response is only
    // ever {challengeId} (verified against the SDK's own PinData type) —
    // execute()'s client-side callback for a CREATE_TRANSACTION challenge
    // is equally bare ({type, status}, no txHash). The transaction record
    // itself is created alongside the challenge (state PENDING) though, so
    // grabbing the newest one for this wallet right now — before the client
    // can possibly trigger another — reliably captures its id for later
    // polling via GET /api/circle/transactions/[id]. Only possible when
    // walletId was given (listTransactions filters by walletId, not address).
    let transactionId: string | undefined;
    if (walletId) {
      const listed = await circleClient().listTransactions({ userToken, walletIds: [walletId], pageSize: 1 });
      transactionId = listed.data?.transactions?.[0]?.id;
    }

    return NextResponse.json({ challengeId, transactionId });
  } catch (e) {
    const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data
      ?? (e as Error)?.message ?? "Unknown error";
    return NextResponse.json({ error: "Challenge creation failed", detail }, { status: 502 });
  }
}
