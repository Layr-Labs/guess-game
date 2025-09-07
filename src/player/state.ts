import { Game } from '../game/types';

/**
 * Manages player state, including secret keys for authentication.
 * NOTE: This is a simple in-memory store for demonstration.
 * DO NOT USE IN PRODUCTION. In a real application, use a secure,
 * persistent database and hash the secret keys.
 */

// A simple in-memory map to store player <-> key relationships.
const playersByKey = new Map<string, string>(); // key -> playerId
const keysByPlayerId = new Map<string, string>(); // playerId -> key

/**
 * Creates a new player with a secret key.
 * @param playerId The unique ID for the player.
 * @param key The secret key for the player.
 */
export function createPlayer(playerId: string, key: string): void {
    playersByKey.set(key, playerId);
    keysByPlayerId.set(playerId, key);
}

/**
 * Finds a player by their secret key.
 * @param key The secret key.
 * @returns The playerId, or undefined if not found.
 */
export function getPlayerIdByKey(key: string): string | undefined {
    return playersByKey.get(key);
}

/**
 * Checks if a player ID already exists.
 * @param playerId The player ID to check.
 * @returns True if the player exists, false otherwise.
 */
export function playerExists(playerId: string): boolean {
    return keysByPlayerId.has(playerId);
}

/**
 * Returns a list of all registered player IDs.
 */
export function listPlayers(): string[] {
    return Array.from(keysByPlayerId.keys());
}
