// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMockERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Test-only router: pulls tokenIn from the caller, pays out a caller-
/// specified tokenOut amount. Lets FluxLimitOrder tests hit exact output values
/// (at-trigger, below-trigger) deterministically. Must be pre-funded with tokenOut.
contract MockRouter {
    function mockSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address to) external {
        require(IMockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "MockRouter: pull failed");
        require(IMockERC20(tokenOut).transfer(to, amountOut), "MockRouter: payout failed");
    }
}
