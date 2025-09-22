// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {GuessGame} from "../src/GuessGame.sol";

/// @notice Upgrades an existing UUPS proxy to a new GuessGame implementation.
/// @dev Env vars:
/// - PROXY (address): existing proxy address
/// - SENDER (address, optional): guardian to broadcast from if using --sender
/// Use: forge script script/UpgradeGuessGame.s.sol:UpgradeGuessGame \
///      --rpc-url $RPC_URL --private-key $PK --broadcast -vvvv
contract UpgradeGuessGame is Script {
    function run() external {
        address proxy = vm.envAddress("PROXY");

        vm.startBroadcast();
        GuessGame newImpl = new GuessGame();
        GuessGame(proxy).upgradeToAndCall(address(newImpl), "");
        console2.log("Upgraded proxy", proxy, "to new impl", address(newImpl));
        vm.stopBroadcast();
    }
}


