/**
 * Represents a securely encrypted payload using AES-256-GCM.
 */
export type Sealed = {
  iv: string; // base64 encoded initialization vector
  ciphertext: string; // base64 encoded encrypted data
  tag: string; // base64 encoded authentication tag
};

/**
 * Represents a player's submitted guess, which is always stored encrypted.
 */
export type GuessRecord = {
  id: string; // Unique identifier for the guess submission
  sealed: Sealed; // The encrypted guess data
  submittedAt: number; // Timestamp of when the guess was submitted
};

/**
 * Represents the state of a single number guessing game.
 */
export type Game = {
  id:string; // Unique identifier for the game
  createdAt: number; // Timestamp of game creation
  joinDeadline: number; // Timestamp when submissions are no longer accepted
  min: number; // The minimum possible number for the guess
  max: number; // The maximum possible number for the guess
  target: number; // The secret number, generated at creation
  guessFee: number; // The cost to make a single guess
  guesses: GuessRecord[]; // A list of all incorrect guesses submitted
  finalized: boolean; // Flag indicating if the game has a winner
  winners?: string[]; // The player ID(s) of the winner(s)
  numParticipants?: number; // The total number of participants
};
