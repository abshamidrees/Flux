"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { arcTestnet } from "../lib/arc";

/* wagmi config — using @privy-io/wagmi's createConfig */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cmossicur025d0cl2x79izo9h"
      config={{
        loginMethods: ["wallet", "email", "google", "twitter"],
        appearance: {
          theme: "dark",
          accentColor: "#0f766e",
          logo: "https://flux-app.vercel.app/favicon.ico",
          walletChainType: "ethereum-only",
          showWalletLoginFirst: true,
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
        },
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
        walletConnectCloudProjectId: undefined,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} reconnectOnMount>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
