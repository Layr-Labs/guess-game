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
