// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {GuessGame} from "../src/GuessGame.sol";
import {IGuessGame} from "../src/interfaces/IGuessGame.sol";
import {IGuessDeals} from "../src/interfaces/IGuessDeals.sol";
import {IGuessGameAdmin} from "../src/interfaces/IGuessGameAdmin.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract GuessGameTest is Test {
    ERC20Mock private token;
    GuessGame private game;

    address private admin = address(0xA11CE);
    address private operator = address(0x0a0a0a0a);
    address private guardian = address(0x6a6a6a6a);
    address private alice = address(0xA1);
    address private bob = address(0xB0B);
    address private carol = address(0xCA);

    uint256 private constant USDC_DECIMALS = 6;

    function setUp() public {
        // Deploy mock USDC and mint to players
        token = new ERC20Mock();
        token.mint(alice, 1_000_000 * 10 ** USDC_DECIMALS);
        token.mint(bob,   1_000_000 * 10 ** USDC_DECIMALS);
        token.mint(carol, 1_000_000 * 10 ** USDC_DECIMALS);

        // Deploy GuessGame and initialize
        game = new GuessGame();
        vm.prank(admin);
        game.initialize(
            token,
            25_000 * 10 ** USDC_DECIMALS, // max pot
            admin,
            operator,
            guardian,
            3 days
        );
    }

    function testInitializeZeroAddressReverts() public {
        GuessGame g2 = new GuessGame();
        vm.expectRevert(IGuessGame.ZeroAddress.selector);
        g2.initialize(IERC20(address(0)), 1, admin, operator, guardian, 1);
    }

    function testCreateGameInvalidPublicKeyReverts() public {
        vm.startPrank(operator);
        vm.expectRevert(IGuessGame.InvalidPublicKey.selector);
        game.createGame(bytes(""), 1);
        vm.stopPrank();
    }

    function _createGame(bytes memory pubkey, uint256 fee) internal returns (uint256) {
        vm.startPrank(operator);
        uint256 gameId = game.createGame(pubkey, fee);
        vm.stopPrank();
        return gameId;
    }

    function testCreateAndUpdateGame() public {
        uint256 gameId = _createGame(hex"1234", 10 * 10 ** USDC_DECIMALS);
        IGuessGame.GameView memory gv = game.getGame(gameId);
        assertEq(gv.gameId, gameId);
        assertEq(gv.guessFee, 10 * 10 ** USDC_DECIMALS);
        assertEq(gv.active, true);
        assertEq(gv.pot, 0);

        // Update fee and public key
        vm.prank(operator);
        game.setGuessFee(gameId, 20 * 10 ** USDC_DECIMALS);
        vm.prank(operator);
        game.setGamePublicKey(gameId, hex"BEEF");

        gv = game.getGame(gameId);
        assertEq(gv.guessFee, 20 * 10 ** USDC_DECIMALS);
        assertEq(gv.publicKey, hex"BEEF");
    }

    function testSetGamePublicKeyInvalidReverts() public {
        uint256 gameId = _createGame(hex"01", 1);
        vm.prank(operator);
        vm.expectRevert(IGuessGame.InvalidPublicKey.selector);
        game.setGamePublicKey(gameId, bytes(""));
    }

    function testCurrentGuessFeeLinearDelta() public {
        uint256 baseFee = 5 * 10 ** USDC_DECIMALS;
        uint256 delta = 1 * 10 ** USDC_DECIMALS;
        uint256 gameId = _createGame(hex"AAAA", baseFee);

        vm.prank(operator);
        game.setGuessFeeDelta(gameId, delta);

        // Next guess id starts at 1
        assertEq(game.currentGuessFee(gameId), baseFee + 0 * delta);

        // Submit guesses and observe fee growth
        _approveAndSubmit(alice, gameId, "enc1", "pk1", baseFee + 0 * delta);
        assertEq(game.currentGuessFee(gameId), baseFee + 1 * delta);
        _approveAndSubmit(bob, gameId, "enc2", "pk2", baseFee + 1 * delta);
        assertEq(game.currentGuessFee(gameId), baseFee + 2 * delta);
    }

    function _approveAndSubmit(address user, uint256 gameId, string memory enc, string memory pk, uint256 expectedFee) internal {
        vm.startPrank(user);
        token.approve(address(game), type(uint256).max);
        uint256 balBefore = token.balanceOf(user);
        uint256 potBefore = game.getGame(gameId).pot;
        uint256 guessId = game.submitGuess(gameId, enc, pk);
        vm.stopPrank();

        // Guess ID increments from 1
        assertGt(guessId, 0);
        // Balance decreased by expected fee
        assertEq(token.balanceOf(user), balBefore - expectedFee);
        // Pot increased by expected fee
        assertEq(game.getGame(gameId).pot, potBefore + expectedFee);
    }

    function testPotCapPausesWithdrawals() public {
        uint256 fee = 13_000 * 10 ** USDC_DECIMALS; // 2 * 13k = 26k >= 25k cap
        uint256 gameId = _createGame(hex"1111", fee);

        // two guesses reach >= maxPot (25k)
        _approveAndSubmit(alice, gameId, "e1", "k1", fee);
        IGuessGame.GameView memory gv1 = game.getGame(gameId);
        assertTrue(gv1.active);
        _approveAndSubmit(bob, gameId, "e2", "k2", fee);
        IGuessGame.GameView memory gv2 = game.getGame(gameId);
        assertFalse(gv2.active);

        // withdrawals are paused after cap
        assertTrue(game.withdrawalsPaused());
    }

    function testOnlyOperatorCanSetGuessFeeDelta() public {
        uint256 gameId = _createGame(hex"DEAD", 1);
        vm.prank(alice);
        vm.expectRevert(IGuessGame.NotOperator.selector);
        game.setGuessFeeDelta(gameId, 1);
    }

    function testSubmitGuessInvalidPayloadReverts() public {
        uint256 gameId = _createGame(hex"AA", 1);
        vm.startPrank(alice);
        token.approve(address(game), type(uint256).max);
        vm.expectRevert(IGuessGame.InvalidPublicKey.selector);
        game.submitGuess(gameId, "", "pk");
        vm.expectRevert(IGuessGame.InvalidPublicKey.selector);
        game.submitGuess(gameId, "enc", "");
        vm.stopPrank();
    }

    function testSubmitGuessWhenPausedReverts() public {
        uint256 gameId = _createGame(hex"AA", 1);
        vm.prank(guardian);
        game.pause();
        vm.startPrank(alice);
        token.approve(address(game), type(uint256).max);
        vm.expectRevert(); // Pausable: paused
        game.submitGuess(gameId, "enc", "pk");
        vm.stopPrank();
        vm.prank(guardian);
        game.unpause();
    }

    function testFinalizeLengthMismatchReverts() public {
        uint256 gameId = _createGame(hex"CC", 1);
        _approveAndSubmit(alice, gameId, "e", "k", 1);
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint256[] memory a = new uint256[](1);
        a[0] = 1;
        vm.prank(operator);
        vm.expectRevert(IGuessGame.LengthMismatch.selector);
        game.finalizeGame(gameId, r, a);
    }

    function testRequestWithdrawalWhenPausedReverts() public {
        // credit balance via finalize
        uint256 gameId = _createGame(hex"F1", 1);
        _approveAndSubmit(alice, gameId, "e", "k", 1);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint256[] memory a = new uint256[](1);
        a[0] = 1;
        vm.prank(operator);
        game.finalizeGame(gameId, r, a);

        vm.prank(guardian);
        game.pauseWithdrawals();
        vm.prank(alice);
        vm.expectRevert(IGuessGame.WithdrawalsArePaused.selector);
        game.requestWithdrawal();
        vm.prank(guardian);
        game.unpauseWithdrawals();
    }

    function testRequestWithdrawalZeroBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert(IGuessGame.WithdrawalAmountZero.selector);
        game.requestWithdrawal();
    }

    function testClaimWithdrawalNotReadyReverts() public {
        uint256 gameId = _createGame(hex"F2", 1);
        _approveAndSubmit(alice, gameId, "e", "k", 1);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint256[] memory a = new uint256[](1);
        a[0] = 1;
        vm.prank(operator);
        game.finalizeGame(gameId, r, a);

        vm.prank(alice);
        game.requestWithdrawal();
        vm.prank(alice);
        vm.expectRevert(); // WithdrawalNotReady(uint256)
        game.claimWithdrawal();
    }

    function testClaimWithdrawalZeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(IGuessGame.WithdrawalAmountZero.selector);
        game.claimWithdrawal();
    }

    function testPauseUnpauseWithdrawalsGuards() public {
        vm.prank(guardian);
        game.pauseWithdrawals();
        vm.prank(guardian);
        vm.expectRevert(IGuessGame.WithdrawalsArePaused.selector);
        game.pauseWithdrawals();
        vm.prank(guardian);
        game.unpauseWithdrawals();
        vm.prank(guardian);
        vm.expectRevert(IGuessGame.WithdrawalsArePaused.selector);
        game.unpauseWithdrawals();
    }

    function testProposeDealInvalidGuessReverts() public {
        uint256 gameId = _createGame(hex"AB", 1);
        vm.prank(alice);
        vm.expectRevert(); // InvalidGuessReference
        game.proposeDeal(gameId, 0, bob, 100);
    }

    function testProposeDealZeroOwnerReverts() public {
        uint256 gameId = _createGame(hex"AB", 1);
        // create an existing guessId=1 owned by bob
        _approveAndSubmit(bob, gameId, "e", "k", 1);
        vm.prank(alice);
        vm.expectRevert(IGuessGame.ZeroAddress.selector);
        game.proposeDeal(gameId, 1, address(0), 100);
    }

    function testProposeDealInvalidBpsReverts() public {
        uint256 gameId = _createGame(hex"AB", 1);
        // create an existing guessId=1 owned by bob
        _approveAndSubmit(bob, gameId, "e", "k", 1);
        vm.prank(alice);
        vm.expectRevert();
        game.proposeDeal(gameId, 1, bob, 0);
        vm.prank(alice);
        vm.expectRevert();
        game.proposeDeal(gameId, 1, bob, 10_001);
    }

    function testDealAcceptRejectCancelAuthAndResolvedGuards() public {
        uint256 gameId = _createGame(hex"AB", 1);
        // create guess owned by bob
        _approveAndSubmit(bob, gameId, "e", "k", 1);
        vm.prank(alice);
        uint256 dealId = game.proposeDeal(gameId, 1, bob, 100);

        // accept by non-recipient
        vm.prank(carol);
        vm.expectRevert();
        game.acceptDeal(dealId);
        // reject by non-recipient
        vm.prank(carol);
        vm.expectRevert();
        game.rejectDeal(dealId);
        // cancel by non-viewer
        vm.prank(carol);
        vm.expectRevert();
        game.cancelDeal(dealId);

        // accept correctly
        vm.prank(bob);
        game.acceptDeal(dealId);
        // accept again -> resolved
        vm.prank(bob);
        vm.expectRevert();
        game.acceptDeal(dealId);
        // reject/cancel after resolved
        vm.prank(bob);
        vm.expectRevert();
        game.rejectDeal(dealId);
        vm.prank(alice);
        vm.expectRevert();
        game.cancelDeal(dealId);
    }

    function testGetGuessInvalidReverts() public {
        uint256 gameId = _createGame(hex"01", 1);
        // no guesses yet
        vm.expectRevert();
        game.getGuess(gameId, 0);
        vm.expectRevert();
        game.getGuess(gameId, 2);
    }

    function testNextGuessIdNonexistentGameReverts() public {
        vm.expectRevert();
        game.nextGuessId(999);
    }

    function testSetWithdrawalDelayGuardianOnly() public {
        vm.prank(alice);
        vm.expectRevert(IGuessGame.NotGuardian.selector);
        game.setWithdrawalDelay(10);
        vm.prank(guardian);
        game.setWithdrawalDelay(10);
        assertEq(game.withdrawalDelay(), 10);
    }

    function testFinalizeZerosPotAndCloses() public {
        uint256 gameId = _createGame(hex"F3", 1);
        _approveAndSubmit(alice, gameId, "e", "k", 1);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint256[] memory a = new uint256[](1);
        a[0] = 1;
        vm.prank(operator);
        game.finalizeGame(gameId, r, a);
        IGuessGame.GameView memory gv = game.getGame(gameId);
        assertEq(gv.pot, 0);
        assertFalse(gv.active);
    }

    function testGetDealNotFoundReverts() public {
        vm.expectRevert();
        game.getDeal(999999);
    }

    function testFinalizeAndWithdrawFlow() public {
        uint256 fee = 100 * 10 ** USDC_DECIMALS;
        uint256 gameId = _createGame(hex"9999", fee);

        // Alice and Bob submit guesses
        _approveAndSubmit(alice, gameId, "e1", "k1", fee);
        _approveAndSubmit(bob, gameId, "e2", "k2", fee);

        // Finalize: pay Alice 150, Bob 50 (sum = pot = 200)
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 150 * 10 ** USDC_DECIMALS;
        amounts[1] =  50 * 10 ** USDC_DECIMALS;

        vm.prank(operator);
        game.finalizeGame(gameId, recipients, amounts);

        // Internal balances updated
        assertEq(game.balanceOf(alice), amounts[0]);
        assertEq(game.balanceOf(bob), amounts[1]);

        // Request & claim withdrawal (not paused)
        vm.prank(alice);
        game.requestWithdrawal();
        IGuessGame.PendingWithdrawal memory p = game.pendingWithdrawal(alice);
        assertEq(p.amount, amounts[0]);

        // Time travel beyond delay
        vm.warp(block.timestamp + 3 days + 1);
        uint256 aliceBalBefore = token.balanceOf(alice);
        vm.prank(alice);
        game.claimWithdrawal();
        assertEq(token.balanceOf(alice), aliceBalBefore + amounts[0]);
        p = game.pendingWithdrawal(alice);
        assertEq(p.amount, 0);
    }

    function testFinalizeRevertsOnSumMismatch() public {
        uint256 fee = 50 * 10 ** USDC_DECIMALS;
        uint256 gameId = _createGame(hex"4444", fee);
        _approveAndSubmit(alice, gameId, "e1", "k1", fee);

        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = fee + 1; // mismatch

        vm.prank(operator);
        vm.expectRevert(IGuessGame.InvalidFee.selector);
        game.finalizeGame(gameId, recipients, amounts);
    }

    function testDealsLifecycleAndShareCap() public {
        uint256 fee = 10 * 10 ** USDC_DECIMALS;
        uint256 gameId = _createGame(hex"ABCD", fee);

        // Owner Bob submits a guess (owner of guessId=1)
        _approveAndSubmit(bob, gameId, "e2", "k2", fee);

        // Alice proposes 6000 bps to Bob's guess
        vm.startPrank(alice);
        uint256 dealId1 = game.proposeDeal(gameId, 1, bob, 6000);
        // Propose another 5000 bps → should revert (exceeds 100%)
        vm.expectRevert(); // OutgoingSharesExceeded custom error
        game.proposeDeal(gameId, 1, bob, 5000);
        vm.stopPrank();

        // Bob accepts the first deal
        vm.prank(bob);
        game.acceptDeal(dealId1);

        // Alice now can propose up to 4000 more (pending)
        vm.startPrank(alice);
        uint256 dealId2 = game.proposeDeal(gameId, 1, bob, 4000);
        vm.stopPrank();

        // Bob rejects the second deal, freeing reserved bps
        vm.prank(bob);
        game.rejectDeal(dealId2);

        // Viewer state reflects accepted shares
        (uint16 acceptedBps, uint16 reservedBps, uint256[] memory acceptedDeals) = game.getViewerGameShares(gameId, alice);
        assertEq(acceptedBps, 6000);
        assertEq(reservedBps, 0);
        assertEq(acceptedDeals.length, 1);
        assertEq(acceptedDeals[0], dealId1);

        // Views
        IGuessDeals.DealView[] memory pend = game.getPendingDealsForOwner(bob);
        assertEq(pend.length, 0);
        IGuessDeals.DealView[] memory acc = game.getAcceptedDealsForViewer(gameId, alice);
        assertEq(acc.length, 1);
        assertEq(acc[0].dealId, dealId1);
    }
}

