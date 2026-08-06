import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Arc testnet ERC20 USDC — system contract, verified (same address every
// other deploy script and lib/arc.ts uses; NOT the Base Sepolia address).
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   FLUX AGENT REGISTRY DEPLOYMENT      ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`Network:    ${network.name}`);
  console.log(`Deployer:   ${deployer.address}`);
  console.log(`USDC:       ${USDC_ADDRESS}\n`);

  const Factory = await ethers.getContractFactory("FluxAgentRegistry");

  let registry: any = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`Deploying FluxAgentRegistry... (attempt ${attempt}/10)`);
      registry = await Factory.deploy(USDC_ADDRESS);
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
  if (!registry) throw new Error("Deploy failed after 10 attempts — try again later.");

  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log(`\n✓ FluxAgentRegistry deployed to: ${address}`);
  console.log(`  Explorer: https://testnet.arcscan.app/address/${address}\n`);

  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
  fs.writeFileSync(
    path.join(deployDir, `${network.name}-agentregistry.json`),
    JSON.stringify(
      { FluxAgentRegistry: address, USDC: USDC_ADDRESS, deployer: deployer.address, timestamp: new Date().toISOString() },
      null,
      2,
    ),
  );

  // Merge into frontend/.env.local rather than overwrite — same rationale as
  // deployLimitOrder.ts: deploy.ts's own write already owns
  // NEXT_PUBLIC_FLUX_ADDRESS etc, and this file also now holds Circle's
  // CIRCLE_API_KEY / NEXT_PUBLIC_CIRCLE_APP_ID (Phase H2) which a naive
  // overwrite would silently destroy.
  const envPath = path.join(__dirname, "..", "frontend", ".env.local");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing.split("\n").filter((l) => l && !l.startsWith("NEXT_PUBLIC_FLUX_AGENT_REGISTRY_ADDRESS="));
  lines.push(`NEXT_PUBLIC_FLUX_AGENT_REGISTRY_ADDRESS=${address}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n");

  console.log(`✓ frontend/.env.local updated with NEXT_PUBLIC_FLUX_AGENT_REGISTRY_ADDRESS\n`);
  console.log("══════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`  Contract: ${address}`);
  console.log("══════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
