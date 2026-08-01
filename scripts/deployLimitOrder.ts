import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Verified on-chain (Phase B): both routers are genuinely deployed on Arc
// Testnet. Seeding the allowlist with these two; add more later via
// setRouterAllowed() as additional routes (Synthra, Circle) get verified.
const XYLONET_ROUTER = process.env.XYLONET_ROUTER || "0x73742278c31a76dBb0D2587d03ef92E6E2141023";
const UNITFLOW_ROUTER = process.env.UNITFLOW_ROUTER || "0x0ef57CC428c851e9a9b7cD97190EF3D3EFe4B631";

async function main() {
  const [deployer] = await ethers.getSigners();
  const initialRouters = [XYLONET_ROUTER, UNITFLOW_ROUTER];

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     FLUX LIMIT ORDER DEPLOYMENT       ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`Network:          ${network.name}`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Seeded routers:   ${initialRouters.join(", ")}\n`);

  const Factory = await ethers.getContractFactory("FluxLimitOrder");

  let limitOrder: any = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`Deploying FluxLimitOrder... (attempt ${attempt}/10)`);
      limitOrder = await Factory.deploy(initialRouters);
      break;
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("txpool is full") || msg.includes("replacement transaction underpriced")) {
        console.log(`  txpool full — waiting 20s...`);
        await new Promise((r) => setTimeout(r, 20_000));
      } else {
        throw err;
      }
    }
  }
  if (!limitOrder) throw new Error("Deploy failed after 10 attempts — try again later.");

  await limitOrder.waitForDeployment();
  const address = await limitOrder.getAddress();

  console.log(`\n✓ FluxLimitOrder deployed to: ${address}`);
  console.log(`  Explorer: https://testnet.arcscan.app/address/${address}\n`);

  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
  fs.writeFileSync(
    path.join(deployDir, `${network.name}-limitorder.json`),
    JSON.stringify(
      { FluxLimitOrder: address, seededRouters: initialRouters, deployer: deployer.address, timestamp: new Date().toISOString() },
      null,
      2,
    ),
  );

  // Merge into frontend/.env.local rather than overwrite — deploy.ts's own
  // write already owns NEXT_PUBLIC_FLUX_ADDRESS etc; this only adds/updates
  // the limit-order key so a second deploy script never clobbers the first.
  const envPath = path.join(__dirname, "..", "frontend", ".env.local");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing.split("\n").filter((l) => l && !l.startsWith("NEXT_PUBLIC_FLUX_LIMIT_ORDER_ADDRESS="));
  lines.push(`NEXT_PUBLIC_FLUX_LIMIT_ORDER_ADDRESS=${address}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n");

  console.log(`✓ frontend/.env.local updated with NEXT_PUBLIC_FLUX_LIMIT_ORDER_ADDRESS\n`);
  console.log("══════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`  Contract: ${address}`);
  console.log("══════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
