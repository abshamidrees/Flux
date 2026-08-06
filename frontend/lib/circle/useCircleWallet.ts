"use client";
// lib/circle/useCircleWallet.ts
// Drives the Circle email-OTP wallet-creation flow end to end:
//   POST /api/circle/users (resolve/create the Circle user + mint a session)
//   -> sdk.getDeviceId() (required before execute(), or it silently fails
//      per Circle's own docs — this is not defensive boilerplate)
//   -> POST /api/circle/wallets/init (create the wallet-creation challenge)
//   -> sdk.execute(challengeId) (Circle's hosted iframe drives PIN/OTP UI)
//   -> GET /api/circle/wallets (resolve the address — execute()'s own
//      callback only ever reports {type, status}, never the wallet itself)
//
// Types (Configs, Authentication, ChallengeCompleteCallback, ChallengeStatus)
// aren't re-exported from the package root — only the W3SSdk class is (per
// its compiled dist/src/index.d.ts) — so object literals are inlined below
// and TypeScript infers their shape contextually from W3SSdk's own method
// signatures, rather than importing types that aren't actually exported.
import { useCallback, useRef, useState } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

export type CircleWalletStatus =
  | "idle"
  | "creating-user"
  | "awaiting-challenge"
  | "resolving-wallet"
  | "connected"
  | "error";

export interface CircleWallet {
  id: string;
  address: `0x${string}`;
}

async function jsonOrThrow(res: Response, fallbackMessage: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || fallbackMessage);
  return data;
}

export function useCircleWallet() {
  const [status, setStatus] = useState<CircleWalletStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<CircleWallet | null>(null);
  const sdkRef = useRef<W3SSdk | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setWallet(null);
    sdkRef.current = null;
  }, []);

  const connectWithEmail = useCallback(async (email: string) => {
    setError(null);
    try {
      setStatus("creating-user");
      const userData = await jsonOrThrow(
        await fetch("/api/circle/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }),
        "Failed to set up your Circle account",
      );

      const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID;
      if (!appId) throw new Error("Circle is not configured (NEXT_PUBLIC_CIRCLE_APP_ID missing)");

      const sdk = new W3SSdk({
        appSettings: { appId },
        authentication: { userToken: userData.userToken, encryptionKey: userData.encryptionKey },
      });
      sdkRef.current = sdk;
      await sdk.getDeviceId();

      setStatus("awaiting-challenge");
      const initData = await jsonOrThrow(
        await fetch("/api/circle/wallets/init", { method: "POST" }),
        "Failed to start wallet creation",
      );
      const challengeId = initData.challengeId as string | undefined;
      if (!challengeId) throw new Error("Circle did not return a challenge");

      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (err, result) => {
          if (err) {
            reject(new Error(err.message || "Wallet setup failed"));
            return;
          }
          if (result?.status !== "COMPLETE") {
            reject(new Error(`Wallet setup ${result?.status?.toLowerCase() || "did not complete"}`));
            return;
          }
          resolve();
        });
      });

      setStatus("resolving-wallet");
      const walletsData = await jsonOrThrow(await fetch("/api/circle/wallets"), "Failed to load your wallet");
      const created = walletsData.wallets?.[0];
      if (!created?.address) throw new Error("Wallet was created but could not be found");

      setWallet({ id: created.id, address: created.address as `0x${string}` });
      setStatus("connected");
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
      setStatus("error");
    }
  }, []);

  const runChallenge = useCallback(async (challengeId: string) => {
    const sdk = sdkRef.current;
    if (!sdk) throw new Error("Circle wallet is not connected");
    return new Promise<{ status: string; signature?: string }>((resolve, reject) => {
      sdk.execute(challengeId, (err, result) => {
        if (err) {
          reject(new Error(err.message || "Action failed"));
          return;
        }
        if (result?.status !== "COMPLETE") {
          reject(new Error(`Action ${result?.status?.toLowerCase() || "did not complete"}`));
          return;
        }
        const signature = "data" in result && result.data && "signature" in result.data
          ? result.data.signature
          : undefined;
        resolve({ status: result.status, signature });
      });
    });
  }, []);

  const signMessage = useCallback(async (message: string) => {
    if (!wallet) throw new Error("Circle wallet is not connected");
    const data = await jsonOrThrow(
      await fetch("/api/circle/sign-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: wallet.id, message }),
      }),
      "Failed to start message signing",
    );
    if (!data.challengeId) throw new Error("Circle did not return a challenge");
    const { signature } = await runChallenge(data.challengeId);
    if (!signature) throw new Error("Circle completed the challenge but returned no signature");
    return signature;
  }, [wallet, runChallenge]);

  // Executes a contract call (batch settle, stream, agent payment, etc.) via
  // the Circle wallet. Confirms the challenge reached COMPLETE — a real
  // signal Circle broadcast it — then polls GET /api/circle/transactions/[id]
  // to a terminal chain state before returning, matching this app's rule
  // that nothing reports success without a checked receipt (the same role
  // publicClient.waitForTransactionReceipt plays for the on-chain-native
  // routes). transactionId is resolved server-side at challenge-creation
  // time — see the comment in app/api/circle/challenge/route.ts for why.
  const sendTransaction = useCallback(async (params: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => {
    if (!wallet) throw new Error("Circle wallet is not connected");
    const initData = await jsonOrThrow(
      await fetch("/api/circle/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: wallet.id,
          contractAddress: params.to,
          callData: params.data,
          ...(params.value ? { amount: params.value.toString() } : {}),
        }),
      }),
      "Failed to start transaction",
    );
    if (!initData.challengeId) throw new Error("Circle did not return a challenge");
    if (!initData.transactionId) throw new Error("Circle did not return a transaction to track");

    await runChallenge(initData.challengeId);

    // Poll to a terminal state — same pattern as the keeper route's
    // publicClient.waitForTransactionReceipt, just over Circle's REST API
    // instead of an RPC. COMPLETE/CONFIRMED are Circle's terminal-success
    // states; anything else terminal is a real failure, not assumed success.
    const terminal = new Set(["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"]);
    for (let attempt = 0; attempt < 30; attempt++) {
      const txRes = await fetch(`/api/circle/transactions/${initData.transactionId}`);
      const tx = await txRes.json().catch(() => ({}));
      if (txRes.ok && tx?.transaction?.state && terminal.has(tx.transaction.state)) {
        if (tx.transaction.state === "FAILED" || tx.transaction.state === "CANCELLED" || tx.transaction.state === "DENIED") {
          throw new Error(`Transaction ${tx.transaction.state.toLowerCase()}`);
        }
        return { txHash: tx.transaction.txHash as string | undefined, transactionId: initData.transactionId as string };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Timed out waiting for the transaction to confirm");
  }, [wallet, runChallenge]);

  return { status, error, wallet, connectWithEmail, signMessage, sendTransaction, reset };
}
