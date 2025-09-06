/**
 * Manages the in-memory ledger for player balances.
 */

// For simplicity, balances are stored in a key-value map in memory.
// In a real application, this should be a persistent database.
const balances = new Map<string, number>();

/**
 * Gets the balance for a given player.
 * @param playerId The ID of the player.
 * @returns The player's current balance, or 0 if they have no record.
 */
export function getBalance(playerId: string): number {
    return balances.get(playerId) ?? 0;
}

/**
 * Adds a specified amount to a player's balance.
 * @param playerId The ID of the player.
 * @param amount The amount to add.
 * @returns The new balance.
 */
export function addToBalance(playerId: string, amount: number): number {
    const currentBalance = getBalance(playerId);
    const newBalance = currentBalance + amount;
    balances.set(playerId, newBalance);
    return newBalance;
}

/**
 * Subtracts a specified amount from a player's balance.
 * @param playerId The ID of the player.
 * @param amount The amount to subtract.
 * @returns The new balance.
 */
export function subtractFromBalance(playerId: string, amount: number): number {
    const currentBalance = getBalance(playerId);
    const newBalance = currentBalance - amount;
    balances.set(playerId, newBalance);
    return newBalance;
}
