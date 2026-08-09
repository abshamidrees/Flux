// lib/circle/client.ts
// Server-only Circle User-Controlled Wallets client. Never import this from
// a "use client" file — CIRCLE_API_KEY must never reach the browser bundle
// (Next.js would silently omit it since it's not NEXT_PUBLIC_-prefixed, but
// importing this module from client code is still a mistake worth avoiding).
//
// Blockchain identifier verified against the SDK's own compiled types
// (node_modules/@circle-fin/user-controlled-wallets/dist/types/clients/
// configurations.d.ts) rather than the doc site: `TestnetBlockchain.ArcTestnet
// = "ARC-TESTNET"` is real. Confirmed live too — a throwaway script hit
// Circle's sandbox API directly and both `accountType: "SCA"` and `"EOA"`
// were accepted for blockchains: ["ARC-TESTNET"] (real challengeIds back,
// no rejection). SCA chosen: unlocks batch execution (relevant to Part 2's
// agent flows) and is Circle's forward path for Agent Wallets, which are
// built on top of user-controlled wallets. Gas Station sponsorship — SCA's
// other headline benefit — is moot on Arc specifically, since gas here IS
// USDC, not a separate native token the user needs to acquire.
import { createHash } from "crypto";
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

export const ARC_TESTNET_BLOCKCHAIN = "ARC-TESTNET" as const;

let client: ReturnType<typeof initiateUserControlledWalletsClient> | null = null;

export function circleClient() {
  if (client) return client;
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY not configured");
  client = initiateUserControlledWalletsClient({ apiKey });
  return client;
}

// ── Cookie names — shared between routes so they agree on what to read/write ──
export const CIRCLE_USER_ID_COOKIE = "circle_user_id";
export const CIRCLE_USER_TOKEN_COOKIE = "circle_user_token";
export const CIRCLE_ENCRYPTION_KEY_COOKIE = "circle_encryption_key";

// userToken expires in 60 minutes per Circle's docs; cookie TTL matches so a
// stale cookie doesn't outlive the token it names.
export const CIRCLE_TOKEN_COOKIE_MAX_AGE_SECONDS = 60 * 60;

// Circle's own docs are explicit that identity resolution is the calling
// app's responsibility — Circle does not auto-map email/social identity to
// a userId (verified against the use-user-controlled-wallets skill). Flux
// has no backend user database, so for the email lane specifically, userId
// is deterministically derived from the email itself: same email always
// resolves to the same Circle user, with zero infra beyond this hash. This
// only covers the email-OTP lane — Google/Apple social login needs OAuth
// app credentials (client IDs, and Firebase config for Apple) that haven't
// been provided yet, so it's deliberately not wired in this pass.
export function deriveUserIdFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `flux-${digest}`;
}

// ── Shared error handling for Circle SDK calls ──────────────────────────
// The SDK does NOT throw raw axios errors — it wraps failures in its own
// error class that puts the HTTP status and Circle's numeric error code
// directly on the error object (`e.status`, `e.code`), not nested under
// `.response`. Confirmed empirically against the real sandbox API (e.g. a
// duplicate-user call: `{ status: 409, code: 155101, message }`, no
// `.response` at all). `.response?.status` is kept as a fallback only in
// case some call path ever throws a differently-shaped error.
export function circleErrorStatus(e: unknown): number | undefined {
  const err = e as { status?: number; response?: { status?: number } };
  return err?.status ?? err?.response?.status;
}

export function circleErrorCode(e: unknown): number | undefined {
  return (e as { code?: number })?.code;
}

// Always logs full detail server-side, then returns a message safe to hand
// to the client: Circle's own error messages are human-authored and don't
// contain secrets, so they're shown as-is — EXCEPT 401/403 or our own
// circleClient() "not configured" guard, which mean Flux's own API key/env
// setup is wrong (an operator problem the caller can't act on), so those
// get a generic message instead of leaking env var names or auth details.
export function safeCircleErrorMessage(e: unknown, logTag: string): string {
  const status = circleErrorStatus(e);
  const code = circleErrorCode(e);
  const message = (e as Error)?.message ?? "Unknown error";
  console.error(`[${logTag}] Circle request failed`, { status, code, message });

  const isConfigError = status === 401 || status === 403 || /CIRCLE_API_KEY/.test(message);
  return isConfigError ? "Couldn't reach the wallet service right now. Please try again shortly." : message;
}
