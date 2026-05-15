# Flux — Programmable USDC Payment Rails on Arc

> Batch settlements · Payment streams · AI agent commerce  
> Built on Arc testnet (Chain ID: 5042002) — native USDC gas, sub-second finality

---

## What Is Flux?

Flux is a programmable stablecoin settlement layer on Arc that lets AI agents, DAOs, gig platforms,
and enterprise treasuries schedule, batch, and execute USDC payouts with sub-second deterministic
finality. Arc's native USDC gas means gas cost is literally fractions of a cent — denominated in
dollars, not volatile ETH.

**Key capabilities:**

| Feature | What it does |
|---|---|
| Batch Settlement | Send USDC to up to 500 recipients in one tx |
| Payment Streams | Linear vesting — payroll, grants, contractor agreements |
| Agent Registry | Register AI wallets with spending caps for autonomous commerce |
| 0.1% Platform Fee | Monetization built-in, accumulates in contract for owner withdrawal |

---

## Architecture

```
flux/
├── contracts/
│   ├── FluxSettlement.sol   # Main contract (Arc testnet)
│   └── MockERC20.sol        # Test-only mock USDC
├── scripts/
│   └── deploy.ts            # Deployment script
├── test/
│   └── Flux.test.ts         # Hardhat tests
├── deployments/             # Auto-generated after deploy
│   └── arc_testnet.json
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       # Root layout + providers
│   │   ├── page.tsx         # Dashboard
│   │   ├── batch/page.tsx   # Batch settlement
│   │   ├── streams/page.tsx # Payment streams
│   │   └── agents/page.tsx  # Agent registry
│   ├── components/
│   │   └── NavBar.tsx       # Wallet connect + nav
│   └── lib/
│       └── arc.ts           # Chain config + ABIs + helpers
├── hardhat.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Prerequisites

- Node.js 18+ and npm
- MetaMask (or any injected wallet)
- A wallet with test USDC on Arc testnet
- Git

---

## Step 1 — Clone and Install

```bash
# Root (contracts)
cd flux
npm install

# Frontend
cd frontend
npm install
cd ..
```

---

## Step 2 — Set Up Arc Testnet in MetaMask

1. Open MetaMask → Settings → Networks → Add Network
2. Fill in:
   - **Network Name:** Arc Testnet
   - **RPC URL:** https://rpc.testnet.arc.network
   - **Chain ID:** 5042002
   - **Currency Symbol:** USDC
   - **Explorer:** https://testnet.arcscan.app
3. Save

---

## Step 3 — Get Test USDC

1. Go to https://faucet.circle.com
2. Select the Arc testnet option (or use their testUSDC faucet)
3. Paste your wallet address → request test USDC
4. You need at least ~10 test USDC to run full tests + deployment

> **Note:** If Arc testnet is not listed on faucet.circle.com yet, check
> https://docs.arc.network for the canonical faucet URL — the Arc team may
> maintain their own USDC faucet for testnet builders.

---

## Step 4 — Configure Environment

```bash
# In the root flux/ directory:
cp .env.example .env
```

Edit `.env`:

```
PRIVATE_KEY=your_private_key_without_0x_prefix
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

> **⚠ CRITICAL:** Verify the USDC contract address on Arc testnet before deploying.
> Check https://testnet.arcscan.app → search "USDC" → confirm the canonical Circle USDC address.
> The address above is a placeholder — Arc testnet USDC may differ.

---

## Step 5 — Compile and Test Locally

```bash
# Compile contracts
npm run compile

# Run tests (uses local hardhat node with mock USDC)
npm run test
```

Expected output:
```
  FluxSettlement
    BatchSettle
      ✓ settles to multiple recipients and collects fee
      ✓ reverts on empty batch
      ✓ reverts on length mismatch
    Payment Streams
      ✓ creates a stream
      ✓ cancels stream and refunds sender
    Agent Registry
      ✓ owner registers an agent
      ✓ non-owner cannot register agent
      ✓ agent can pay within budget
      ✓ agent cannot exceed budget cap
    Fee Withdrawal
      ✓ owner can withdraw fees
      ✓ non-owner cannot withdraw fees

  11 passing
```

---

## Step 6 — Deploy to Arc Testnet

```bash
npm run deploy:arc
```

This will:
1. Deploy `FluxSettlement` to Arc testnet
2. Print the contract address
3. Save deployment info to `deployments/arc_testnet.json`
4. **Auto-write** `frontend/.env.local` with the correct contract address