contract GuessGameFuzzTest is Test {
    ERC20Mock private token;
    GuessGame private game;

    address private admin = address(0xA11CE);
    address private operator = address(0x0a0a0a0a);
    address private guardian = address(0x6a6a6a6a);
    address private alice = address(0xA1);
    address private bob = address(0xB0B);

    uint256 private constant USDC_DECIMALS = 6;

    function setUp() public {
        token = new ERC20Mock();
        // fund ample balances for fuzz
        token.mint(alice, 5_000_000 * 10 ** USDC_DECIMALS);
        token.mint(bob,   5_000_000 * 10 ** USDC_DECIMALS);

        game = new GuessGame();
        vm.prank(admin);
        game.initialize(token, 1_000_000 * 10 ** USDC_DECIMALS, admin, operator, guardian, 7 days);
        vm.prank(operator);
        game.createGame(hex"F00D", 0);
        // approve upfront
        vm.startPrank(alice);
        token.approve(address(game), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(bob);
        token.approve(address(game), type(uint256).max);
        vm.stopPrank();
    }

    function testFuzz_CurrentGuessFeeLinearDelta(uint256 baseFeeRaw, uint256 deltaRaw) public {
        uint256 baseFee = (baseFeeRaw % (1_000 * 10 ** USDC_DECIMALS));
        uint256 delta = (deltaRaw % (100 * 10 ** USDC_DECIMALS));
        // ensure nonzero for meaningful check
        if (baseFee == 0) baseFee = 1;

        // set base and delta
        vm.prank(operator);
        game.setGuessFee(1, baseFee);
        vm.prank(operator);
        game.setGuessFeeDelta(1, delta);

        uint256 expected = baseFee + 0 * delta;
        assertEq(game.currentGuessFee(1), expected);

        // two guesses
        vm.prank(alice);
        game.submitGuess(1, "e1", "k1");
        expected = baseFee + 1 * delta;
        assertEq(game.currentGuessFee(1), expected);

        vm.prank(bob);
        game.submitGuess(1, "e2", "k2");
        expected = baseFee + 2 * delta;
        assertEq(game.currentGuessFee(1), expected);
    }

    function testFuzz_FinalizeSplits(uint256 guessesRaw, uint16 shareBps) public {
        uint256 guesses = 1 + (guessesRaw % 5);
        uint256 fee = 100 * 10 ** USDC_DECIMALS;
        vm.prank(operator);
        game.setGuessFee(1, fee);
        // submit N guesses alternating players
        for (uint256 i = 0; i < guesses; i++) {
            if (i % 2 == 0) {
                vm.prank(alice);
                game.submitGuess(1, "e", "k");
            } else {
                vm.prank(bob);
                game.submitGuess(1, "e", "k");
            }
        }
        uint256 pot = game.getGame(1).pot;

        uint256 bps = uint256(shareBps) % 10_001; // 0..10000
        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint256[] memory a = new uint256[](2);
        a[0] = (pot * bps) / 10_000;
        a[1] = pot - a[0];

        vm.prank(operator);
        game.finalizeGame(1, r, a);
        assertEq(game.balanceOf(alice), a[0]);
        assertEq(game.balanceOf(bob), a[1]);
        assertEq(game.getGame(1).pot, 0);
    }

    function testFuzz_DealsShareCap(uint16 share1, uint16 share2) public {
        // create a guess owned by bob
        vm.prank(operator);
        game.setGuessFee(1, 1);
        vm.prank(bob);
        game.submitGuess(1, "e", "k"); // guessId = 1

        uint16 s1 = uint16(1 + (uint256(share1) % 10_000)); // 1..10000
        uint16 s2 = uint16(1 + (uint256(share2) % 10_000)); // 1..10000

        vm.prank(alice);
        uint256 dealId = game.proposeDeal(1, 1, bob, s1);

        // Accept first
        vm.prank(bob);
        game.acceptDeal(dealId);

        // Propose second — expect revert if s1+s2 > 10000
        vm.prank(alice);
        if (uint32(s1) + uint32(s2) > 10_000) {
            vm.expectRevert();
            game.proposeDeal(1, 1, bob, s2);
        } else {
            game.proposeDeal(1, 1, bob, s2);
        }
    }

    function testFuzz_WithdrawalDelay(uint32 delaySeconds) public {
        uint256 delay = 1 + (uint256(delaySeconds) % (30 days));
        vm.prank(guardian);
        game.setWithdrawalDelay(delay);

        // credit alice balance via finalize
        vm.prank(operator);
        game.setGuessFee(1, 10);
        vm.prank(alice);
        game.submitGuess(1, "e", "k");
        address[] memory r = new address[](1);
        r[0] = alice;
        uint256[] memory a = new uint256[](1);
        a[0] = 10;
        vm.prank(operator);
        game.finalizeGame(1, r, a);

        vm.prank(alice);
        game.requestWithdrawal();
        vm.prank(alice);
        vm.expectRevert();
        game.claimWithdrawal();

        vm.warp(block.timestamp + delay + 1);
        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        game.claimWithdrawal();
        assertEq(token.balanceOf(alice), balBefore + 10);
    }
}


