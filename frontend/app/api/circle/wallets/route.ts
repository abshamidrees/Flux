// app/api/circle/wallets/route.ts
// Lists the current Circle user's wallets. The wallet-creation challenge
// (POST /api/circle/wallets/init) only ever resolves to {type, status} on
// completion — it never hands back the created wallet's address directly —
// so the client calls this route after execute() reports COMPLETE to resolve
// the actual address for the unified wallet context.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { circleClient, CIRCLE_USER_TOKEN_COOKIE } from "../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const userToken = jar.get(CIRCLE_USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json({ error: "No active Circle session — call /api/circle/users first" }, { status: 401 });
  }

  try {
    const res = await circleClient().listWallets({ userToken });
    const wallets = (res.data?.wallets ?? []).map((w) => ({
      id: w.id,
      address: w.address,
      blockchain: w.blockchain,
      custodyType: w.custodyType,
    }));
    return NextResponse.json({ wallets });
  } catch (e) {
    const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data
      ?? (e as Error)?.message ?? "Unknown error";
    return NextResponse.json({ error: "Failed to list wallets", detail }, { status: 502 });
  }
}
