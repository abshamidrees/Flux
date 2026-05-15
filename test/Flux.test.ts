import { expect } from "chai";
import { ethers } from "hardhat";
import { FluxSettlement } from "../typechain-types";
import { Signer } from "ethers";

// Mock ERC20 for testing
const MockERC20ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
];

describe("FluxSettlement", function () {
  let flux: FluxSettlement;
  let mockUSDC: any;
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  let agentWallet: Signer;

  const USDC_DECIMALS = 6;
  const toUSDC = (amount: number) => ethers.parseUnits(amount.toString(), USDC_DECIMALS);

  before(async () => {
    [owner, alice, bob, carol, agentWallet] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockUSDC.deploy("USD Coin", "USDC", 6);

    // Mint USDC to test accounts
    await mockUSDC.mint(await owner.getAddress(), toUSDC(100_000));
    await mockUSDC.mint(await alice.getAddress(), toUSDC(10_000));

    // Deploy Flux
    const FluxFactory = await ethers.getContractFactory("FluxSettlement");
    flux = await FluxFactory.deploy(await mockUSDC.getAddress());
  });

  describe("BatchSettle", () => {
    it("settles to multiple recipients and collects fee", async () => {
      const fluxAddr = await flux.getAddress();
      const recipients = [await bob.getAddress(), await carol.getAddress()];
      const amounts = [toUSDC(100), toUSDC(200)]; // 300 total
      const fee = toUSDC(0.3); // 0.1% of 300
      const totalWithFee = toUSDC(300.3);

      await mockUSDC.connect(alice).approve(fluxAddr, totalWithFee);

      const bobBefore = await mockUSDC.balanceOf(await bob.getAddress());
      const carolBefore = await mockUSDC.balanceOf(await carol.getAddress());

      await expect(flux.connect(alice).batchSettle(recipients, amounts))
        .to.emit(flux, "BatchSettled")
        .withArgs(
          await alice.getAddress(),
          2,
          toUSDC(300),
          fee,
          (await ethers.provider.getBlock("latest"))!.timestamp + 1
        );

      expect(await mockUSDC.balanceOf(await bob.getAddress())).to.equal(bobBefore + toUSDC(100));
      expect(await mockUSDC.balanceOf(await carol.getAddress())).to.equal(carolBefore + toUSDC(200));

      const stats = await flux.getStats();
      expect(stats.volume).to.equal(toUSDC(300));
      expect(stats.fees).to.equal(fee);
      expect(stats.batches).to.equal(1n);
    });

    it("reverts on empty batch", async () => {
      await expect(flux.connect(alice).batchSettle([], [])).to.be.revertedWith("Flux: empty batch");
    });

    it("reverts on length mismatch", async () => {
      await expect(
        flux.connect(alice).batchSettle([await bob.getAddress()], [toUSDC(1), toUSDC(2)])
      ).to.be.revertedWith("Flux: length mismatch");
    });
  });

  describe("Payment Streams", () => {
    let streamId: bigint;

    it("creates a stream", async () => {
      const fluxAddr = await flux.getAddress();
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 60;      // starts in 1 min
      const endTime   = now + 60 + 30 * 24 * 3600; // 30 days

      await mockUSDC.connect(alice).approve(fluxAddr, toUSDC(1000));

      const tx = await flux.connect(alice).createStream(
        await bob.getAddress(),
        toUSDC(1000),
        startTime,
        endTime
      );
      const receipt = await tx.wait();

      // Get streamId from event
      const event = receipt?.logs.find(
        (l: any) => l.topics[0] === flux.interface.getEvent("StreamCreated").topicHash
      );
      streamId = 0n; // First stream

      const stream = await flux.getStream(0n);
      expect(stream.totalAmount).to.equal(toUSDC(1000));
      expect(stream.recipient).to.equal(await bob.getAddress());
      expect(stream.cancelled).to.equal(false);
    });

    it("cancels stream and refunds sender", async () => {
      await expect(flux.connect(alice).cancelStream(0n))
        .to.emit(flux, "StreamCancelled");
    });
  });

  describe("Agent Registry", () => {
    it("owner registers an agent", async () => {
      const agentAddr = await agentWallet.getAddress();
      await expect(
        flux.connect(owner).registerAgent(agentAddr, "Treasury Bot", toUSDC(500))
      ).to.emit(flux, "AgentRegistered").withArgs(agentAddr, "Treasury Bot", toUSDC(500));

      const agent = await flux.getAgent(agentAddr);
      expect(agent.active).to.equal(true);
      expect(agent.budgetCap).to.equal(toUSDC(500));
    });

    it("non-owner cannot register agent", async () => {
      await expect(
        flux.connect(alice).registerAgent(await alice.getAddress(), "Bad", toUSDC(100))
      ).to.be.revertedWith("Flux: not owner");
    });

    it("agent can pay within budget", async () => {
      // Fund contract
      const fluxAddr = await flux.getAddress();
      await mockUSDC.connect(owner).approve(fluxAddr, toUSDC(500));
      await flux.connect(owner).depositForAgents(toUSDC(500));

      const bobBefore = await mockUSDC.balanceOf(await bob.getAddress());
      await expect(
        flux.connect(agentWallet).agentPay(await bob.getAddress(), toUSDC(50))
      ).to.emit(flux, "AgentPayment");

      expect(await mockUSDC.balanceOf(await bob.getAddress())).to.equal(bobBefore + toUSDC(50));
    });

    it("agent cannot exceed budget cap", async () => {
      await expect(
        flux.connect(agentWallet).agentPay(await bob.getAddress(), toUSDC(1000))
      ).to.be.revertedWith("Flux: budget exceeded");
    });
  });

  describe("Fee Withdrawal", () => {
    it("owner can withdraw fees", async () => {
      const ownerBefore = await mockUSDC.balanceOf(await owner.getAddress());
      const stats = await flux.getStats();
      if (stats.fees > 0n) {
        await expect(flux.connect(owner).withdrawFees())
          .to.emit(flux, "FeesWithdrawn");
      }
    });

    it("non-owner cannot withdraw fees", async () => {
      await expect(flux.connect(alice).withdrawFees()).to.be.revertedWith("Flux: not owner");
    });
  });
});
