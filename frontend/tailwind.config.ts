import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        syne: ["'Syne'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        flux: { DEFAULT:"#f59e0b", dim:"rgba(245,158,11,0.08)" },
        mint: { DEFAULT:"#16c98d" },
        teal: { DEFAULT:"#0d9488" },
        navy: { DEFAULT:"#070e1c" },
        app:  { bg:"#070b11", s1:"#0c1119", s2:"#111827" },
      },
    },
  },
  plugins: [],
};
export default config;
