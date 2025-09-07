import { Game } from './types';

// A simple in-memory map to store game states.
// In a production environment, this would be replaced with a persistent database.
const games = new Map<string, Game>();

/**
 * Retrieves a game state by its ID.
 * @param id The unique ID of the game.
 * @returns The game object, or undefined if not found.
 */
export function getGame(id: string): Game | undefined {
    return games.get(id);
}

/**
 * Creates or updates a game state.
 * @param id The unique ID of the game.
 * @param game The game object to store.
 */
export function setGame(id: string, game: Game): void {
    games.set(id, game);
}

/**
 * Lists all activities (playerId + qualitative hint) for a given game.
 * Does not reveal raw numbers.
 */
export function listGameActivities(id: string): { playerId: string; hint: 'hot' | 'warm' | 'cold' }[] {
    const game = games.get(id);
    if (!game) return [];
    const range = game.max - game.min;
    const out: { playerId: string; hint: 'hot' | 'warm' | 'cold' }[] = [];
    for (const rec of game.guesses) {
        try {
            const sealed = rec.sealed;
            // lazy import to avoid cycles
            const { decryptJSON } = require('../crypto');
            const { sealingKey } = require('../config');
            const payload = decryptJSON(sealed, sealingKey) as { playerId: string; guess: number };
            const distance = Math.abs(payload.guess - game.target);
            let hint: 'hot' | 'warm' | 'cold' = 'cold';
            if (range > 0) {
                if (distance / range <= 0.10) hint = 'hot';
                else if (distance / range <= 0.25) hint = 'warm';
            }
            out.push({ playerId: payload.playerId, hint });
        } catch {
            // skip
        }
    }
    return out;
}
