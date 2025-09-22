pragma solidity ^0.8.24;

/// @title Guess Game Deals — On‑chain revenue‑share proposals
/// @notice Interface for proposing and accepting revenue‑share deals for specific guesses within a game.
///         A viewer proposes a percentage cut from a specific owner’s guess (by guessId).
///         The owner (recipient) can accept, which is then referenceable off‑chain for payout logic.
interface IGuessDeals {
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Status of a deal lifecycle.
    enum DealStatus {
        Pending,
        Accepted,
        Rejected,
        Cancelled
    }

    /// @notice Read‑only view of a deal.
    struct DealView {
        uint256 dealId;      // Globally unique ID
        uint256 gameId;      // The game the deal pertains to
        uint256 guessId;     // The guess the viewer requests to view/share
        address owner;       // Owner of the guess (recipient of the proposal)
        address viewer;      // Proposer (would receive a cut if they win)
        uint16  potShareBps; // Share in basis points (1% = 100 bps). Range (1..=10000)
        DealStatus status;   // Current status
        uint64  timestamp;   // Creation timestamp
    }

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidPotShareBps(uint16 bps);
    error InvalidGuessReference(uint256 gameId, uint256 guessId);
    error NotDealRecipient(uint256 dealId, address caller);
    error NotDealViewer(uint256 dealId, address caller);
    error DealNotFound(uint256 dealId);
    error DealAlreadyResolved(uint256 dealId);

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a viewer proposes a deal to an owner for a specific guess.
    event DealProposed(
        uint256 indexed dealId,
        uint256 indexed gameId,
        uint256 indexed guessId,
        address owner,
        address viewer,
        uint16 potShareBps
    );

    /// @notice Emitted when the owner accepts a pending deal.
    event DealAccepted(uint256 indexed dealId, uint256 indexed gameId, uint256 indexed guessId);

    /// @notice Emitted when the owner rejects a pending deal.
    event DealRejected(uint256 indexed dealId, uint256 indexed gameId, uint256 indexed guessId);

    /// @notice Emitted when the viewer cancels an open deal.
    event DealCancelled(uint256 indexed dealId, uint256 indexed gameId, uint256 indexed guessId);

    /*//////////////////////////////////////////////////////////////
                                 ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Propose a deal to the owner of `guessId` in `gameId` for `potShareBps` (1 to 10000).
    /// @dev Caller becomes the `viewer`. Implementations should verify that `guessId` exists and is owned by `owner`.
    function proposeDeal(
        uint256 gameId,
        uint256 guessId,
        address owner,
        uint16 potShareBps
    ) external returns (uint256 dealId);

    /// @notice Owner (recipient) accepts a pending deal.
    function acceptDeal(uint256 dealId) external;

    /// @notice Owner (recipient) rejects a pending deal.
    function rejectDeal(uint256 dealId) external;

    /// @notice Viewer cancels their pending deal.
    function cancelDeal(uint256 dealId) external;

    /*//////////////////////////////////////////////////////////////
                                   VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Read a specific deal.
    function getDeal(uint256 dealId) external view returns (DealView memory);

    /// @notice List accepted deals for a `viewer` within a `gameId`.
    /// @dev Intended for off‑chain payout logic to read.
    function getAcceptedDealsForViewer(uint256 gameId, address viewer)
        external
        view
        returns (DealView[] memory);

    /// @notice List pending deals for a recipient owner.
    function getPendingDealsForOwner(address owner) external view returns (DealView[] memory);
}

