// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FluxLimitOrder
 * @notice Escrow-based limit-order book for Flux swap. A maker locks tokenIn and
 *         sets a minimum tokenOut trigger; any keeper can call executeOrder once
 *         an allowlisted router can deliver at least that output. Deployed on
 *         Arc testnet (Chain ID: 5042002), alongside FluxSettlement.
 *
 * Design notes (deviating from a literal 4-state status field):
 *  - On-chain status is Open | Filled | Cancelled. "Expired" is not a written
 *    state — no one calls a function to transition into it — it is a DERIVED
 *    display state (Open AND block.timestamp >= expiry). getOrderView() exposes
 *    it pre-computed for the frontend. executeOrder still independently checks
 *    the expiry deadline regardless of what getOrderView() would report.
 *  - Router calldata is opaque: the keeper builds `swapData` against whatever
 *    ABI the target router expects (XyloNet/UnitFlow/etc. differ), and this
 *    contract only requires the router be on the owner-controlled allowlist —
 *    it never trusts a caller-supplied router address with escrowed funds.
 *  - Realised output is measured by this contract's own tokenOut balance delta
 *    around the router call, never by trusting the router's return data.
 *  - Outputs are pull-payment (withdraw()), not pushed inside executeOrder —
 *    keeps the permissionless executeOrder path free of a transfer to an
 *    arbitrary maker-controlled token, and isolates a misbehaving tokenOut
 *    (e.g. one that reverts on transfer) to that user's own withdraw call.
 *
 * Arc Testnet:
 *  - RPC:      https://rpc.testnet.arc.network
 *  - Explorer: https://testnet.arcscan.app
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FluxLimitOrder {

    // ── REENTRANCY GUARD ───────────────────────────────────
    // Minimal hand-rolled guard, matching FluxSettlement's zero-external-
    // dependency convention rather than importing OpenZeppelin for one modifier.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Flux: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ── CONFIG ─────────────────────────────────────────────
    address public immutable owner;

    // ── STATUS ─────────────────────────────────────────────
    enum OrderStatus { Open, Filled, Cancelled }

    // ── STRUCTS ────────────────────────────────────────────
    struct Order {
        address maker;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;  // the trigger, in tokenOut terms
        uint64  expiry;
        OrderStatus status;
    }

    // ── STORAGE ────────────────────────────────────────────
    uint256 private _nextOrderId;
    mapping(uint256 => Order) public orders;
    mapping(address => bool)  public allowedRouters;
    // Pull-payment ledger: user => token => withdrawable amount.
    mapping(address => mapping(address => uint256)) public claimable;

    // ── EVENTS ─────────────────────────────────────────────
    event OrderCreated(
        uint256 indexed id,
        address indexed maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64  expiry
    );
    event OrderCancelled(uint256 indexed id, address indexed maker, uint256 refund);
    event OrderFilled(uint256 indexed id, address indexed router, uint256 amountOut);
    event RouterAllowlisted(address indexed router, bool allowed);

    // ── MODIFIERS ──────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Flux: not owner");
        _;
    }

    // ── CONSTRUCTOR ────────────────────────────────────────
    /// @param initialRouters Verified route routers to seed the allowlist with
    ///        (e.g. XyloNet, UnitFlow) — kept empty-safe for local/test deploys.
    constructor(address[] memory initialRouters) {
        owner = msg.sender;
        for (uint256 i = 0; i < initialRouters.length; i++) {
            allowedRouters[initialRouters[i]] = true;
            emit RouterAllowlisted(initialRouters[i], true);
        }
    }

    // ══════════════════════════════════════════════════════
    //  ORDER LIFECYCLE
    // ══════════════════════════════════════════════════════

    /**
     * @notice Escrow tokenIn and create a limit order. Caller must approve
     *         amountIn to this contract first.
     */
    function createOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64  expiry
    ) external returns (uint256 orderId) {
        require(tokenIn != address(0) && tokenOut != address(0), "Flux: zero token");
        require(tokenIn != tokenOut, "Flux: same token");
        require(amountIn > 0, "Flux: zero amountIn");
        require(minAmountOut > 0, "Flux: zero minAmountOut");
        require(expiry > block.timestamp, "Flux: expiry in past");

        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn),
            "Flux: escrow pull failed"
        );

        orderId = _nextOrderId++;
        orders[orderId] = Order({
            maker:        msg.sender,
            tokenIn:      tokenIn,
            tokenOut:     tokenOut,
            amountIn:     amountIn,
            minAmountOut: minAmountOut,
            expiry:       expiry,
            status:       OrderStatus.Open
        });

        emit OrderCreated(orderId, msg.sender, tokenIn, tokenOut, amountIn, minAmountOut, expiry);
    }

    /**
     * @notice Maker cancels an open order and reclaims escrowed tokenIn.
     *         Callable after expiry too — expiry only blocks executeOrder,
     *         it never blocks the maker reclaiming their own funds.
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.maker == msg.sender, "Flux: not maker");
        require(o.status == OrderStatus.Open, "Flux: order not open");

        o.status = OrderStatus.Cancelled;
        uint256 refund = o.amountIn;

        require(IERC20(o.tokenIn).transfer(o.maker, refund), "Flux: refund failed");

        emit OrderCancelled(orderId, o.maker, refund);
    }

    /**
     * @notice Permissionless: fill an open, unexpired order through an
     *         allowlisted router. Reverts unless the realised output meets
     *         the order's trigger. Output is credited to the maker's
     *         claimable balance, not pushed — call withdraw() to collect it.
     * @param router    Must be on the owner-controlled allowlist.
     * @param swapData  Calldata for `router`, built by the keeper against
     *                  that router's own ABI (exact-input, this contract as
     *                  both payer and recipient).
     */
    function executeOrder(uint256 orderId, address router, bytes calldata swapData) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.status == OrderStatus.Open, "Flux: order not open");
        require(block.timestamp < o.expiry, "Flux: order expired");
        require(allowedRouters[router], "Flux: router not allowlisted");

        o.status = OrderStatus.Filled;

        uint256 balBefore = IERC20(o.tokenOut).balanceOf(address(this));

        require(IERC20(o.tokenIn).approve(router, o.amountIn), "Flux: approve failed");
        (bool ok, ) = router.call(swapData);
        require(ok, "Flux: router call failed");
        // Defensive: revoke any unused allowance rather than leave it dangling.
        IERC20(o.tokenIn).approve(router, 0);

        uint256 balAfter = IERC20(o.tokenOut).balanceOf(address(this));
        uint256 amountOut = balAfter - balBefore;
        require(amountOut >= o.minAmountOut, "Flux: output below trigger");

        claimable[o.maker][o.tokenOut] += amountOut;

        emit OrderFilled(orderId, router, amountOut);
    }

    /**
     * @notice Pull-payment withdrawal for filled-order proceeds.
     */
    function withdraw(address token) external nonReentrant {
        uint256 amount = claimable[msg.sender][token];
        require(amount > 0, "Flux: nothing to withdraw");
        claimable[msg.sender][token] = 0;
        require(IERC20(token).transfer(msg.sender, amount), "Flux: withdraw failed");
    }

    // ══════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════

    function setRouterAllowed(address router, bool allowed) external onlyOwner {
        require(router != address(0), "Flux: zero router");
        allowedRouters[router] = allowed;
        emit RouterAllowlisted(router, allowed);
    }

    // ══════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /// @notice Same as getOrder, but with the derived "expired" flag pre-computed.
    function getOrderView(uint256 orderId) external view returns (Order memory order, bool isExpired) {
        order = orders[orderId];
        isExpired = order.status == OrderStatus.Open && block.timestamp >= order.expiry;
    }

    function nextOrderId() external view returns (uint256) {
        return _nextOrderId;
    }
}
