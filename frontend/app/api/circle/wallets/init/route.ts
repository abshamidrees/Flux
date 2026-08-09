// app/api/circle/wallets/init/route.ts
// Creates the wallet-creation challenge. Two Circle methods cover this:
//   - createUserPinWithWallets: first-time users — sets up their PIN AND
//     creates a wallet in one challenge.
//   - createWallet: a user who already has a PIN (from an earlier session)
//     but needs a wallet on this chain — createUserPinWithWallets rejects
//     these with Circle error code 155106 "The user had already been
//     initialized," since PIN setup is a one-time thing.
// Confirmed empirically against the real sandbox API: a returning user with
// an existing PIN always hit that rejection, which used to surface as a
// flat, dead-end "Wallet creation challenge failed." In practice the client
// should rarely even reach this route for a user who already has a wallet —
// useCircleWallet checks GET /api/circle/wallets first and skips straight to
// it — so this mainly covers "has a PIN, first wallet on ARC-TESTNET."
//
// Reads userToken from the httpOnly cookie set by /api/circle/users — the
// client never needs to hold or resend it for this call.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { circleClient, ARC_TESTNET_BLOCKCHAIN, CIRCLE_USER_TOKEN_COOKIE, circleErrorCode, safeCircleErrorMessage } from "../../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALREADY_INITIALIZED_CODE = 155106;

export async function POST() {
  const jar = await cookies();
  const userToken = jar.get(CIRCLE_USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json({ error: "No active Circle session — call /api/circle/users first" }, { status: 401 });
  }

  // SCA: verified empirically against Circle's sandbox API (both SCA and EOA
  // accepted for ARC-TESTNET, no rejection) — see lib/circle/client.ts.
  const walletParams = { userToken, blockchains: [ARC_TESTNET_BLOCKCHAIN], accountType: "SCA" as const };

  try {
    let challengeId: string | undefined;
    try {
      const res = await circleClient().createUserPinWithWallets(walletParams);
      challengeId = res.data?.challengeId;
    } catch (e) {
      if (circleErrorCode(e) !== ALREADY_INITIALIZED_CODE) throw e;
      const res = await circleClient().createWallet(walletParams);
      challengeId = res.data?.challengeId;
    }
    return NextResponse.json({ challengeId });
  } catch (e) {
    const userMessage = safeCircleErrorMessage(e, "circle/wallets/init");
    return NextResponse.json({ error: userMessage }, { status: 502 });
  }
}
