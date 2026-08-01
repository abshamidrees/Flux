import { expect } from "chai";
import { ethers } from "hardhat";
import { FluxLimitOrder, MockERC20, MockRouter } from "../typechain-types";
import { Signer } from "ethers";

describe("FluxLimitOrder", function () {
  let limitOrder: FluxLimitOrder;
  let tokenIn: MockERC20;
  let tokenOut: MockERC20;
  let router: MockRouter;
  let unlistedRouter: MockRouter;
  let owner: Signer;
  let maker: Signer;
  let keeper: Signer;

  const DEC = 6;
  const amt = (n: number) => ethers.parseUnits(n.toString(), DEC);

  async function nowPlus(seconds: number) {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block!.timestamp + seconds);
  }

  async function freshOrder(minOut: bigint, expirySeconds = 3600) {
    const limitAddr = await limitOrder.getAddress();
    await tokenIn.connect(maker).approve(limitAddr, amt(100));
    const expiry = await nowPlus(expirySeconds);
    const tx = await limitOrder
      .connect(maker)
      .createOrder(await tokenIn.getAddress(), await tokenOut.getAddress(), amt(100), minOut, expiry);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l) => { try { return limitOrder.interface.parseLog(l); } catch { return null; } })
      .find((e) => e?.name === "OrderCreated");
    return { orderId: event!.args.id as bigint, expiry };
  }

  function swapCalldata(amountIn: bigint, amountOut: bigint, to: string, tIn: string, tOut: string) {
    return router.interface.encodeFunctionData("mockSwap", [tIn, tOut, amountIn, amountOut, to]);
  }

  beforeEach(async () => {
    [owner, maker, keeper] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    tokenIn = await MockERC20Factory.deploy("Token In", "TIN", DEC);
    tokenOut = await MockERC20Factory.deploy("Token Out", "TOUT", DEC);

    const MockRouterFactory = await ethers.getContractFactory("MockRouter");
    router = await MockRouterFactory.deploy();
    unlistedRouter = await MockRouterFactory.deploy();

    const LimitFactory = await ethers.getContractFactory("FluxLimitOrder");
    limitOrder = await LimitFactory.deploy([await router.getAddress()]);

    await tokenIn.mint(await maker.getAddress(), amt(1000));
    // Fund both routers with tokenOut so a fill can actually pay out.
    await tokenOut.mint(await router.getAddress(), amt(1000));
    await tokenOut.mint(await unlistedRouter.getAddress(), amt(1000));
  });

  describe("createOrder", () => {
    it("escrows tokenIn and emits OrderCreated", async () => {
      const limitAddr = await limitOrder.getAddress();
      const { orderId } = await freshOrder(amt(95));
      expect(await tokenIn.balanceOf(limitAddr)).to.equal(amt(100));
      const order = await limitOrder.getOrder(orderId);
      expect(order.maker).to.equal(await maker.getAddress());
      expect(order.status).to.equal(0n); // Open
    });

    it("reverts on zero amountIn / minAmountOut / past expiry", async () => {
      const limitAddr = await limitOrder.getAddress();
      await tokenIn.connect(maker).approve(limitAddr, amt(100));
      const tOutAddr = await tokenOut.getAddress();
      const tInAddr = await tokenIn.getAddress();
      await expect(limitOrder.connect(maker).createOrder(tInAddr, tOutAddr, 0, amt(1), await nowPlus(3600)))
        .to.be.revertedWith("Flux: zero amountIn");
      await expect(limitOrder.connect(maker).createOrder(tInAddr, tOutAddr, amt(1), 0, await nowPlus(3600)))
        .to.be.revertedWith("Flux: zero minAmountOut");
      await expect(limitOrder.connect(maker).createOrder(tInAddr, tOutAddr, amt(1), amt(1), 1))
        .to.be.revertedWith("Flux: expiry in past");
    });
  });

  describe("executeOrder", () => {
    it("fills exactly at the trigger price", async () => {
      const { orderId } = await freshOrder(amt(95));
      const limitAddr = await limitOrder.getAddress();
      const data = swapCalldata(amt(100), amt(95), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());

      await expect(limitOrder.connect(keeper).executeOrder(orderId, await router.getAddress(), data))
        .to.emit(limitOrder, "OrderFilled")
        .withArgs(orderId, await router.getAddress(), amt(95));

      const order = await limitOrder.getOrder(orderId);
      expect(order.status).to.equal(1n); // Filled
      expect(await limitOrder.claimable(await maker.getAddress(), await tokenOut.getAddress())).to.equal(amt(95));
    });

    it("reverts when realised output is below the trigger", async () => {
      const { orderId } = await freshOrder(amt(95));
      const limitAddr = await limitOrder.getAddress();
      // 94 < 95 trigger
      const data = swapCalldata(amt(100), amt(94), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());
      await expect(limitOrder.connect(keeper).executeOrder(orderId, await router.getAddress(), data))
        .to.be.revertedWith("Flux: output below trigger");
    });

    it("reverts past expiry", async () => {
      const { orderId } = await freshOrder(amt(95), 10);
      await ethers.provider.send("evm_increaseTime", [11]);
      await ethers.provider.send("evm_mine", []);
      const limitAddr = await limitOrder.getAddress();
      const data = swapCalldata(amt(100), amt(95), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());
      await expect(limitOrder.connect(keeper).executeOrder(orderId, await router.getAddress(), data))
        .to.be.revertedWith("Flux: order expired");
    });

    it("reverts against a non-allowlisted router", async () => {
      const { orderId } = await freshOrder(amt(95));
      const limitAddr = await limitOrder.getAddress();
      const data = swapCalldata(amt(100), amt(95), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());
      await expect(limitOrder.connect(keeper).executeOrder(orderId, await unlistedRouter.getAddress(), data))
        .to.be.revertedWith("Flux: router not allowlisted");
    });

    it("reverts on double-fill", async () => {
      const { orderId } = await freshOrder(amt(95));
      const limitAddr = await limitOrder.getAddress();
      const data = swapCalldata(amt(100), amt(95), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());
      await limitOrder.connect(keeper).executeOrder(orderId, await router.getAddress(), data);
      await expect(limitOrder.connect(keeper).executeOrder(orderId, await router.getAddress(), data))
        .to.be.revertedWith("Flux: order not open");
    });
  });

  describe("cancelOrder", () => {
    it("maker reclaims escrow", async () => {
      const { orderId } = await freshOrder(amt(95));
      const makerAddr = await maker.getAddress();
      const before = await tokenIn.balanceOf(makerAddr);
      await expect(limitOrder.connect(maker).cancelOrder(orderId))
        .to.emit(limitOrder, "OrderCancelled")
        .withArgs(orderId, makerAddr, amt(100));
      expect(await tokenIn.balanceOf(makerAddr)).to.equal(before + amt(100));
      expect((await limitOrder.getOrder(orderId)).status).to.equal(2n); // Cancelled
    });

    it("succeeds after expiry (reclaiming funds is never blocked)", async () => {
      const { orderId } = await freshOrder(amt(95), 10);
      await ethers.provider.send("evm_increaseTime", [11]);
      await ethers.provider.send("evm_mine", []);
      await expect(limitOrder.connect(maker).cancelOrder(orderId)).to.not.be.reverted;
    });

    it("reverts for a non-maker", async () => {
      const { orderId } = await freshOrder(amt(95));
      await expect(limitOrder.connect(keeper).cancelOrder(orderId)).to.be.revertedWith("Flux: not maker");
    });

    it("reverts on double-cancel and cancel-after-fill", async () => {
      const { orderId } = await freshOrder(amt(95));
      await limitOrder.connect(maker).cancelOrder(orderId);
      await expect(limitOrder.connect(maker).cancelOrder(orderId)).to.be.revertedWith("Flux: order not open");

      const { orderId: orderId2 } = await freshOrder(amt(95));
      const limitAddr = await limitOrder.getAddress();
      const data = swapCalldata(amt(100), amt(95), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());
      await limitOrder.connect(keeper).executeOrder(orderId2, await router.getAddress(), data);
      await expect(limitOrder.connect(maker).cancelOrder(orderId2)).to.be.revertedWith("Flux: order not open");
    });
  });

  describe("withdraw", () => {
    it("pays out claimable balance after a fill", async () => {
      const { orderId } = await freshOrder(amt(95));
      const limitAddr = await limitOrder.getAddress();
      const data = swapCalldata(amt(100), amt(95), limitAddr, await tokenIn.getAddress(), await tokenOut.getAddress());
      await limitOrder.connect(keeper).executeOrder(orderId, await router.getAddress(), data);

      const makerAddr = await maker.getAddress();
      const before = await tokenOut.balanceOf(makerAddr);
      await limitOrder.connect(maker).withdraw(await tokenOut.getAddress());
      expect(await tokenOut.balanceOf(makerAddr)).to.equal(before + amt(95));
      expect(await limitOrder.claimable(makerAddr, await tokenOut.getAddress())).to.equal(0n);
    });

    it("reverts with nothing to withdraw", async () => {
      await expect(limitOrder.connect(maker).withdraw(await tokenOut.getAddress()))
        .to.be.revertedWith("Flux: nothing to withdraw");
    });
  });

  describe("router allowlist", () => {
    it("owner can add/remove routers", async () => {
      const newRouterAddr = await unlistedRouter.getAddress();
      expect(await limitOrder.allowedRouters(newRouterAddr)).to.equal(false);
      await limitOrder.connect(owner).setRouterAllowed(newRouterAddr, true);
      expect(await limitOrder.allowedRouters(newRouterAddr)).to.equal(true);
    });

    it("reverts for a non-owner", async () => {
      await expect(limitOrder.connect(maker).setRouterAllowed(await router.getAddress(), false))
        .to.be.revertedWith("Flux: not owner");
    });
  });
});
