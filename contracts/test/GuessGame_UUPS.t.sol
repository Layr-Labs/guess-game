// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {GuessGame} from "../src/GuessGame.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract GuessGameV2 is GuessGame {
    function version() external pure returns (uint256) { return 2; }
}

contract GuessGameUUPSTest is Test {
    ERC20Mock private token;
    address private admin = address(0xA11CE);
    address private operator = address(0x0a0a0a0a);
    address private guardian = address(0x6a6a6a6a);

    function setUp() public {
        token = new ERC20Mock();
    }

    function _deployProxy() internal returns (GuessGame proxied, GuessGame impl) {
        impl = new GuessGame();
        bytes memory data = abi.encodeWithSelector(
            GuessGame.initialize.selector,
            IERC20(address(token)),
            uint256(25_000 * 1e6),
            admin,
            operator,
            guardian,
            uint256(3 days)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        proxied = GuessGame(address(proxy));
    }

    function testUUPS_InitializeViaProxyAndUpgrade() public {
        (GuessGame proxied, ) = _deployProxy();

        // Sanity: roles and state
        assertEq(proxied.nextGameId(), 1);
        assertEq(address(proxied.token()), address(token));

        // Upgrade to V2 (guardian only)
        GuessGameV2 v2 = new GuessGameV2();
        vm.prank(guardian);
        proxied.upgradeToAndCall(address(v2), "");

        // New logic available
        uint256 ver = GuessGameV2(address(proxied)).version();
        assertEq(ver, 2);

        // Non-guardian cannot upgrade
        GuessGameV2 v3 = new GuessGameV2();
        vm.expectRevert();
        proxied.upgradeToAndCall(address(v3), "");
    }
}


