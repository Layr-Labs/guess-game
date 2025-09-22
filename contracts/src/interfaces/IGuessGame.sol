pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Guess Game (Core) — Upgradeable, USDC‑funded, encrypted guesses
/// @notice Interface for a UUPS‑upgradeable game where players deposit USDC, submit an
///         encrypted number (string) as their guess together with a fee, and the
///         operator later finalizes and distributes the pot. Public encryption keys are
///         stored on‑chain per game; decryption and winner selection occur off‑chain.
/// @dev
/// - Amounts use the underlying ERC‑20 token decimals (e.g., USDC 6 decimals).
/// - Withdrawal is a two‑step flow with an adjustable global delay.
/// - Admin roles (to be enforced in implementation):
///     • OPERATOR_ROLE — creates games, updates game settings, finalizes and distributes.
///     • GUARDIAN_ROLE — can pause/unpause (including withdrawals) and authorize upgrades.
/// - Pot cap per game is exposed via `maxPot()`. Implementations should auto‑pause
///   withdrawals when a game pot reaches this cap and emit `PotCapReached`.
interface IGuessGame {
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Read‑only view of a game configuration and pot.
    struct GameView {
        uint256 gameId;          // Unique, sequential ID assigned at creation
        uint256 guessFee;        // Fee (in token units) required per guess
        bytes   publicKey;       // Public key used to encrypt guesses (format decided off‑chain)
        uint256 pot;             // Accumulated pot (sum of collected fees)
        bool    active;          // Game is open for guesses if true
    }

    /// @notice Read‑only view of a single guess.
    struct GuessView {
        uint256 guessId;         // Unique within its game (sequential)
        address player;          // Submitter of the guess
        string  encryptedNumber; // The encrypted number (opaque string)
        uint256 timestamp;       // Block timestamp when submitted
        string  publicKey;       // Public key used to fetch guesses later
    }

    /// @notice Read‑only view of a pending withdrawal.
    struct PendingWithdrawal {
        uint256 amount;      // Amount requested for withdrawal
        uint256 availableAt; // Timestamp after which `claimWithdrawal` succeeds
    }

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotOperator();
    error NotGuardian();
    error ZeroAddress();
    error GameNotFound(uint256 gameId);
    error GameInactive(uint256 gameId);
    error InvalidFee();
    error InvalidPublicKey();
    error InsufficientBalance(address account, uint256 balance, uint256 needed);
    error WithdrawalsArePaused();
    error WithdrawalNotReady(uint256 availableAt);
    error WithdrawalAmountZero();
    error WithdrawalAmountExceeds(uint256 requested, uint256 available);
    error CapReached(uint256 gameId, uint256 cap, uint256 potAfter);
    error LengthMismatch();
    error ContractPaused();

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new game is created.
    event GameCreated(uint256 indexed gameId, bytes publicKey, uint256 guessFee);

    /// @notice Emitted when a game fee is updated.
    event GameFeeUpdated(uint256 indexed gameId, uint256 oldFee, uint256 newFee);

    /// @notice Emitted when a game public key is updated.
    event GamePublicKeyUpdated(uint256 indexed gameId, bytes oldKey, bytes newKey);

    /// @notice Emitted when a guess is submitted.
    event GuessSubmitted(
        uint256 indexed gameId,
        uint256 indexed guessId,
        address indexed player,
        uint256 feePaid,
        string encryptedNumber,
        string publicKey
    );

    /// @notice Emitted when a game pot changes (e.g., on new guess).
    event PotUpdated(uint256 indexed gameId, uint256 newPot);

    /// @notice Emitted when a game pot reaches the configured cap.
    event PotCapReached(uint256 indexed gameId, uint256 pot);

    /// @notice Emitted on successful USDC deposit.
    event Deposited(address indexed account, uint256 amount, uint256 newBalance);

    /// @notice Emitted when the global withdrawal delay changes.
    event WithdrawalDelayUpdated(uint256 oldDelay, uint256 newDelay);

    /// @notice Emitted when a withdrawal is requested.
    event WithdrawalRequested(address indexed account, uint256 amount, uint256 availableAt);

    /// @notice Emitted when a pending withdrawal is claimed.
    event WithdrawalClaimed(address indexed account, uint256 amount);

