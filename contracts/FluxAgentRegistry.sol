// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FluxAgentRegistry
 * @notice On-chain enforcement layer for autonomous USDC agents on Arc. Each
 *         agent is a policy-controlled spending session on top of an
 *         externally-held wallet (a Circle Agent Wallet or any EOA/SCA) —
 *         this contract never custodies agent funds itself.
 *
 * Why on-chain enforcement (not Circle's wallet-layer policies):
 *   Circle's own spending-policy API (per-tx / daily / weekly / monthly caps
 *   at the wallet layer) is documented mainnet-only — testnet policy-set
 *   calls are rejected. Arc is testnet-only today. So on Arc, Circle cannot
 *   enforce agent caps at the wallet layer; this contract is the only real
 *   enforcement available, not a redundant belt-and-suspenders layer. When
 *   Circle's policies reach Arc mainnet, Flux can align to them — this
 *   contract's job doesn't change, just which layer is primary.
 *
 * Design notes (deviating from a literal transcription of the spec struct):
 *  - Added `dayStart` to the Agent struct. The spec's struct tracks
 *    `spentToday` but has no timestamp to know when to reset it — without
 *    one, "rolling the daily window" isn't actually implementable. This is a
 *    RESETTING 24h window (spentToday zeroes and dayStart snaps to now once
 *    >=1 day has elapsed since the last reset), not a continuous sliding
 *    window — simpler, and the caps still hold, but a burst right at a
 *    window boundary can front- and back-load two allowances close
 *    together. Documented rather than silently shipped as "rolling."
 *  - `recordPayment` PULLS funds itself (`transferFrom(agentWallet, to,
 *    amount)`) rather than just recording a payment the agent already made
 *    separately. If it only bookkept, an agent integration could skip
 *    calling it and pay directly via USDC.transfer, making every cap
 *    cosmetic — exactly what this contract exists to prevent. The agent
 *    wallet approves this contract once; every payment after that is gated
 *    here, atomically, or it doesn't happen. This is also why it's
 *    `agentWallet`-gated (msg.sender must be the agent's own wallet) rather
 *    than owner- or anyone-callable — only the wallet that can already move
 *    its own funds (via the approval) can trigger a metered spend.
 *  - Allowlist/blocklist and per-agent expiry go beyond Circle's current
 *    4-field policy model (per-tx/daily/weekly/monthly only, per Circle's
 *    agent-wallet-policy skill) — Flux extensions, not a mirror of Circle's
 *    vocabulary. `restrictToAllowlist` is opt-in per agent: with it off
 *    (default), only the blocklist applies; turning it on makes the
 *    allowlist an exhaustive whitelist.
 *
 * Arc Testnet:
 *  - RPC:      https://rpc.testnet.arc.network
 *  - Explorer: https://testnet.arcscan.app
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FluxAgentRegistry {

    // ── REENTRANCY GUARD ───────────────────────────────────
    // Minimal hand-rolled guard, matching FluxSettlement/FluxLimitOrder's
    // zero-external-dependency convention rather than importing OpenZeppelin.
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
    address public immutable usdc;

    // ── STATUS ─────────────────────────────────────────────
    enum AgentStatus { Active, Paused, Revoked }

    // ── STRUCTS ────────────────────────────────────────────
    struct Agent {
        address     agentWallet;   // machine-operated wallet (Circle Agent Wallet or any address)
        address     owner;         // the human who governs it
        uint256     perTxCap;      // max USDC per single payment
        uint256     dailyCap;      // resetting 24h cap — see contract-level note
        uint256     totalCap;      // lifetime budget
        uint256     spentToday;    // resets when dayStart rolls over
        uint256     spentTotal;
        uint64      expiry;        // time-bounded session; 0 = no expiry
        uint64      dayStart;      // timestamp the current daily window began
        AgentStatus status;
    }

    // ── STORAGE ────────────────────────────────────────────
    uint256 private _nextAgentId;
    mapping(uint256 => Agent) public agents;
    // agentId => recipient => allowed/blocked
    mapping(uint256 => mapping(address => bool)) public allowlisted;
    mapping(uint256 => mapping(address => bool)) public blocklisted;
    mapping(uint256 => bool) public restrictToAllowlist;

    // ── EVENTS ─────────────────────────────────────────────
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        address indexed agentWallet,
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 totalCap,
        uint64  expiry
    );
    event CapsUpdated(uint256 indexed agentId, uint256 perTxCap, uint256 dailyCap, uint256 totalCap, uint64 expiry);
    event AgentPaused(uint256 indexed agentId);
    event AgentResumed(uint256 indexed agentId);
    event AgentRevoked(uint256 indexed agentId);
    event RecipientListUpdated(uint256 indexed agentId, address indexed recipient, bool allowlist, bool value);
    event AllowlistModeSet(uint256 indexed agentId, bool restricted);
    event AgentPayment(uint256 indexed agentId, address indexed to, uint256 amount, uint256 spentToday, uint256 spentTotal);

    // ── MODIFIERS ──────────────────────────────────────────
    modifier onlyAgentOwner(uint256 agentId) {
        require(agents[agentId].owner == msg.sender, "Flux: not agent owner");
        _;
    }

    // ── CONSTRUCTOR ────────────────────────────────────────
    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "Flux: zero usdc");
        usdc = usdcAddress;
    }

    // ══════════════════════════════════════════════════════
    //  AGENT LIFECYCLE
    // ══════════════════════════════════════════════════════

    /**
     * @notice Register a new agent. Caller becomes the agent's owner. The
     *         agent wallet must separately approve this contract for USDC
     *         before any payment can be recorded — registering alone moves
     *         no funds and grants no allowance.
     */
    function registerAgent(
        address agentWallet,
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 totalCap,
        uint64  expiry
    ) external returns (uint256 agentId) {
        require(agentWallet != address(0), "Flux: zero agent wallet");
        require(perTxCap > 0, "Flux: zero perTxCap");
        require(dailyCap > 0, "Flux: zero dailyCap");
        require(totalCap > 0, "Flux: zero totalCap");
        require(perTxCap <= dailyCap, "Flux: perTxCap exceeds dailyCap");
        require(dailyCap <= totalCap, "Flux: dailyCap exceeds totalCap");
        require(expiry == 0 || expiry > block.timestamp, "Flux: expiry in past");

        agentId = _nextAgentId++;
        agents[agentId] = Agent({
            agentWallet: agentWallet,
            owner:       msg.sender,
            perTxCap:    perTxCap,
            dailyCap:    dailyCap,
            totalCap:    totalCap,
            spentToday:  0,
            spentTotal:  0,
            expiry:      expiry,
            dayStart:    uint64(block.timestamp),
            status:      AgentStatus.Active
        });

        emit AgentRegistered(agentId, msg.sender, agentWallet, perTxCap, dailyCap, totalCap, expiry);
    }

    /// @notice Update an agent's caps and/or expiry. Cannot revive a Revoked agent.
    function updateCaps(
        uint256 agentId,
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 totalCap,
        uint64  expiry
    ) external onlyAgentOwner(agentId) {
        Agent storage a = agents[agentId];
        require(a.status != AgentStatus.Revoked, "Flux: agent revoked");
        require(perTxCap > 0 && dailyCap > 0 && totalCap > 0, "Flux: zero cap");
        require(perTxCap <= dailyCap, "Flux: perTxCap exceeds dailyCap");
        require(dailyCap <= totalCap, "Flux: dailyCap exceeds totalCap");
        require(expiry == 0 || expiry > block.timestamp, "Flux: expiry in past");

        a.perTxCap = perTxCap;
        a.dailyCap = dailyCap;
        a.totalCap = totalCap;
        a.expiry   = expiry;

        emit CapsUpdated(agentId, perTxCap, dailyCap, totalCap, expiry);
    }

    function pause(uint256 agentId) external onlyAgentOwner(agentId) {
        Agent storage a = agents[agentId];
        require(a.status == AgentStatus.Active, "Flux: agent not active");
        a.status = AgentStatus.Paused;
        emit AgentPaused(agentId);
    }

    function resume(uint256 agentId) external onlyAgentOwner(agentId) {
        Agent storage a = agents[agentId];
        require(a.status == AgentStatus.Paused, "Flux: agent not paused");
        a.status = AgentStatus.Active;
        emit AgentResumed(agentId);
    }

    /// @notice Kill-switch. Instant, owner-only, irreversible — a revoked
    ///         agent can never be reactivated; register a new one instead.
    function revoke(uint256 agentId) external onlyAgentOwner(agentId) {
        Agent storage a = agents[agentId];
        require(a.status != AgentStatus.Revoked, "Flux: already revoked");
        a.status = AgentStatus.Revoked;
        emit AgentRevoked(agentId);
    }

    // ══════════════════════════════════════════════════════
    //  RECIPIENT GUARDRAILS
    // ══════════════════════════════════════════════════════

    function setAllowlisted(uint256 agentId, address[] calldata addrs, bool allowed) external onlyAgentOwner(agentId) {
        for (uint256 i = 0; i < addrs.length; i++) {
            allowlisted[agentId][addrs[i]] = allowed;
            emit RecipientListUpdated(agentId, addrs[i], true, allowed);
        }
    }

    function setBlocklisted(uint256 agentId, address[] calldata addrs, bool blocked) external onlyAgentOwner(agentId) {
        for (uint256 i = 0; i < addrs.length; i++) {
            blocklisted[agentId][addrs[i]] = blocked;
            emit RecipientListUpdated(agentId, addrs[i], false, blocked);
        }
    }

    /// @notice Toggle whether the allowlist is an exhaustive whitelist for
    ///         this agent. Off by default — only the blocklist applies.
    function setRestrictToAllowlist(uint256 agentId, bool restricted) external onlyAgentOwner(agentId) {
        restrictToAllowlist[agentId] = restricted;
        emit AllowlistModeSet(agentId, restricted);
    }

    // ══════════════════════════════════════════════════════
    //  METERED SPEND — the enforcement path
    // ══════════════════════════════════════════════════════

    /**
     * @notice Pull `amount` USDC from the agent's own wallet to `to`,
     *         gated by every guardrail: Active, not expired, recipient
     *         allowed, and within per-tx / daily / total caps. Reverts on
     *         any violation instead of partially applying it. Only the
     *         agent's own wallet can call this (it must already have
     *         approved this contract, same as any ERC20 spender pattern).
     */
    function recordPayment(uint256 agentId, address to, uint256 amount) external nonReentrant {
        Agent storage a = _checkAndMeter(agentId, to, amount);

        require(IERC20(usdc).transferFrom(a.agentWallet, to, amount), "Flux: USDC pull failed");

        emit AgentPayment(agentId, to, amount, a.spentToday, a.spentTotal);
    }

    /**
     * @notice The x402/Gateway counterpart of recordPayment. Circle's
     *         Gateway settles x402 payments itself — the agent signs an
     *         EIP-3009 authorization against Circle's GatewayWallet
     *         contract, and Circle's facilitator moves the funds. That
     *         path never touches this contract, so there is nothing for
     *         this function to pull; it applies the exact same guardrails
     *         (Active, not expired, recipient allowed, per-tx/daily/total
     *         caps) and, if they pass, records the spend for the audit
     *         trail and dashboard.
     *
     *         IMPORTANT — read before trusting this the same way as
     *         recordPayment: this is NOT trustless enforcement. Nothing
     *         stops an agent's own integration code from signing a Gateway
     *         payment without calling this first — the guardrail only
     *         holds if the integration actually calls it (e.g. from an
     *         x402 client's onBeforePaymentCreation hook, aborting the
     *         payment if this would revert). recordPayment's caps cannot
     *         be bypassed because this contract itself moves the funds;
     *         this function's caps are enforced by convention, same trust
     *         model as any off-chain policy check. Surface this
     *         distinction honestly wherever these numbers are shown.
     */
    function recordExternalSpend(uint256 agentId, address to, uint256 amount) external nonReentrant {
        Agent storage a = _checkAndMeter(agentId, to, amount);
        emit AgentPayment(agentId, to, amount, a.spentToday, a.spentTotal);
    }

    /// @dev Shared guardrail check + spend accounting for both spend paths.
    ///      Does not move funds — callers decide whether/how to do that.
    function _checkAndMeter(uint256 agentId, address to, uint256 amount) private returns (Agent storage a) {
        a = agents[agentId];
        require(a.agentWallet == msg.sender, "Flux: not agent wallet");
        require(a.status == AgentStatus.Active, "Flux: agent not active");
        require(a.expiry == 0 || block.timestamp < a.expiry, "Flux: agent expired");
        require(to != address(0), "Flux: zero recipient");
        require(amount > 0, "Flux: zero amount");
        require(!blocklisted[agentId][to], "Flux: recipient blocked");
        require(!restrictToAllowlist[agentId] || allowlisted[agentId][to], "Flux: recipient not allowlisted");
        require(amount <= a.perTxCap, "Flux: exceeds per-tx cap");

        // Resetting 24h window — see contract-level note on why this isn't a
        // continuous sliding window.
        if (block.timestamp >= a.dayStart + 1 days) {
            a.spentToday = 0;
            a.dayStart = uint64(block.timestamp);
        }
        require(a.spentToday + amount <= a.dailyCap, "Flux: exceeds daily cap");
        require(a.spentTotal + amount <= a.totalCap, "Flux: exceeds total cap");

        a.spentToday += amount;
        a.spentTotal += amount;
    }

    // ══════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    /// @notice Preflight check for the UI/an agent — does NOT mutate state,
    ///         so it does not itself roll the daily window.
    function isPayable(uint256 agentId, address to, uint256 amount) external view returns (bool ok, string memory reason) {
        Agent memory a = agents[agentId];
        if (a.owner == address(0)) return (false, "Agent not found");
        if (a.status != AgentStatus.Active) return (false, "Agent not active");
        if (a.expiry != 0 && block.timestamp >= a.expiry) return (false, "Agent expired");
        if (blocklisted[agentId][to]) return (false, "Recipient blocked");
        if (restrictToAllowlist[agentId] && !allowlisted[agentId][to]) return (false, "Recipient not allowlisted");
        if (amount > a.perTxCap) return (false, "Exceeds per-tx cap");
        uint256 spentToday = block.timestamp >= a.dayStart + 1 days ? 0 : a.spentToday;
        if (spentToday + amount > a.dailyCap) return (false, "Exceeds daily cap");
        if (a.spentTotal + amount > a.totalCap) return (false, "Exceeds total cap");
        return (true, "");
    }

    function nextAgentId() external view returns (uint256) {
        return _nextAgentId;
    }
}
