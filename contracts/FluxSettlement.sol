// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FluxSettlement
 * @notice Programmable USDC payment rails for AI agents, DAOs, and enterprises.
 *         Deployed on Arc testnet (Chain ID: 5042002) — native USDC gas.
 *
 * Features:
 *  - batchSettle: send USDC to N recipients in one tx
 *  - createStream: linear vesting payment stream
 *  - withdrawFromStream / cancelStream
 *  - registerAgent + agentPay: autonomous AI agent commerce
 *  - 0.1% platform fee on all settled volume
 *
 * Arc Testnet:
 *  - RPC:      https://rpc.testnet.arc.network
 *  - Explorer: https://testnet.arcscan.app
 *  - Faucet:   https://faucet.circle.com  (test USDC)
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract FluxSettlement {

    // ── CONFIG ─────────────────────────────────────────────
    address public immutable owner;
    address public immutable usdc;           // Arc testnet USDC
    uint256 public constant FEE_BPS = 10;    // 0.1%
    uint256 public constant BPS_DENOM = 10000;

    // ── STATS ──────────────────────────────────────────────
    uint256 public totalSettledVolume;
    uint256 public totalFeesAccrued;
    uint256 public totalBatches;
    uint256 public totalStreams;

    // ── STRUCTS ────────────────────────────────────────────
    struct Stream {
        address sender;
        address recipient;
        uint256 totalAmount;
        uint256 released;
        uint64  startTime;
        uint64  endTime;
        bool    cancelled;
    }

    struct Agent {
        string  label;
        uint256 budgetCap;
        uint256 spent;
        bool    active;
        uint256 registeredAt;
    }

    // ── STORAGE ────────────────────────────────────────────
    uint256 private _nextStreamId;
    mapping(uint256 => Stream)  public streams;
    mapping(address => Agent)   public agents;
    address[] public agentList;

    // ── EVENTS ─────────────────────────────────────────────
    event BatchSettled(
        address indexed sender,
        uint256 recipientCount,
        uint256 totalUSDC,
        uint256 fee,
        uint256 timestamp
    );
    event StreamCreated(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint64  startTime,
        uint64  endTime
    );
    event StreamWithdrawn(uint256 indexed id, address indexed recipient, uint256 amount);
    event StreamCancelled(uint256 indexed id, address indexed sender, uint256 refund);
    event AgentRegistered(address indexed agent, string label, uint256 budgetCap);
    event AgentUpdated(address indexed agent, uint256 newBudgetCap, bool active);
    event AgentPayment(address indexed agent, address indexed recipient, uint256 amount);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    // ── MODIFIERS ──────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Flux: not owner");
        _;
    }

    modifier onlyActiveAgent() {
        require(agents[msg.sender].active, "Flux: agent not registered");
        _;
    }

    // ── CONSTRUCTOR ────────────────────────────────────────
    constructor(address _usdc) {
        owner = msg.sender;
        usdc  = _usdc;
    }

    // ══════════════════════════════════════════════════════
    //  BATCH SETTLEMENT
    // ══════════════════════════════════════════════════════

    /**
     * @notice Send USDC to multiple recipients in a single transaction.
     * @param recipients  Array of recipient addresses.
     * @param amounts     Corresponding USDC amounts (6 decimals).
     *
     * Caller must approve (total + fee) USDC to this contract first.
     * Fee = 0.1% of total; collected to contract for owner withdrawal.
     */
    function batchSettle(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length > 0, "Flux: empty batch");
        require(recipients.length == amounts.length, "Flux: length mismatch");
        require(recipients.length <= 500, "Flux: max 500 per batch");

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Flux: zero amount");
            require(recipients[i] != address(0), "Flux: zero address");
            total += amounts[i];
        }

        uint256 fee = (total * FEE_BPS) / BPS_DENOM;
        uint256 totalWithFee = total + fee;

        require(
            IERC20(usdc).transferFrom(msg.sender, address(this), totalWithFee),
            "Flux: USDC pull failed"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            require(
                IERC20(usdc).transfer(recipients[i], amounts[i]),
                "Flux: transfer failed"
            );
        }

        totalSettledVolume += total;
        totalFeesAccrued   += fee;
        totalBatches       += 1;

        emit BatchSettled(msg.sender, recipients.length, total, fee, block.timestamp);
    }

    // ══════════════════════════════════════════════════════
    //  PAYMENT STREAMS (linear vesting)
    // ══════════════════════════════════════════════════════

    /**
     * @notice Create a linear USDC vesting stream.
     * @param recipient  Who receives the stream.
     * @param amount     Total USDC to stream (6 decimals).
     * @param startTime  Unix timestamp when streaming begins.
     * @param endTime    Unix timestamp when fully vested.
     */
    function createStream(
        address recipient,
        uint256 amount,
        uint64  startTime,
        uint64  endTime
    ) external returns (uint256 streamId) {
        require(recipient != address(0), "Flux: zero recipient");
        require(amount > 0, "Flux: zero amount");
        require(endTime > startTime, "Flux: invalid time range");
        require(startTime >= block.timestamp, "Flux: start in past");

        require(
            IERC20(usdc).transferFrom(msg.sender, address(this), amount),
            "Flux: USDC pull failed"
        );

        streamId = _nextStreamId++;
        streams[streamId] = Stream({
            sender:      msg.sender,
            recipient:   recipient,
            totalAmount: amount,
            released:    0,
            startTime:   startTime,
            endTime:     endTime,
            cancelled:   false
        });

        totalStreams += 1;

        emit StreamCreated(streamId, msg.sender, recipient, amount, startTime, endTime);
    }

    /**
     * @notice Recipient withdraws their currently vested portion.
     */
    function withdrawFromStream(uint256 streamId) external {
        Stream storage s = streams[streamId];
        require(msg.sender == s.recipient, "Flux: not recipient");
        require(!s.cancelled, "Flux: stream cancelled");
        require(block.timestamp >= s.startTime, "Flux: not started");

        uint256 claimable = _vestedAmount(s) - s.released;
        require(claimable > 0, "Flux: nothing to claim");

        s.released += claimable;
        require(IERC20(usdc).transfer(s.recipient, claimable), "Flux: transfer failed");

        emit StreamWithdrawn(streamId, s.recipient, claimable);
    }

    /**
     * @notice Sender cancels the stream; recipient gets vested portion, sender gets rest.
     */
    function cancelStream(uint256 streamId) external {
        Stream storage s = streams[streamId];
        require(msg.sender == s.sender, "Flux: not sender");
        require(!s.cancelled, "Flux: already cancelled");

        s.cancelled = true;

        uint256 vested    = _vestedAmount(s);
        uint256 toRecip   = vested - s.released;
        uint256 refund    = s.totalAmount - vested;

        if (toRecip > 0) {
            require(IERC20(usdc).transfer(s.recipient, toRecip), "Flux: transfer failed");
        }
        if (refund > 0) {
            require(IERC20(usdc).transfer(s.sender, refund), "Flux: refund failed");
        }

        emit StreamCancelled(streamId, s.sender, refund);
    }

    function _vestedAmount(Stream memory s) internal view returns (uint256) {
        if (block.timestamp < s.startTime) return 0;
        if (block.timestamp >= s.endTime)  return s.totalAmount;
        uint256 elapsed  = block.timestamp - s.startTime;
        uint256 duration = s.endTime       - s.startTime;
        return (s.totalAmount * elapsed) / duration;
    }

    /**
     * @notice Returns how much a recipient can withdraw right now.
     */
    function claimableAmount(uint256 streamId) external view returns (uint256) {
        Stream memory s = streams[streamId];
        if (s.cancelled) return 0;
        uint256 vested = _vestedAmount(s);
        return vested > s.released ? vested - s.released : 0;
    }

    // ══════════════════════════════════════════════════════
    //  AI AGENT REGISTRY
    // ══════════════════════════════════════════════════════

    /**
     * @notice Owner registers an AI agent wallet with a USDC spending cap.
     * @param agent     The agent's wallet address.
     * @param label     Human-readable label (e.g. "Treasury Bot v1").
     * @param budgetCap Max USDC the agent can spend (6 decimals, cumulative).
     */
    function registerAgent(
        address agent,
        string calldata label,
        uint256 budgetCap
    ) external onlyOwner {
        require(agent != address(0), "Flux: zero address");
        require(budgetCap > 0, "Flux: zero budget");
        agents[agent] = Agent({
            label:          label,
            budgetCap:      budgetCap,
            spent:          0,
            active:         true,
            registeredAt:   block.timestamp
        });
        agentList.push(agent);
        emit AgentRegistered(agent, label, budgetCap);
    }

    /**
     * @notice Update an agent's budget cap or active status.
     */
    function updateAgent(address agent, uint256 newBudgetCap, bool active) external onlyOwner {
        require(agents[agent].registeredAt > 0, "Flux: agent not found");
        agents[agent].budgetCap = newBudgetCap;
        agents[agent].active    = active;
        emit AgentUpdated(agent, newBudgetCap, active);
    }

    /**
     * @notice Registered AI agent triggers an autonomous USDC payment.
     *         The contract must hold enough USDC (funded by owner or deposits).
     * @param recipient  Payment destination.
     * @param amount     USDC amount (6 decimals).
     */
    function agentPay(address recipient, uint256 amount) external onlyActiveAgent {
        Agent storage a = agents[msg.sender];
        require(a.spent + amount <= a.budgetCap, "Flux: budget exceeded");
        require(recipient != address(0), "Flux: zero recipient");
        require(amount > 0, "Flux: zero amount");
        require(
            IERC20(usdc).balanceOf(address(this)) >= amount,
            "Flux: insufficient contract balance"
        );

        a.spent += amount;
        require(IERC20(usdc).transfer(recipient, amount), "Flux: transfer failed");

        emit AgentPayment(msg.sender, recipient, amount);
    }

    /**
     * @notice Owner deposits USDC into the contract for agent payments.
     */
    function depositForAgents(uint256 amount) external onlyOwner {
        require(
            IERC20(usdc).transferFrom(msg.sender, address(this), amount),
            "Flux: deposit failed"
        );
    }

    // ══════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════

    /**
     * @notice Owner withdraws accumulated platform fees.
     */
    function withdrawFees() external onlyOwner {
        uint256 amount = totalFeesAccrued;
        totalFeesAccrued = 0;
        require(amount > 0, "Flux: no fees");
        require(IERC20(usdc).transfer(owner, amount), "Flux: fee withdrawal failed");
        emit FeesWithdrawn(owner, amount);
    }

    // ══════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════

    function getStats() external view returns (
        uint256 volume,
        uint256 fees,
        uint256 batches,
        uint256 streamCount,
        uint256 agentCount
    ) {
        return (totalSettledVolume, totalFeesAccrued, totalBatches, totalStreams, agentList.length);
    }

    function getStream(uint256 streamId) external view returns (Stream memory) {
        return streams[streamId];
    }

    function getAgent(address agent) external view returns (Agent memory) {
        return agents[agent];
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }
}
