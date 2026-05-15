# Flux — Complete Setup Guide
# Run this EXACTLY in order. Every step matters.

---

## STEP 1 — Prerequisites

Make sure you have these installed:
- Node.js 18 or higher → check with: node --version
- npm 9 or higher     → check with: npm --version

---

## STEP 2 — Install contract dependencies (root folder)

Open terminal in: C:\Flux\flux\
Run:
  npm install

---

## STEP 3 — Install frontend dependencies

Open terminal in: C:\Flux\flux\frontend\
Run:
  npm install

If you see "peer dependency" warnings → that is FINE, just warnings, not errors.
Do NOT run npm install inside frontend\app\ — that subfolder has no package.json.

---

## STEP 4 — Set up environment

In C:\Flux\flux\frontend\
Copy the example env file:
  copy .env.local.example .env.local

Open .env.local and it will look like this:
  NEXT_PUBLIC_FLUX_ADDRESS=0xYOUR_FLUX_CONTRACT_ADDRESS
  NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
  NEXT_PUBLIC_CHAIN_ID=5042002
  NEXT_PUBLIC_RPC_URL=https://rpc.testnet.arc.network
  NEXT_PUBLIC_EXPLORER_URL=https://testnet.arcscan.app

You can run the frontend without a deployed contract — the dashboard
will show "—" for stats until you deploy. That is normal.

---

## STEP 5 — Run the frontend

In C:\Flux\flux\frontend\
Run:
  npm run dev

Open browser: http://localhost:3000

You should see the Flux landing page.
Click "Launch App" or "Get Started" — it goes to http://localhost:3000/app

---

## STEP 6 — Add Arc Testnet to MetaMask

Open MetaMask → Settings → Networks → Add Network → Add manually:

  Network Name:    Arc Testnet
  RPC URL:         https://rpc.testnet.arc.network
  Chain ID:        5042002
  Currency Symbol: USDC
  Explorer URL:    https://testnet.arcscan.app

---

## STEP 7 — Get test USDC (for Arc testnet)

Go to: https://faucet.circle.com
Select Arc testnet → paste your wallet address → request test USDC

If Arc is not listed on faucet.circle.com yet, check:
https://docs.arc.network for the current testnet faucet URL.

---

## STEP 8 — Deploy the contract (optional for UI testing)

In C:\Flux\flux\
Edit .env file:
  PRIVATE_KEY=your_wallet_private_key
  USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

Run:
  npm run deploy:arc

Output will show your contract address.
The script auto-writes frontend/.env.local with the address.
Restart npm run dev after deploying.

---

## COMMON ERRORS AND FIXES

ERROR: Module not found: Can't resolve '../../lib/arc'
FIX: You are running npm run dev from the wrong folder.
     Must run from: C:\Flux\flux\frontend\   (not from frontend\app\)

ERROR: 'next' is not recognized as a command
FIX: Run npm install in the frontend\ folder first.
     Then run npm run dev from that same folder.

ERROR: Port 3000 is in use
FIX: Normal — Next.js auto-picks 3001, 3002, etc. Use whichever port it shows.

ERROR: Fast Refresh had to perform a full reload
FIX: This is a warning, not an error. The page still works.

WARNING: pino-pretty / @react-native-async-storage warnings
FIX: Already suppressed in next.config.ts. These are harmless.

---

## FOLDER STRUCTURE (for reference)

flux/                        ← ROOT (run contract commands here)
├── contracts/
│   ├── FluxSettlement.sol   ← Main contract
│   └── MockERC20.sol        ← Test mock
├── scripts/
│   └── deploy.ts            ← Deployment script
├── test/
│   └── Flux.test.ts         ← 11 tests
├── hardhat.config.ts
├── package.json             ← npm install here for contracts
├── .env.example
└── frontend/                ← FRONTEND (run npm run dev here)
    ├── app/
    │   ├── page.tsx         ← Landing page (/)
    │   ├── layout.tsx       ← Root layout
    │   ├── providers.tsx    ← Wagmi setup
    │   ├── globals.css      ← Design system
    │   └── app/             ← App section (/app/*)
    │       ├── layout.tsx   ← Dark nav shell
    │       ├── page.tsx     ← Dashboard
    │       ├── batch/       ← Batch settlement
    │       ├── streams/     ← Payment streams
    │       └── agents/      ← Agent registry
    ├── lib/
    │   └── arc.ts           ← ABIs + chain config + helpers
    ├── package.json         ← npm install here for frontend
    ├── .env.local.example   ← Copy to .env.local
    └── tsconfig.json        ← Path aliases configured

