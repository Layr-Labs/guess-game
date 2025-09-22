pragma solidity ^0.8.24;

/// @title Guess Game Admin — Roles and global pause
/// @notice Minimal admin/ops interface to inspect role IDs and control global pause state.
/// @dev Implementation is expected to use OpenZeppelin AccessControl(U) and Pausable(U) in a UUPS setup.
interface IGuessGameAdmin {
    /// @notice Role identifier for the operator (creates games, updates game settings, finalizes payouts).
    function OPERATOR_ROLE() external view returns (bytes32);

    /// @notice Role identifier for the guardian (pause/unpause and upgrade authorization).
    function GUARDIAN_ROLE() external view returns (bytes32);

    /// @notice True if the contract is globally paused (affects functions gated by Pausable).
    function paused() external view returns (bool);

    /// @notice Pause/unpause the contract globally.
    /// @dev Expected to be restricted to GUARDIAN_ROLE.
    function pause() external;
    function unpause() external;
}

