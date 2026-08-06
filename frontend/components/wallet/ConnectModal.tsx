"use client";
// components/wallet/ConnectModal.tsx
// The two-lane connect modal (spec: Phase H Part 1) — "Connect wallet"
// (Privy, external browser wallets) and "Continue with email" (Circle,
// non-custodial MPC via email OTP). Mounted once in app/providers.tsx so any
// call site can trigger it via useWallet().openConnectModal() without
// prop-drilling or mounting its own copy.
//
// Social login (Google/Apple) isn't offered here yet — it needs OAuth app
// credentials (client IDs, Firebase config for Apple) that haven't been
// provided. Showing a button that would fail on click is worse than not
// showing it; email OTP needs no such external registration and covers the
// "Continue with email or social" spec's email half completely.
import { useEffect, useState } from "react";
import { FluxMark } from "../UI";
import { useWallet } from "../../lib/wallet/WalletContext";

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const STATUS_LABEL: Record<string, string> = {
  "creating-user": "Setting up your account…",
  "awaiting-challenge": "Waiting for you to confirm…",
  "resolving-wallet": "Finishing up…",
};

export function ConnectModal() {
  const {
    connectModalOpen, closeConnectModal, connectExternal,
    circleStatus, circleError, connectEmail, resetCircle, isConnected,
  } = useWallet();
  const [lane, setLane] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");

  const busy = circleStatus !== "idle" && circleStatus !== "error";

  // Auto-close once either lane actually connects.
  useEffect(() => {
    if (connectModalOpen && isConnected) closeConnectModal();
  }, [connectModalOpen, isConnected, closeConnectModal]);

  if (!connectModalOpen) return null;

  const handleClose = () => {
    closeConnectModal();
    setLane("choose");
    resetCircle();
  };

  const handleExternal = () => {
    connectExternal();
    // Privy drives its own hosted modal from here; ours steps aside rather
    // than stacking on top of it.
    closeConnectModal();
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void connectEmail(email);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-hd">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <FluxMark size={22} />
            <h3>Connect to Flux</h3>
          </div>
          <button onClick={handleClose} className="icon-btn" aria-label="Close" style={{ width: 30, height: 30 }}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          {lane === "choose" ? (
            <>
              <button className="btn btn-secondary btn-full" onClick={handleExternal}>
                Connect wallet
              </button>
              <div style={{ textAlign: "center", color: "var(--tx3)", fontSize: 11, fontWeight: 600, margin: "14px 0" }}>OR</div>
              <button className="btn btn-primary btn-full" onClick={() => setLane("email")}>
                Continue with email
              </button>
            </>
          ) : (
            <form onSubmit={handleEmailSubmit}>
              <label className="lbl" htmlFor="connect-email">Email</label>
              <input
                id="connect-email"
                className="inp"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={busy}
                autoFocus
              />
              {/* Recovery limitation — shown once, plainly, at wallet creation
                  (spec requirement, not buried in fine print elsewhere). */}
              <p style={{ fontSize: 11.5, color: "var(--tx3)", marginTop: 12, lineHeight: 1.6 }}>
                This wallet is non-custodial — secured by your device and Circle, not by Flux.
                If you lose access to this email, nobody (Flux included) can recover it. There is no backup.
              </p>
              {circleError && (
                <div className="banner err" style={{ marginTop: 12 }}>{circleError}</div>
              )}
              <button type="submit" className="btn btn-primary btn-full" disabled={busy} style={{ marginTop: 14 }}>
                {busy ? STATUS_LABEL[circleStatus] ?? "Working…" : "Continue"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-full"
                onClick={() => { setLane("choose"); resetCircle(); }}
                disabled={busy}
                style={{ marginTop: 8 }}
              >
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
