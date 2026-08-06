"use client";
// lib/wallet/WalletContext.tsx
// The unified wallet abstraction Phase H2 exists to introduce: downstream
// code reads ONE interface regardless of whether the connected account came
// from Privy (external wallets — MetaMask, Rabby, etc.) or Circle (email OTP,
// non-custodial MPC). Both lanes resolve to {address, chainId, source}, and
// signMessage/sendTransaction work for either.
//
// Scope note (Phase H2, updated at close-out): this introduces the
// abstraction and makes it fully correct for wallet CONNECTION (both lanes)
// and for EXECUTION when code is written against useWallet() directly —
// including writeContract(), an ABI-aware wrapper around sendTransaction
// added at close-out so migrating an existing wagmi writeContractAsync call
// site is close to a drop-in rename. app/app/agents/page.tsx (Phase H5,
// written in the same close-out pass as this note) is fully migrated:
// connection state AND every write call go through this context, so an
// agent-registry action works identically whether the connected wallet is
// Privy or Circle.
//
// swap/batch/streams (pre-existing, tested flows from earlier phases) are
// NOT migrated — they still read wagmi's useAccount/useWriteContract/
// useSendTransaction directly, which keeps working unchanged for the Privy
// lane (Privy IS a wagmi connector) but won't recognize a Circle wallet.
// Deliberate, not an oversight: rewriting several already-working financial
// flows' execution paths in the same pass as everything else here traded
// well against regression risk for a benefit (Circle-wallet swap/batch/
// stream support) nobody asked for yet. Their CONNECTION-STATE reads
// (address/authenticated) were still updated to route through useWallet()
// where doing so is safe (see each page) — what's deliberately deferred is
// specifically the write-execution path, and each such page says so.
// Building a full custom wagmi Connector for Circle (so every existing call
// site works transparently with either source with zero per-page changes)
// is the more thorough fix — Circle's challenge/execute/poll signing model
// doesn't fit a standard synchronous-ish injected-provider connector, so
// that's real, separate work for whichever phase first needs it.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useChainId, useDisconnect, useSendTransaction, useSignMessage } from "wagmi";
import { encodeFunctionData, type Abi } from "viem";
import { useCircleWallet, type CircleWalletStatus } from "../circle/useCircleWallet";
import { arcTestnet } from "../arc";

export type WalletSource = "privy" | "circle" | null;

interface SendTransactionParams {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

interface WalletContextValue {
  address: `0x${string}` | null;
  chainId: number | null;
  source: WalletSource;
  isConnected: boolean;

  // The two-lane connect modal — rendered once at the provider root
  // (see components/wallet/ConnectModal.tsx, mounted in app/providers.tsx)
  // so any call site can open it without prop-drilling or mounting its own.
  connectModalOpen: boolean;
  openConnectModal: () => void;
  closeConnectModal: () => void;

  // Privy lane (external wallets)
  connectExternal: () => void;

  // Circle lane (email OTP, non-custodial MPC)
  circleStatus: CircleWalletStatus;
  circleError: string | null;
  connectEmail: (email: string) => Promise<void>;
  resetCircle: () => void;

  // Shared, source-agnostic actions
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;
  sendTransaction: (params: SendTransactionParams) => Promise<{ txHash: string | undefined }>;
  /**
   * ABI-aware convenience wrapper around sendTransaction — encodes the call
   * with viem's encodeFunctionData first. Exists so migrating an existing
   * wagmi writeContractAsync({address, abi, functionName, args}) call site
   * to the unified context is close to a drop-in rename, not a rewrite.
   */
  writeContract: (params: { address: `0x${string}`; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint }) => Promise<{ txHash: string | undefined }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { login, logout, authenticated } = usePrivy();
  const { address: privyAddress } = useAccount();
  const wagmiChainId = useChainId();
  const { disconnectAsync: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const circle = useCircleWallet();
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  // Privy takes priority if both were ever simultaneously present — the
  // connect modal only ever offers one lane at a time, so this shouldn't
  // normally happen, but Privy is the app's pre-existing default.
  const isPrivyConnected = authenticated && !!privyAddress;
  const source: WalletSource = isPrivyConnected ? "privy" : circle.wallet ? "circle" : null;
  const address = isPrivyConnected ? (privyAddress as `0x${string}`) : circle.wallet?.address ?? null;
  const chainId = source === "privy" ? wagmiChainId : source === "circle" ? arcTestnet.id : null;

  const disconnect = useCallback(() => {
    if (isPrivyConnected) {
      logout();
      void wagmiDisconnect();
    }
    circle.reset();
  }, [isPrivyConnected, logout, wagmiDisconnect, circle]);

  const signMessage = useCallback(async (message: string) => {
    if (source === "privy") return signMessageAsync({ message });
    if (source === "circle") return circle.signMessage(message);
    throw new Error("No wallet connected");
  }, [source, signMessageAsync, circle]);

  const sendTransaction = useCallback(async (params: SendTransactionParams) => {
    if (source === "privy") {
      const hash = await sendTransactionAsync({ to: params.to, data: params.data, value: params.value });
      return { txHash: hash };
    }
    if (source === "circle") return circle.sendTransaction(params);
    throw new Error("No wallet connected");
  }, [source, sendTransactionAsync, circle]);

  const writeContract = useCallback(async (params: { address: `0x${string}`; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint }) => {
    const data = encodeFunctionData({ abi: params.abi as Abi, functionName: params.functionName, args: params.args as readonly unknown[] | undefined }) as `0x${string}`;
    return sendTransaction({ to: params.address, data, value: params.value });
  }, [sendTransaction]);

  const openConnectModal = useCallback(() => setConnectModalOpen(true), []);
  const closeConnectModal = useCallback(() => setConnectModalOpen(false), []);

  const value = useMemo<WalletContextValue>(() => ({
    address,
    chainId,
    source,
    isConnected: !!address,
    connectModalOpen,
    openConnectModal,
    closeConnectModal,
    connectExternal: login,
    circleStatus: circle.status,
    circleError: circle.error,
    connectEmail: circle.connectWithEmail,
    resetCircle: circle.reset,
    disconnect,
    signMessage,
    sendTransaction,
    writeContract,
  }), [address, chainId, source, connectModalOpen, openConnectModal, closeConnectModal, login, circle, disconnect, signMessage, sendTransaction, writeContract]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
