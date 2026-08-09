"use client";
// components/wallet/ConnectModal.tsx
// Connect modal — "Connect wallet" (Privy, external browser wallets) only.
//
// The "Continue with email" (Circle) lane is deliberately DISABLED here, not
// deleted — its wiring (lib/circle/useCircleWallet.ts, lib/wallet/
// WalletContext.tsx's circle* fields, app/api/circle/*) is untouched and
// still fully present, just not rendered. Reason: the flow derives a Circle
// userId straight from the typed email (flux-${sha256(email)}) and mints a
// session token with zero proof the caller actually owns that inbox — there
// was never a real email-OTP verification step in front of it. Combined
// with the "reuse an existing wallet if found" fast path added to remove
// friction for returning users, this meant typing ANY previously-used email
// (no code, no PIN) was enough to land on that wallet's address as if
// logged in. Re-enable only once Circle confirms the right way to gate this
// (their createDeviceTokenForEmailLogin + OTP flow is the likely fix) —
// see the message drafted for their support team.
import { useEffect } from "react";
import { FluxMark } from "../UI";
import { useWallet } from "../../lib/wallet/WalletContext";

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ConnectModal() {
  const { connectModalOpen, closeConnectModal, connectExternal, isConnected } = useWallet();

  // Auto-close once connected.
  useEffect(() => {
    if (connectModalOpen && isConnected) closeConnectModal();
  }, [connectModalOpen, isConnected, closeConnectModal]);

  if (!connectModalOpen) return null;

  const handleExternal = () => {
    connectExternal();
    // Privy drives its own hosted modal from here; ours steps aside rather
    // than stacking on top of it.
    closeConnectModal();
  };

  return (
    <div className="modal-overlay" onClick={closeConnectModal}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-hd">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <FluxMark size={22} />
            <h3>Connect to Flux</h3>
          </div>
          <button onClick={closeConnectModal} className="icon-btn" aria-label="Close" style={{ width: 30, height: 30 }}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <button className="btn btn-primary btn-full" onClick={handleExternal}>
            Connect wallet
          </button>
        </div>
      </div>
    </div>
  );
}