Sample output:
```
╔══════════════════════════════════════╗
║        FLUX DEPLOYMENT                ║
╚══════════════════════════════════════╝

Network:    arc_testnet
Deployer:   0xYourAddress
Balance:    45.500000 USDC

Deploying FluxSettlement...

✓ FluxSettlement deployed to: 0xABC...DEF
  USDC address: 0x036...
  Explorer: https://testnet.arcscan.app/address/0xABC...DEF

✓ Deployment saved to: deployments/arc_testnet.json
✓ Frontend .env.local updated
```

---

## Step 7 — Run Frontend Locally

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

You should see:
- Dashboard with live contract stats
- Batch Settlement page (CSV upload + manual entry)
- Payment Streams page (create + withdraw)
- Agents page (register + fund + lookup)

---

## Step 8 — Deploy Frontend to Vercel (Free)

```bash
# Install Vercel CLI if needed
npm install -g vercel

cd frontend
vercel

# Follow prompts:
# - Link to existing project or create new
# - Root directory: ./ (you're already in frontend/)
# - Framework: Next.js (auto-detected)
```

Or:
1. Push to GitHub
2. Go to vercel.com → Import Project → Select your repo
3. Set root directory to `flux/frontend`
4. Add environment variables from `frontend/.env.local`
5. Deploy

---

## Contract Usage Reference

### Batch Settle

```javascript
// Frontend (wagmi writeContract)
await writeContract({
  address: FLUX_ADDRESS,
  abi: FLUX_ABI,
  functionName: "batchSettle",
  args: [
    ["0xRecipient1", "0xRecipient2"],  // recipients
    [1000000n, 500000n],                // amounts in USDC (6 decimals)
  ],
});
// Must approve USDC first: total + 0.1% fee
```

### Create Stream

```javascript
await writeContract({
  address: FLUX_ADDRESS,
  abi: FLUX_ABI,
  functionName: "createStream",
  args: [
    "0xRecipient",    // recipient
    1000000000n,      // 1000 USDC
    BigInt(startUnix),
    BigInt(endUnix),
  ],
});
```

### Register Agent

```javascript
// Owner only
await writeContract({
  address: FLUX_ADDRESS,
  abi: FLUX_ABI,
  functionName: "registerAgent",
  args: ["0xAgentWallet", "Treasury Bot", 500000000n], // 500 USDC cap
});
```

### Agent Pay (called by agent wallet itself)

```javascript
// The registered agent wallet calls this
await writeContract({
  address: FLUX_ADDRESS,
  abi: FLUX_ABI,
  functionName: "agentPay",
  args: ["0xRecipient", 50000000n], // 50 USDC
});
```

---

## Monetization

| Revenue Source | Rate | Notes |
|---|---|---|
| Batch settlement fee | 0.1% of volume | Auto-collected, withdrawable by owner |
| Stream creation fee | None (V1) | Can add in V2 |
| Agent registration | None (V1) | Can add subscription model in V2 |

**Owner withdraws fees:**
```bash
# Via frontend (Admin section — add in V2)
# Or directly via ArcScan's write contract tab
withdrawFees()
```

---

## Builder Rewards Strategy

| Program | Status | Action |
|---|---|---|
| Arc Builders Fund | Waitlist | arc.network/builders-fund — sign up |
| Arc Discord | Live | discord.com/invite/buildonarc — share demo |
| Arc testnet activity | Live | Every tx on testnet = builder signal |

---

## Verified Contract Addresses

After deployment, your `deployments/arc_testnet.json` will contain:

```json
{
  "network": "arc_testnet",
  "chainId": "5042002",
  "FluxSettlement": "0x...",
  "USDC": "0x...",
  "deployer": "0x...",
  "timestamp": "2026-04-XX",
  "blockNumber": XXXXXX
}
```

Verify on ArcScan:
```bash
npx hardhat verify --network arc_testnet YOUR_CONTRACT_ADDRESS "YOUR_USDC_ADDRESS"
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Contracts | Solidity ^0.8.20, Hardhat |
| Frontend | Next.js 15, React 19 |
| Web3 | viem + wagmi v2 |
| CSV parsing | PapaParse |
| Styling | Tailwind CSS + inline styles |
| Deployment | Vercel (free tier) |
| Chain | Arc testnet (Chain ID: 5042002) |
| Gas token | USDC (native on Arc) |

---

## Troubleshooting

**"USDC pull failed" on batchSettle**
→ You forgot to call `approve()` first. The frontend handles this automatically.
→ Make sure you have enough USDC: total + 0.1% fee.

**"Not owner" on registerAgent**
→ Only the deployer wallet can register agents. Connect with your deployer wallet.

**MetaMask not connecting**
→ Make sure Arc testnet is added with exact chain ID 5042002.
→ Try adding manually in MetaMask Advanced Settings.

**"Nothing to claim" on withdrawFromStream**
→ The stream hasn't started yet, or all vested amount has been claimed already.

---

## License

MIT
