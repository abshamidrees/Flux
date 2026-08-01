import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    // Silence wallet lib warnings that don't affect browser builds
    config.resolve.alias = {
      ...config.resolve.alias,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
      // ws's optional native addons — unused in the browser (WalletConnect via
      // Privy pulls in ws transitively); their prebuilt binaries aren't always
      // present on Windows installs and webpack fails resolving them statically.
      "utf-8-validate": false,
      "bufferutil": false,
    };
    return config;
  },
};

export default nextConfig;
