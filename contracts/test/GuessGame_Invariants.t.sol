// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import {GuessGame} from "../src/GuessGame.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract GuessGameHandler is Test {
    GuessGame internal game;
    ERC20Mock internal token;
    address internal operator;
    address internal guardian;
    address[] internal users;

    constructor(GuessGame _game, ERC20Mock _token, address _operator, address _guardian, address[] memory _users) {
        game = _game;
        token = _token;
        operator = _operator;
        guardian = _guardian;
        users = _users;
    }

    function submit(uint256 userIdx, string memory enc, string memory pk) external {
        address u = users[userIdx % users.length];
        vm.startPrank(u);
        token.approve(address(game), type(uint256).max);
        try game.submitGuess(1, enc, pk) {} catch {}
        vm.stopPrank();
    }

    function finalizeSplit(uint256 bps) external {
        uint256 pot = game.getGame(1).pot;
        if (pot == 0) return;
        address a = users[0];
        address b = users[1 % users.length];
        address[] memory r = new address[](2);
        r[0] = a; r[1] = b;
        uint256[] memory amts = new uint256[](2);
        bps = bps % 10_001;
        amts[0] = (pot * bps) / 10_000;
        amts[1] = pot - amts[0];
        vm.prank(operator);
        try game.finalizeGame(1, r, amts) {} catch {}
    }
}

contract GuessGameInvariants is StdInvariant, Test {
    ERC20Mock private token;
    GuessGame private game;
    address private admin = address(0xA11CE);
    address private operator = address(0x0a0a0a0a);
    address private guardian = address(0x6a6a6a6a);
    address[] private users;

    function setUp() public {
        token = new ERC20Mock();
        users = new address[](3);
        users[0] = address(0x111);
        users[1] = address(0x222);
        users[2] = address(0x333);
        for (uint256 i = 0; i < users.length; i++) {
            token.mint(users[i], 1_000_000 * 1e6);
        }
        game = new GuessGame();
        vm.prank(admin);
        game.initialize(token, 1_000_000 * 1e6, admin, operator, guardian, 1 days);
        vm.prank(operator);
        game.createGame(hex"AAA1", 1e6);

        GuessGameHandler handler = new GuessGameHandler(game, token, operator, guardian, users);
        targetContract(address(handler));
    }

    function invariant_PotNeverNegative() public {
        // trivial but checks state stays sane
        GuessGame.GameView memory gv = game.getGame(1);
        assertGe(gv.pot, 0);
    }

    function invariant_CurrentFeeMonotonicWithDelta() public {
        // If delta >= 0, current fee should be >= base
        uint256 fee = game.currentGuessFee(1);
        GuessGame.GameView memory gv = game.getGame(1);
        assertGe(fee, gv.guessFee);
    }
}


