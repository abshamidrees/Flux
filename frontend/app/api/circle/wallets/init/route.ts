// app/api/circle/wallets/init/route.ts
// Creates the wallet-creation challenge (PIN/OTP setup + wallet provisioning
// in one call, per Circle's createUserPinWithWallets). The client SDK then
// calls execute(challengeId) to drive the actual PIN/OTP UI and complete it.
//
// Reads userToken from the httpOnly cookie set by /api/circle/users — the
// client never needs to hold or resend it for this call.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { circleClient, ARC_TESTNET_BLOCKCHAIN, CIRCLE_USER_TOKEN_COOKIE } from "../../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  const userToken = jar.get(CIRCLE_USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json({ error: "No active Circle session — call /api/circle/users first" }, { status: 401 });
  }

  try {
    const res = await circleClient().createUserPinWithWallets({
      userToken,
      blockchains: [ARC_TESTNET_BLOCKCHAIN],
      // SCA: verified empirically against Circle's sandbox API (both SCA and
      // EOA accepted for ARC-TESTNET, no rejection) — see lib/circle/client.ts.
      accountType: "SCA",
    });
    return NextResponse.json({ challengeId: res.data?.challengeId });
  } catch (e) {
    const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data
      ?? (e as Error)?.message ?? "Unknown error";
    return NextResponse.json({ error: "Wallet creation challenge failed", detail }, { status: 502 });
  }
}