    /// @notice Emitted when withdrawals are paused/unpaused.
    event WithdrawalsPaused();
    event WithdrawalsUnpaused();

    /// @notice Emitted when the operator finalizes a game (off‑chain determination of winners).
    event GameFinalized(uint256 indexed gameId, uint256 totalPot);

    /// @notice Emitted per payout during finalization.
    event PayoutDistributed(uint256 indexed gameId, address indexed to, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC (or chosen ERC‑20) token used for deposits, fees and payouts.
    function token() external view returns (IERC20);

    /// @notice Next game ID that will be assigned on creation.
    function nextGameId() external view returns (uint256);

    /// @notice Next guess ID for a given game.
    function nextGuessId(uint256 gameId) external view returns (uint256);

    /// @notice Returns the max pot allowed per game (token units). Example: 25,000 USDC = 25_000 * 1e6.
    function maxPot() external view returns (uint256);

    /// @notice Returns the global withdrawal delay (in seconds).
    function withdrawalDelay() external view returns (uint256);

    /// @notice True if withdrawals are currently paused.
    function withdrawalsPaused() external view returns (bool);

    /// @notice Read an account’s internal balance (deposited funds minus spends and pending withdrawal).
    function balanceOf(address account) external view returns (uint256);

    /// @notice Read an account’s current pending withdrawal, if any.
    function pendingWithdrawal(address account) external view returns (PendingWithdrawal memory);

    /// @notice Read a game’s configuration and current pot.
    function getGame(uint256 gameId) external view returns (GameView memory);

    /// @notice Read a specific guess.
    function getGuess(uint256 gameId, uint256 guessId) external view returns (GuessView memory);

    /// @notice Convenience to return a game’s current pot.
    function potOf(uint256 gameId) external view returns (uint256);

    /*//////////////////////////////////////////////////////////////
                               USER ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Start a withdrawal. It becomes claimable after `withdrawalDelay()`.
    /// @dev Can be called again to overwrite the existing request (implementation‑specific).
    function requestWithdrawal() external;

    /// @notice Claim the pending withdrawal after the delay has elapsed.
    function claimWithdrawal() external;

    /// @notice Submit an encrypted guess to `gameId`. Deducts the game’s `guessFee` from caller’s balance.
    /// @param gameId The target game.
    /// @param encryptedNumber The encrypted number (opaque string, produced off‑chain with the game’s public key).
    /// @return guessId The sequential guess ID within the game.
    function submitGuess(uint256 gameId, string calldata encryptedNumber, string calldata publicKey) external returns (uint256 guessId);

    /*//////////////////////////////////////////////////////////////
                                 OPERATOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Create a new game with an initial public key and per‑guess fee.
    /// @dev Only callable by OPERATOR_ROLE.
    function createGame(bytes calldata publicKey, uint256 guessFee) external returns (uint256 gameId);

    /// @notice Update the per‑guess fee for `gameId`. Applies to future guesses only.
    /// @dev Only callable by OPERATOR_ROLE.
    function setGuessFee(uint256 gameId, uint256 newGuessFee) external;

    /// @notice Rotate/update the public encryption key for `gameId`.
    /// @dev Only callable by OPERATOR_ROLE.
    function setGamePublicKey(uint256 gameId, bytes calldata publicKey) external;

    /// @notice Finalize a game and distribute the pot according to an off‑chain decision (e.g., winner and deals).
    /// @dev Only callable by OPERATOR_ROLE. Implementations should verify amounts sum to the game pot and
    ///      zero‑out the pot before transfers to prevent re‑distribution.
    /// @param gameId The game to finalize.
    /// @param recipients Destination accounts to receive payouts.
    /// @param amounts Amounts per account (must align with recipients).
    function finalizeGame(
        uint256 gameId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external;

    /*//////////////////////////////////////////////////////////////
                                 GUARDIAN
    //////////////////////////////////////////////////////////////*/

    /// @notice Set the global withdrawal delay (in seconds).
    /// @dev Only callable by GUARDIAN_ROLE.
    function setWithdrawalDelay(uint256 newDelay) external;

    /// @notice Pause and unpause withdrawals globally.
    /// @dev Only callable by GUARDIAN_ROLE. Does not necessarily pause other contract functions.
    function pauseWithdrawals() external;
    function unpauseWithdrawals() external;
}

