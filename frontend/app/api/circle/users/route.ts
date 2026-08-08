// app/api/circle/users/route.ts
// First step of the Circle email-OTP lane: resolve (or create) the Circle
// user for a given email, and mint a fresh userToken + encryptionKey.
//
// SECURITY:
//   - CIRCLE_API_KEY never leaves this route (see lib/circle/client.ts).
//   - userToken + encryptionKey are set as httpOnly cookies so this app's
//     OWN server routes (wallets/init, challenge, transactions/[id]) can
//     read them on later requests without the client ever re-transmitting
//     them in a body — per Circle's use-user-controlled-wallets skill:
//     "ALWAYS store userToken and encryptionKey in httpOnly cookies (not
//     localStorage) in production to mitigate XSS token theft."
//   - The SAME values are ALSO returned once in this response body. This
//     isn't a contradiction: Circle's Web SDK (`W3SSdk.setAuthentication`)
//     runs as page JS and structurally needs the raw values to drive the
//     wallet-creation challenge UI — no SDK design lets that call read an
//     httpOnly cookie instead. The httpOnly cookie is what stops a generic
//     XSS payload from silently harvesting the token via `document.cookie`
//     or localStorage at rest; the one-time response body value is held by
//     the client ONLY in React state (never persisted) for the duration of
//     the active wallet-setup flow. This is the intended shape of the
//     tension, not a gap — see Phase H2 report for the full reasoning.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  circleClient,
  deriveUserIdFromEmail,
  CIRCLE_USER_ID_COOKIE,
  CIRCLE_USER_TOKEN_COOKIE,
  CIRCLE_ENCRYPTION_KEY_COOKIE,
  CIRCLE_TOKEN_COOKIE_MAX_AGE_SECONDS,
} from "../../../../lib/circle/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Circle's SDK does NOT throw a raw axios error — it wraps failures in its
// own error class that puts the HTTP status directly on the error object
// (`e.status`), not nested under `.response.status`. Confirmed empirically:
// a duplicate-user call comes back as `{ status: 409, code: 155101,
// message: "Existing user already created...", url, method }`, no
// `.response` property at all. `.response?.status` is kept as a fallback
// only in case some other SDK call path ever throws a differently-shaped
// error, not because it's been observed.
function circleErrorStatus(e: unknown): number | undefined {
  const err = e as { status?: number; response?: { status?: number } };
  return err?.status ?? err?.response?.status;
}

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const userId = deriveUserIdFromEmail(email);
  const client = circleClient();

  try {
    // Idempotent from the caller's perspective: Circle errors if the user
    // already exists, which is the expected (and fine) path for a returning
    // email — swallow that specific case, surface anything else.
    try {
      await client.createUser({ userId });
    } catch (e) {
      if (circleErrorStatus(e) !== 409) throw e;
    }

    const tokenRes = await client.createUserToken({ userId });
    const userToken = tokenRes.data?.userToken;
    const encryptionKey = tokenRes.data?.encryptionKey;
    if (!userToken || !encryptionKey) {
      return NextResponse.json({ error: "Circle did not return a session token" }, { status: 502 });
    }

    const jar = await cookies();
    const cookieOpts = {
      httpOnly: true,
      // secure:true cookies are silently dropped by real browsers over plain
      // HTTP — local dev runs on http://localhost, so this must stay
      // conditional or the whole flow breaks outside production (curl
      // doesn't enforce this distinction, which is why testing this route
      // with curl alone wouldn't have caught it).
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: CIRCLE_TOKEN_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    };
    jar.set(CIRCLE_USER_ID_COOKIE, userId, cookieOpts);
    jar.set(CIRCLE_USER_TOKEN_COOKIE, userToken, cookieOpts);
    jar.set(CIRCLE_ENCRYPTION_KEY_COOKIE, encryptionKey, cookieOpts);

    return NextResponse.json({ userId, userToken, encryptionKey });
  } catch (e) {
    const status = circleErrorStatus(e);
    const message = (e as Error)?.message ?? "Unknown error";
    // Full detail always goes server-side (Vercel function logs), regardless
    // of what the client is shown below.
    console.error("[circle/users] setup failed", { status, code: (e as { code?: unknown })?.code, message });

    // 401/403, or our own circleClient() "not configured" guard, means
    // Flux's own API key/env setup is wrong — an operator problem the
    // caller can't act on, so don't describe it (no env var names, no key
    // material) beyond the log line above. Anything else is Circle's own
    // human-authored message, safe to show as-is.
    const isConfigError = status === 401 || status === 403 || /CIRCLE_API_KEY/.test(message);
    const userMessage = isConfigError
      ? "Couldn't reach the wallet service right now. Please try again shortly."
      : message;
    return NextResponse.json({ error: userMessage, detail: message }, { status: 502 });
  }
}
