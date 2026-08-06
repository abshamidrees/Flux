// app/api/circle/transactions/[id]/route.ts
// Polls a Circle transaction to a terminal state, the same role
// publicClient.waitForTransactionReceipt plays for the on-chain-native
// routes (XyloNet/UnitFlow/keeper) — this app never claims success without
// a real, checked terminal state.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { circleClient, CIRCLE_USER_TOKEN_COOKIE } from "../../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const userToken = jar.get(CIRCLE_USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json({ error: "No active Circle session — call /api/circle/users first" }, { status: 401 });
  }

  try {
    const res = await circleClient().getTransaction({ userToken, id });
    return NextResponse.json(res.data);
  } catch (e) {
    const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data
      ?? (e as Error)?.message ?? "Unknown error";
    return NextResponse.json({ error: "Failed to fetch transaction", detail }, { status: 502 });
  }
}
