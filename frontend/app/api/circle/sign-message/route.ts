// app/api/circle/sign-message/route.ts
// Creates a message-signing challenge — the Circle-side counterpart of the
// unified wallet context's signMessage(). Like every other Circle route
// here, this only creates the challenge; sdk.execute(challengeId) still has
// to run client-side for the user to actually approve it.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { circleClient, CIRCLE_USER_TOKEN_COOKIE } from "../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const jar = await cookies();
  const userToken = jar.get(CIRCLE_USER_TOKEN_COOKIE)?.value;
  if (!userToken) {
    return NextResponse.json({ error: "No active Circle session — call /api/circle/users first" }, { status: 401 });
  }

  let body: { walletId?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const walletId = typeof body.walletId === "string" ? body.walletId : "";
  const message = typeof body.message === "string" ? body.message : "";
  if (!walletId || !message) {
    return NextResponse.json({ error: "walletId and message are required" }, { status: 400 });
  }

  try {
    const res = await circleClient().signMessage({ userToken, walletId, message });
    return NextResponse.json({ challengeId: res.data?.challengeId });
  } catch (e) {
    const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data
      ?? (e as Error)?.message ?? "Unknown error";
    return NextResponse.json({ error: "Sign-message challenge failed", detail }, { status: 502 });
  }
}
