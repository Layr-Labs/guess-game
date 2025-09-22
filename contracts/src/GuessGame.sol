// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {IGuessGame} from "./interfaces/IGuessGame.sol";
import {IGuessDeals} from "./interfaces/IGuessDeals.sol";
import {IGuessGameAdmin} from "./interfaces/IGuessGameAdmin.sol";

/// @title GuessGame — UUPS upgradeable, USDC‑funded private guess game with on‑chain deals
/// @notice Implements: (1) per‑guess fees and pot accounting; (2) encrypted guess submissions;
///         (3) per‑game public keys; (4) pot cap with automatic withdrawal pause; (5) two‑step
///         withdrawals with global delay; (6) operator‑driven finalization and distribution; and
///         (7) on‑chain deal proposals (viewer↔owner pot‑share agreements) tied to specific guesses.
/// @dev Key notes:
/// - Upgradeability: UUPS pattern via OpenZeppelin; upgrades restricted to `GUARDIAN_ROLE`.
/// - Fees: current fee is linear `base + delta * (k-1)` where k is the next guess id; operator can
///   adjust base (`setGuessFee`) and slope (`setGuessFeeDelta`). Off‑chain can map DBAE multipliers
///   into updated base/slope to approximate step‑wise fee changes.
/// - Withdrawals: separate pause control from global pause; withdrawals follow request→delay→claim.
/// - Deals: ensures a viewer’s accepted+reserved shares per game do not exceed 100%.
contract GuessGame is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IGuessGame,
    IGuessDeals,
    IGuessGameAdmin
{
    using SafeERC20 for IERC20;

    // Revert when a viewer's total outgoing shares (accepted + reserved + new) would exceed 100%.
    error OutgoingSharesExceeded(address viewer, uint256 gameId, uint16 accepted, uint16 reserved, uint16 added);

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Role that can create games, update settings, and finalize.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Role that can pause/unpause and authorize upgrades.
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /*//////////////////////////////////////////////////////////////
                                   STORAGE
    //////////////////////////////////////////////////////////////*/

    IERC20 private _token; // USDC (or chosen ERC‑20)
    uint256 private _withdrawalDelay; // seconds
    bool private _withdrawalsPaused; // separate from global pause

    uint256 private _maxPot; // per‑game cap (token units)

    uint256 private _nextGameId;
    uint256 private _nextDealId;

    struct GameInternal {
        uint256 guessFee;
        bytes publicKey;
        uint256 pot;
        bool active;
    }

    struct GuessInternal {
        address player;
        string encryptedNumber;
        uint256 timestamp;
        string publicKey;
    }

    mapping(uint256 => GameInternal) private _games; // gameId => game
    mapping(uint256 => mapping(uint256 => GuessInternal)) private _guesses; // gameId => guessId => guess
    mapping(uint256 => uint256) private _nextGuessId; // gameId => next id

    mapping(address => uint256) private _balances; // internal ledger

    mapping(address => PendingWithdrawal) private _pending; // address => pending withdrawal

    // Deals storage
    struct DealInternal {
        uint256 gameId;
        uint256 guessId;
        address owner;
        address viewer;
        uint16 potShareBps;
        IGuessDeals.DealStatus status;
        uint64 timestamp;
    }

    mapping(uint256 => DealInternal) private _deals; // dealId => deal
    mapping(address => uint256[]) private _pendingDealsByOwner; // owner => dealIds
    mapping(uint256 => uint256) private _pendingIndex; // dealId => index+1 in owner's array
    mapping(address => mapping(uint256 => uint256[])) private _acceptedDealsByViewer; // viewer => gameId => dealIds

    // DBAE linear fee increment per game: fee(base) + delta * (k-1), where k = nextGuessId
    mapping(uint256 => uint256) private _guessFeeDelta; // gameId => per-guess delta

    /// @notice Returns the current per-guess fee for the next guess in `gameId` under the linear model.
    function currentGuessFee(uint256 gameId) public view returns (uint256) {
        _requireGameExists(gameId);
        uint256 k = _nextGuessId[gameId]; // 1-based next guess index
        GameInternal storage g = _games[gameId];
        return g.guessFee + (_guessFeeDelta[gameId] * (k == 0 ? 0 : (k - 1)));
    }

    // Consolidated per-viewer per-game shares/indices for nicer code organization
    struct ViewerGameState {
        uint16 acceptedBps;              // total accepted outgoing shares for viewer in this game
        uint16 reservedBps;              // pending (proposed but unresolved) shares
        uint256[] acceptedDealIds;       // accepted deals for quick introspection
    }
    mapping(address => mapping(uint256 => ViewerGameState)) private _viewerGame; // viewer => gameId => state

    /*//////////////////////////////////////////////////////////////
                                   INIT
    //////////////////////////////////////////////////////////////*/

    /// @notice Initialize the upgradeable contract.
    /// @param token_ ERC‑20 token used for accounting (e.g., USDC).
    /// @param maxPot_ Per‑game cap in token units (e.g., 25_000 * 1e6 for USDC).
    /// @param admin Default admin for AccessControl.
    /// @param operator Address granted OPERATOR_ROLE.
    /// @param guardian Address granted GUARDIAN_ROLE (pause + upgrade).
    /// @param withdrawalDelay_ Initial withdrawal delay in seconds (use 0 to default to 7 days).
    function initialize(
        IERC20 token_,
        uint256 maxPot_,
        address admin,
        address operator,
        address guardian,
        uint256 withdrawalDelay_
    ) external initializer {
        require(
            address(token_) != address(0) && admin != address(0) && operator != address(0) && guardian != address(0),
            ZeroAddress()
        );

        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _token = token_;
        _maxPot = maxPot_;
        _withdrawalDelay = withdrawalDelay_ != 0 ? withdrawalDelay_ : 7 days;
        _nextGameId = 1;
        _nextDealId = 1;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    /*//////////////////////////////////////////////////////////////
                                 MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), NotOperator());
        _;
    }

    modifier onlyGuardian() {
        require(hasRole(GUARDIAN_ROLE, msg.sender), NotGuardian());
        _;
    }

    /*//////////////////////////////////////////////////////////////
                                   VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IGuessGame
    function token() external view returns (IERC20) {
        return _token;
    }

    /// @inheritdoc IGuessGame
    function nextGameId() external view returns (uint256) {
        return _nextGameId;
    }

    /// @inheritdoc IGuessGame
    function nextGuessId(uint256 gameId) external view returns (uint256) {
        _requireGameExists(gameId);
        return _nextGuessId[gameId];
    }

    /// @inheritdoc IGuessGame
    function maxPot() external view returns (uint256) {
        return _maxPot;
    }

    /// @inheritdoc IGuessGame
    function withdrawalDelay() external view returns (uint256) {
        return _withdrawalDelay;
    }

    /// @inheritdoc IGuessGame
    function withdrawalsPaused() external view returns (bool) {
        return _withdrawalsPaused;
    }

    /// @inheritdoc IGuessGame
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /// @inheritdoc IGuessGame
    function pendingWithdrawal(address account) external view returns (PendingWithdrawal memory) {
        return _pending[account];
    }

    /// @inheritdoc IGuessGame
    function getGame(uint256 gameId) public view returns (GameView memory v) {
        _requireGameExists(gameId);
        GameInternal storage g = _games[gameId];
        v = GameView({gameId: gameId, guessFee: g.guessFee, publicKey: g.publicKey, pot: g.pot, active: g.active});
    }

    /// @inheritdoc IGuessGame
    function potOf(uint256 gameId) external view returns (uint256) {
        _requireGameExists(gameId);
        return _games[gameId].pot;
    }

    /// @inheritdoc IGuessGame
    function getGuess(uint256 gameId, uint256 guessId) external view returns (GuessView memory gv) {
        _requireGameExists(gameId);
        require(guessId != 0 && guessId < _nextGuessId[gameId], InvalidGuessReference(gameId, guessId));
        GuessInternal storage q = _guesses[gameId][guessId];
        gv = GuessView({guessId: guessId, player: q.player, encryptedNumber: q.encryptedNumber, timestamp: q.timestamp, publicKey: q.publicKey});
    }

    /*//////////////////////////////////////////////////////////////
                               USER ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IGuessGame
    function requestWithdrawal() external nonReentrant whenNotPaused {
        require(!_withdrawalsPaused, WithdrawalsArePaused());

        PendingWithdrawal storage p = _pending[msg.sender];
        // If a previous request exists, release it back to balance before overwriting
        if (p.amount != 0) {
            _balances[msg.sender] += p.amount;
            p.amount = 0;
            p.availableAt = 0;
        }

        uint256 bal = _balances[msg.sender];
        require(bal != 0, WithdrawalAmountZero());

        // lock full balance for withdrawal
        _balances[msg.sender] = 0;
        uint256 availableAt = block.timestamp + _withdrawalDelay;
        _pending[msg.sender] = PendingWithdrawal({amount: bal, availableAt: availableAt});
        emit WithdrawalRequested(msg.sender, bal, availableAt);
    }

    /// @inheritdoc IGuessGame
    function claimWithdrawal() external nonReentrant whenNotPaused {
        require(!_withdrawalsPaused, WithdrawalsArePaused());
        PendingWithdrawal storage p = _pending[msg.sender];
        uint256 amount = p.amount;
        require(amount != 0, WithdrawalAmountZero());
        require(block.timestamp >= p.availableAt, WithdrawalNotReady(p.availableAt));
        // effects
        p.amount = 0;
        p.availableAt = 0;
        // interactions
        _token.safeTransfer(msg.sender, amount);
        emit WithdrawalClaimed(msg.sender, amount);
    }

    /// @inheritdoc IGuessGame
    function submitGuess(uint256 gameId, string calldata encryptedNumber, string calldata publicKey)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 guessId)
    {
        _requireGameExists(gameId);
        GameInternal storage g = _games[gameId];
        require(g.active, GameInactive(gameId));
        // Require non‑empty payloads
        require(bytes(encryptedNumber).length != 0 && bytes(publicKey).length != 0, InvalidPublicKey());

        // compute current dynamic fee per DBAE linear component
        uint256 fee = currentGuessFee(gameId);

        // transfer the token from the sender to the contract
        _token.safeTransferFrom(msg.sender, address(this), fee);

        // record guess
        guessId = _nextGuessId[gameId];
        _nextGuessId[gameId] = _nextGuessId[gameId] + 1;
        _guesses[gameId][guessId] = GuessInternal({
            player: msg.sender,
            encryptedNumber: encryptedNumber,
            timestamp: block.timestamp,
            publicKey: publicKey
        });

        // update pot
        uint256 newPot = g.pot + fee;
        g.pot = newPot;
        emit GuessSubmitted(gameId, guessId, msg.sender, fee, encryptedNumber, publicKey);
        emit PotUpdated(gameId, newPot);

        // enforce cap: close game and pause withdrawals if reached/exceeded
        if (newPot >= _maxPot) {
            g.active = false;
            if (!_withdrawalsPaused) {
                _withdrawalsPaused = true;
                emit WithdrawalsPaused();
            }
            emit PotCapReached(gameId, newPot);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                 OPERATOR
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IGuessGame
    function createGame(bytes calldata publicKey, uint256 guessFee) external onlyOperator whenNotPaused returns (uint256 gameId) {
        require(publicKey.length != 0, InvalidPublicKey());
        // Fee can be zero; if non‑zero, must be reasonable (no explicit upper bound here)
        gameId = _nextGameId;
        _nextGameId = gameId + 1;
        _games[gameId] = GameInternal({guessFee: guessFee, publicKey: publicKey, pot: 0, active: true});
        _nextGuessId[gameId] = 1;
        _guessFeeDelta[gameId] = 0;
        emit GameCreated(gameId, publicKey, guessFee);
    }

    /// @inheritdoc IGuessGame
    function setGuessFee(uint256 gameId, uint256 newGuessFee) external onlyOperator whenNotPaused {
        _requireGameExists(gameId);
        GameInternal storage g = _games[gameId];
        uint256 old = g.guessFee;
        g.guessFee = newGuessFee;
        emit GameFeeUpdated(gameId, old, newGuessFee);
    }

    /// @notice Set the linear fee delta for `gameId` used in currentGuessFee.
    function setGuessFeeDelta(uint256 gameId, uint256 newDelta) external onlyOperator whenNotPaused {
        _requireGameExists(gameId);
        _guessFeeDelta[gameId] = newDelta;
    }

    /// @inheritdoc IGuessGame
    function setGamePublicKey(uint256 gameId, bytes calldata publicKey) external onlyOperator whenNotPaused {
        _requireGameExists(gameId);
        require(publicKey.length != 0, InvalidPublicKey());
        GameInternal storage g = _games[gameId];
        bytes memory oldKey = g.publicKey;
        g.publicKey = publicKey;
        emit GamePublicKeyUpdated(gameId, oldKey, publicKey);
    }

    /// @inheritdoc IGuessGame
    function finalizeGame(
        uint256 gameId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOperator nonReentrant whenNotPaused {
        _requireGameExists(gameId);
        require(recipients.length == amounts.length, LengthMismatch());
        GameInternal storage g = _games[gameId];

        uint256 total = g.pot;
        uint256 n = amounts.length;
        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            sum += amounts[i];
        }
        require(sum == total, InvalidFee());

        // effects
        g.pot = 0;
        g.active = false;

        // interactions — distribute
        for (uint256 i = 0; i < n; i++) {
            _balances[recipients[i]] += amounts[i];
            emit PayoutDistributed(gameId, recipients[i], amounts[i]);
        }

        emit GameFinalized(gameId, total);
    }

    /*//////////////////////////////////////////////////////////////
                                 GUARDIAN
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IGuessGame
    function setWithdrawalDelay(uint256 newDelay) external onlyGuardian {
        uint256 old = _withdrawalDelay;
        _withdrawalDelay = newDelay;
        emit WithdrawalDelayUpdated(old, newDelay);
    }

    /// @inheritdoc IGuessGame
    function pauseWithdrawals() external onlyGuardian {
        require(!_withdrawalsPaused, WithdrawalsArePaused());
        _withdrawalsPaused = true;
        emit WithdrawalsPaused();
    }

    /// @inheritdoc IGuessGame
    function unpauseWithdrawals() external onlyGuardian {
        require(_withdrawalsPaused, WithdrawalsArePaused());
        _withdrawalsPaused = false;
        emit WithdrawalsUnpaused();
    }

    /// @inheritdoc IGuessGameAdmin
    function pause() external onlyGuardian {
        _pause();
    }

    /// @inheritdoc IGuessGameAdmin
    function unpause() external onlyGuardian {
        _unpause();
    }

    /// @inheritdoc IGuessGameAdmin
    function paused() public view override(IGuessGameAdmin, PausableUpgradeable) returns (bool) {
        return super.paused();
    }

    /*//////////////////////////////////////////////////////////////
                                   DEALS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IGuessDeals
    function proposeDeal(
        uint256 gameId,
        uint256 guessId,
        address owner,
        uint16 potShareBps
    ) external whenNotPaused returns (uint256 dealId) {
        _requireGameExists(gameId);
        require(guessId != 0 && guessId < _nextGuessId[gameId], InvalidGuessReference(gameId, guessId));
        require(owner != address(0), ZeroAddress());
        require(potShareBps > 0 && potShareBps <= 10_000, InvalidPotShareBps(potShareBps));

        // verify guess ownership
        GuessInternal storage q = _guesses[gameId][guessId];
        require(q.player == owner, InvalidGuessReference(gameId, guessId));

        // Enforce viewer's total cap (accepted + reserved + new <= 100%)
        ViewerGameState storage vgs = _viewerGame[msg.sender][gameId];
        uint32 sumAfter = uint32(vgs.acceptedBps) + uint32(vgs.reservedBps) + uint32(potShareBps);
        require(sumAfter <= 10_000, OutgoingSharesExceeded(msg.sender, gameId, vgs.acceptedBps, vgs.reservedBps, potShareBps));

        dealId = _nextDealId;
        _nextDealId = dealId + 1;

        _deals[dealId] = DealInternal({
            gameId: gameId,
            guessId: guessId,
            owner: owner,
            viewer: msg.sender,
            potShareBps: potShareBps,
            status: IGuessDeals.DealStatus.Pending,
            timestamp: uint64(block.timestamp)
        });

        // index as pending under owner
        _pendingIndex[dealId] = _pendingDealsByOwner[owner].length + 1;
        _pendingDealsByOwner[owner].push(dealId);
        // Reserve this share until the deal is resolved
        vgs.reservedBps = uint16(uint32(vgs.reservedBps) + uint32(potShareBps));

        emit DealProposed(dealId, gameId, guessId, owner, msg.sender, potShareBps);
    }

    /// @inheritdoc IGuessDeals
    function acceptDeal(uint256 dealId) external whenNotPaused {
        DealInternal storage d = _getDealOrRevert(dealId);
        require(d.status == IGuessDeals.DealStatus.Pending, DealAlreadyResolved(dealId));
        require(msg.sender == d.owner, NotDealRecipient(dealId, msg.sender));
        d.status = IGuessDeals.DealStatus.Accepted;

        // move from pending → accepted index
        _removePending(dealId, d.owner);
        _acceptedDealsByViewer[d.viewer][d.gameId].push(dealId);
        // Move reserved → accepted and track under viewer's game state
        ViewerGameState storage vgs = _viewerGame[d.viewer][d.gameId];
        if (vgs.reservedBps >= d.potShareBps) {
            vgs.reservedBps = uint16(uint32(vgs.reservedBps) - uint32(d.potShareBps));
        } else {
            vgs.reservedBps = 0;
        }
        uint32 newAccepted = uint32(vgs.acceptedBps) + uint32(d.potShareBps);
        require(newAccepted <= 10_000, OutgoingSharesExceeded(d.viewer, d.gameId, vgs.acceptedBps, vgs.reservedBps, d.potShareBps));
        vgs.acceptedBps = uint16(newAccepted);
        vgs.acceptedDealIds.push(dealId);

        emit DealAccepted(dealId, d.gameId, d.guessId);
    }

    /// @inheritdoc IGuessDeals
    function rejectDeal(uint256 dealId) external whenNotPaused {
        DealInternal storage d = _getDealOrRevert(dealId);
        require(d.status == IGuessDeals.DealStatus.Pending, DealAlreadyResolved(dealId));
        require(msg.sender == d.owner, NotDealRecipient(dealId, msg.sender));
        d.status = IGuessDeals.DealStatus.Rejected;
        _removePending(dealId, d.owner);
        // Release reserved bps
        ViewerGameState storage vgsR = _viewerGame[d.viewer][d.gameId];
        if (vgsR.reservedBps >= d.potShareBps) {
            vgsR.reservedBps = uint16(uint32(vgsR.reservedBps) - uint32(d.potShareBps));
        } else {
            vgsR.reservedBps = 0;
        }
        emit DealRejected(dealId, d.gameId, d.guessId);
    }

    /// @inheritdoc IGuessDeals
    function cancelDeal(uint256 dealId) external whenNotPaused {
        DealInternal storage d = _getDealOrRevert(dealId);
        require(d.status == IGuessDeals.DealStatus.Pending, DealAlreadyResolved(dealId));
        require(msg.sender == d.viewer, NotDealViewer(dealId, msg.sender));
        d.status = IGuessDeals.DealStatus.Cancelled;
        _removePending(dealId, d.owner);
        // Release reserved bps
        ViewerGameState storage vgsC = _viewerGame[d.viewer][d.gameId];
        if (vgsC.reservedBps >= d.potShareBps) {
            vgsC.reservedBps = uint16(uint32(vgsC.reservedBps) - uint32(d.potShareBps));
        } else {
            vgsC.reservedBps = 0;
        }
        emit DealCancelled(dealId, d.gameId, d.guessId);
    }

    /// @inheritdoc IGuessDeals
    function getDeal(uint256 dealId) external view returns (DealView memory v) {
        DealInternal storage d = _deals[dealId];
        require(d.owner != address(0), DealNotFound(dealId));
        v = DealView({
            dealId: dealId,
            gameId: d.gameId,
            guessId: d.guessId,
            owner: d.owner,
            viewer: d.viewer,
            potShareBps: d.potShareBps,
            status: d.status,
            timestamp: d.timestamp
        });
    }

    /// @inheritdoc IGuessDeals
    function getAcceptedDealsForViewer(uint256 gameId, address viewer)
        external
        view
        returns (DealView[] memory list)
    {
        uint256[] storage ids = _acceptedDealsByViewer[viewer][gameId];
        uint256 n = ids.length;
        list = new DealView[](n);
        for (uint256 i = 0; i < n; i++) {
            DealInternal storage d = _deals[ids[i]];
            list[i] = DealView({
                dealId: ids[i],
                gameId: d.gameId,
                guessId: d.guessId,
                owner: d.owner,
                viewer: d.viewer,
                potShareBps: d.potShareBps,
                status: d.status,
                timestamp: d.timestamp
            });
        }
    }

    /// @inheritdoc IGuessDeals
    function getPendingDealsForOwner(address owner) external view returns (DealView[] memory list) {
        uint256[] storage ids = _pendingDealsByOwner[owner];
        uint256 n = ids.length;
        list = new DealView[](n);
        for (uint256 i = 0; i < n; i++) {
            DealInternal storage d = _deals[ids[i]];
            list[i] = DealView({
                dealId: ids[i],
                gameId: d.gameId,
                guessId: d.guessId,
                owner: d.owner,
                viewer: d.viewer,
                potShareBps: d.potShareBps,
                status: d.status,
                timestamp: d.timestamp
            });
        }
    }

    /// @notice Helper: viewer's per-game shares and accepted deal ids (for off-chain accounting/UIs).
    function getViewerGameShares(uint256 gameId, address viewer)
        external
        view
        returns (uint16 acceptedBps, uint16 reservedBps, uint256[] memory acceptedDealIds)
    {
        ViewerGameState storage vgs = _viewerGame[viewer][gameId];
        return (vgs.acceptedBps, vgs.reservedBps, vgs.acceptedDealIds);
    }

    /*//////////////////////////////////////////////////////////////
                                 INTERNALS
    //////////////////////////////////////////////////////////////*/

    function _requireGameExists(uint256 gameId) internal view {
        require(gameId != 0 && gameId < _nextGameId, GameNotFound(gameId));
    }

    function _getDealOrRevert(uint256 dealId) internal view returns (DealInternal storage d) {
        d = _deals[dealId];
        require(d.owner != address(0), DealNotFound(dealId));
    }

    function _removePending(uint256 dealId, address owner) internal {
        uint256 idxPlus = _pendingIndex[dealId];
        if (idxPlus == 0) return; // not tracked (shouldn't happen)
        uint256 idx = idxPlus - 1;
        uint256[] storage arr = _pendingDealsByOwner[owner];
        uint256 last = arr.length - 1;
        if (idx != last) {
            uint256 movedId = arr[last];
            arr[idx] = movedId;
            _pendingIndex[movedId] = idx + 1;
        }
        arr.pop();
        delete _pendingIndex[dealId];
    }

    /*//////////////////////////////////////////////////////////////
                                   UUPS
    //////////////////////////////////////////////////////////////*/

    function _authorizeUpgrade(address) internal override onlyGuardian {}

    // Reserve storage slots for future upgrades
    uint256[41] private __gap;
}
