// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {GuessGame} from "../src/GuessGame.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Deploys GuessGame implementation and an ERC1967 UUPS proxy initialized via ABI data.
/// @dev Env vars (required):
/// - TOKEN (address): ERC20 token address (e.g., USDC)
/// - MAX_POT (uint256): per-game cap in token units
/// - ADMIN (address)
/// - OPERATOR (address)
/// - GUARDIAN (address)
/// - WITHDRAWAL_DELAY (uint256 seconds)
/// Use: forge script script/DeployGuessGame.s.sol:DeployGuessGame \
///      --rpc-url $RPC_URL --private-key $PK --broadcast -vvvv
contract DeployGuessGame is Script {
    function run() external {
        address token = vm.envAddress("TOKEN");
        uint256 maxPot = vm.envUint("MAX_POT");
        address admin = vm.envAddress("ADMIN");
        address operator = vm.envAddress("OPERATOR");
        address guardian = vm.envAddress("GUARDIAN");
        uint256 withdrawalDelay = vm.envUint("WITHDRAWAL_DELAY");

        vm.startBroadcast();

        GuessGame impl = new GuessGame();
        bytes memory data = abi.encodeWithSelector(
            GuessGame.initialize.selector,
            IERC20(token),
            maxPot,
            admin,
            operator,
            guardian,
            withdrawalDelay
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        GuessGame game = GuessGame(address(proxy));

        console2.log("GuessGame implementation:", address(impl));
        console2.log("GuessGame proxy:", address(game));

        vm.stopBroadcast();
    }
}


