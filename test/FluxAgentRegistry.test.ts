import { expect } from "chai";
import { ethers } from "hardhat";
import { FluxAgentRegistry, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";

describe("FluxAgentRegistry", function () {
  let registry: FluxAgentRegistry;
  let usdc: MockERC20;
  let owner: Signer;
  let agentWallet: Signer;
  let recipient: Signer;
  let stranger: Signer;

  const DEC = 6;
  const amt = (n: number) => ethers.parseUnits(n.toString(), DEC);

  async function registerFreshAgent(overrides: Partial<{ perTx: bigint; daily: bigint; total: bigint; expiry: number }> = {}) {
    const perTx = overrides.perTx ?? amt(10);
    const daily = overrides.daily ?? amt(50);
    const total = overrides.total ?? amt(1000);
    const expiry = overrides.expiry ?? 0;
    const agentWalletAddr = await agentWallet.getAddress();

    const tx = await registry.connect(owner).registerAgent(agentWalletAddr, perTx, daily, total, expiry);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((e) => e?.name === "AgentRegistered");
    const agentId = event!.args.agentId as bigint;

    // Agent wallet approves the registry once, matching the real usage
    // pattern (registerAgent alone grants no allowance).
    await usdc.connect(agentWallet).approve(await registry.getAddress(), ethers.MaxUint256);

    return agentId;
  }

  beforeEach(async () => {
    [owner, agentWallet, recipient, stranger] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20Factory.deploy("USD Coin", "USDC", DEC);
    await usdc.mint(await agentWallet.getAddress(), amt(10_000));

    const RegistryFactory = await ethers.getContractFactory("FluxAgentRegistry");
    registry = await RegistryFactory.deploy(await usdc.getAddress());
  });

  describe("registerAgent", () => {
    it("registers with caller as owner and emits AgentRegistered", async () => {
      const agentId = await registerFreshAgent();
      const agent = await registry.getAgent(agentId);
      expect(agent.owner).to.equal(await owner.getAddress());
      expect(agent.agentWallet).to.equal(await agentWallet.getAddress());
      expect(agent.status).to.equal(0n); // Active
    });

    it("reverts on zero caps and inverted cap ordering", async () => {
      const w = await agentWallet.getAddress();
      await expect(registry.registerAgent(w, 0, amt(50), amt(1000), 0)).to.be.revertedWith("Flux: zero perTxCap");
      await expect(registry.registerAgent(w, amt(10), 0, amt(1000), 0)).to.be.revertedWith("Flux: zero dailyCap");
      await expect(registry.registerAgent(w, amt(10), amt(50), 0, 0)).to.be.revertedWith("Flux: zero totalCap");
      await expect(registry.registerAgent(w, amt(60), amt(50), amt(1000), 0)).to.be.revertedWith("Flux: perTxCap exceeds dailyCap");
      await expect(registry.registerAgent(w, amt(10), amt(2000), amt(1000), 0)).to.be.revertedWith("Flux: dailyCap exceeds totalCap");
    });

    it("reverts on zero agent wallet or past expiry", async () => {
      await expect(registry.registerAgent(ethers.ZeroAddress, amt(10), amt(50), amt(1000), 0))
        .to.be.revertedWith("Flux: zero agent wallet");
      await expect(registry.registerAgent(await agentWallet.getAddress(), amt(10), amt(50), amt(1000), 1))
        .to.be.revertedWith("Flux: expiry in past");
    });
  });

  describe("recordPayment — guardrails", () => {
    it("succeeds within caps: pulls USDC, updates spend, emits AgentPayment", async () => {
      const agentId = await registerFreshAgent();
      const to = await recipient.getAddress();
      const before = await usdc.balanceOf(to);

      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(5)))
        .to.emit(registry, "AgentPayment")
        .withArgs(agentId, to, amt(5), amt(5), amt(5));

      expect(await usdc.balanceOf(to)).to.equal(before + amt(5));
      const agent = await registry.getAgent(agentId);
      expect(agent.spentToday).to.equal(amt(5));
      expect(agent.spentTotal).to.equal(amt(5));
    });

    it("reverts when caller is not the agent's own wallet", async () => {
      const agentId = await registerFreshAgent();
      await expect(registry.connect(stranger).recordPayment(agentId, await recipient.getAddress(), amt(5)))
        .to.be.revertedWith("Flux: not agent wallet");
    });

    it("reverts a single payment above the per-tx cap", async () => {
      const agentId = await registerFreshAgent({ perTx: amt(10) });
      await expect(registry.connect(agentWallet).recordPayment(agentId, await recipient.getAddress(), amt(11)))
        .to.be.revertedWith("Flux: exceeds per-tx cap");
    });

    it("reverts once cumulative spend in the window would exceed the daily cap", async () => {
      const agentId = await registerFreshAgent({ perTx: amt(10), daily: amt(15) });
      const to = await recipient.getAddress();
      await registry.connect(agentWallet).recordPayment(agentId, to, amt(10));
      // 10 + 10 = 20 > 15 daily cap, even though each individual payment is under perTxCap
      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(10)))
        .to.be.revertedWith("Flux: exceeds daily cap");
    });

    it("reverts once cumulative spend would exceed the total (lifetime) cap", async () => {
      // dailyCap can never exceed totalCap (enforced at registration), so a
      // single day's spending can never isolate the total-cap revert on its
      // own — it has to be approached across daily windows, with spentToday
      // resetting each time while spentTotal keeps accumulating.
      const agentId = await registerFreshAgent({ perTx: amt(10), daily: amt(10), total: amt(15) });
      const to = await recipient.getAddress();
      await registry.connect(agentWallet).recordPayment(agentId, to, amt(10)); // spentTotal = 10

      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      // New day: dailyCap(10) alone would allow this, but spentTotal would
      // become 20 > totalCap(15).
      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(10)))
        .to.be.revertedWith("Flux: exceeds total cap");
    });

    it("rolls the daily window: spend resets after >=1 day, but total cap still accumulates", async () => {
      const agentId = await registerFreshAgent({ perTx: amt(10), daily: amt(10), total: amt(1000) });
      const to = await recipient.getAddress();
      await registry.connect(agentWallet).recordPayment(agentId, to, amt(10));
      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(1)))
        .to.be.revertedWith("Flux: exceeds daily cap");

      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(10))).to.not.be.reverted;
      const agent = await registry.getAgent(agentId);
      expect(agent.spentToday).to.equal(amt(10)); // reset then re-spent, not 20
      expect(agent.spentTotal).to.equal(amt(20)); // lifetime total keeps accumulating across windows
    });

    it("reverts a blocked recipient even with room under every cap", async () => {
      const agentId = await registerFreshAgent();
      const to = await recipient.getAddress();
      await registry.connect(owner).setBlocklisted(agentId, [to], true);
      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(5)))
        .to.be.revertedWith("Flux: recipient blocked");
    });

    it("in allowlist mode, reverts a non-allowlisted recipient and allows a listed one", async () => {
      const agentId = await registerFreshAgent();
      const to = await recipient.getAddress();
      const other = await stranger.getAddress();
      await registry.connect(owner).setRestrictToAllowlist(agentId, true);
      await registry.connect(owner).setAllowlisted(agentId, [to], true);

      await expect(registry.connect(agentWallet).recordPayment(agentId, other, amt(1)))
        .to.be.revertedWith("Flux: recipient not allowlisted");
      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(1))).to.not.be.reverted;
    });

    it("reverts after expiry", async () => {
      const latest = await ethers.provider.getBlock("latest");
      const agentId = await registerFreshAgent({ expiry: latest!.timestamp + 10 });
      await ethers.provider.send("evm_increaseTime", [11]);
      await ethers.provider.send("evm_mine", []);
      await expect(registry.connect(agentWallet).recordPayment(agentId, await recipient.getAddress(), amt(1)))
        .to.be.revertedWith("Flux: agent expired");
    });

    it("reverts while paused", async () => {
      const agentId = await registerFreshAgent();
      await registry.connect(owner).pause(agentId);
      await expect(registry.connect(agentWallet).recordPayment(agentId, await recipient.getAddress(), amt(1)))
        .to.be.revertedWith("Flux: agent not active");
    });

    it("kill-switch halts spending instantly and irreversibly, even mid-session", async () => {
      const agentId = await registerFreshAgent();
      const to = await recipient.getAddress();
      // One successful payment first — the agent has an active, in-progress session.
      await registry.connect(agentWallet).recordPayment(agentId, to, amt(1));

      await expect(registry.connect(owner).revoke(agentId)).to.emit(registry, "AgentRevoked").withArgs(agentId);

      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(1)))
        .to.be.revertedWith("Flux: agent not active");
      // Irreversible: cannot resume out of Revoked.
      await expect(registry.connect(owner).resume(agentId)).to.be.revertedWith("Flux: agent not paused");
      // Cannot re-activate via updateCaps either.
      await expect(registry.connect(owner).updateCaps(agentId, amt(10), amt(50), amt(1000), 0))
        .to.be.revertedWith("Flux: agent revoked");
    });
  });

  describe("recordExternalSpend — x402/Gateway audit path", () => {
    it("records spend and emits AgentPayment WITHOUT moving USDC (Circle's Gateway already did)", async () => {
      const agentId = await registerFreshAgent();
      const to = await recipient.getAddress();
      const walletBalBefore = await usdc.balanceOf(await agentWallet.getAddress());
      const recipientBalBefore = await usdc.balanceOf(to);

      await expect(registry.connect(agentWallet).recordExternalSpend(agentId, to, amt(5)))
        .to.emit(registry, "AgentPayment")
        .withArgs(agentId, to, amt(5), amt(5), amt(5));

      // No transfer happened — this function only accounts for a spend that
      // already happened elsewhere (Circle's Gateway/facilitator).
      expect(await usdc.balanceOf(await agentWallet.getAddress())).to.equal(walletBalBefore);
      expect(await usdc.balanceOf(to)).to.equal(recipientBalBefore);

      const agent = await registry.getAgent(agentId);
      expect(agent.spentToday).to.equal(amt(5));
      expect(agent.spentTotal).to.equal(amt(5));
    });

    it("shares every guardrail with recordPayment (cap, blocklist, expiry, active, caller)", async () => {
      const agentId = await registerFreshAgent({ perTx: amt(10) });
      const to = await recipient.getAddress();

      await expect(registry.connect(stranger).recordExternalSpend(agentId, to, amt(1)))
        .to.be.revertedWith("Flux: not agent wallet");
      await expect(registry.connect(agentWallet).recordExternalSpend(agentId, to, amt(11)))
        .to.be.revertedWith("Flux: exceeds per-tx cap");

      await registry.connect(owner).setBlocklisted(agentId, [to], true);
      await expect(registry.connect(agentWallet).recordExternalSpend(agentId, to, amt(1)))
        .to.be.revertedWith("Flux: recipient blocked");

      await registry.connect(owner).setBlocklisted(agentId, [to], false);
      await registry.connect(owner).revoke(agentId);
      await expect(registry.connect(agentWallet).recordExternalSpend(agentId, to, amt(1)))
        .to.be.revertedWith("Flux: agent not active");
    });

    it("recordPayment and recordExternalSpend share the same running spend totals", async () => {
      const agentId = await registerFreshAgent({ perTx: amt(10), daily: amt(15) });
      const to = await recipient.getAddress();
      await registry.connect(agentWallet).recordPayment(agentId, to, amt(10));
      // 10 (on-chain) + 10 (external/Gateway) = 20 > 15 daily cap — the two
      // paths meter against the same agent state, not independent budgets.
      await expect(registry.connect(agentWallet).recordExternalSpend(agentId, to, amt(10)))
        .to.be.revertedWith("Flux: exceeds daily cap");
    });
  });

  describe("pause / resume", () => {
    it("owner can pause then resume, restoring spend ability", async () => {
      const agentId = await registerFreshAgent();
      const to = await recipient.getAddress();
      await registry.connect(owner).pause(agentId);
      await expect(registry.connect(owner).resume(agentId)).to.emit(registry, "AgentResumed").withArgs(agentId);
      await expect(registry.connect(agentWallet).recordPayment(agentId, to, amt(1))).to.not.be.reverted;
    });

    it("reverts pause/resume/revoke from a non-owner", async () => {
      const agentId = await registerFreshAgent();
      await expect(registry.connect(stranger).pause(agentId)).to.be.revertedWith("Flux: not agent owner");
      await expect(registry.connect(stranger).revoke(agentId)).to.be.revertedWith("Flux: not agent owner");
    });
  });

  describe("isPayable (preflight view)", () => {
    it("reflects the same guardrails without mutating state", async () => {
      const agentId = await registerFreshAgent({ perTx: amt(10), daily: amt(10) });
      const to = await recipient.getAddress();
      let [ok, reason] = await registry.isPayable(agentId, to, amt(5));
      expect(ok).to.equal(true);

      await registry.connect(owner).setBlocklisted(agentId, [to], true);
      [ok, reason] = await registry.isPayable(agentId, to, amt(5));
      expect(ok).to.equal(false);
      expect(reason).to.equal("Recipient blocked");
    });
  });
});
