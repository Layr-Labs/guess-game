import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';
import { Game, GuessRecord } from './types';
import { getGame, setGame } from './state';
import { encryptJSON, decryptJSON, cryptoRandomId } from '../crypto';
import { getBalance, addToBalance, subtractFromBalance } from '../wallet/state';
import { getPlayerIdByKey } from '../player/state';
import { sealingKey } from '../config';
import { getOutgoingShares } from '../coordination/state';

const router = Router();

function distributeRevenueGraph(gameId: string, rootWinnerId: string, totalAmount: number) {
    // DFS with cycle protection; clamp outgoing percentages per node to 100%
    const paid: Record<string, number> = {};
    const visiting = new Set<string>();

    function dfs(nodeId: string, amount: number) {
        if (amount <= 0) return;
        // Prevent cycles: if re-entering, pay to node and stop
        if (visiting.has(nodeId)) {
            paid[nodeId] = (paid[nodeId] || 0) + amount;
            return;
        }
        visiting.add(nodeId);

        const edges = getOutgoingShares(gameId, nodeId);
        let totalPct = 0;
        for (const e of edges) totalPct += Math.max(0, Math.min(100, e.percent));
        totalPct = Math.min(totalPct, 100);

        let allocated = 0;
        if (totalPct > 0) {
            for (const e of edges) {
                const pct = Math.max(0, Math.min(100, e.percent));
                if (pct === 0) continue;
                const share = Math.floor((amount * pct) / 100);
                if (share > 0) {
                    dfs(e.recipientId, share);
                    allocated += share;
                }
            }
        }
        const remainder = Math.max(0, amount - allocated);
        if (remainder > 0) paid[nodeId] = (paid[nodeId] || 0) + remainder;
        visiting.delete(nodeId);
    }

    dfs(rootWinnerId, totalAmount);
    // Apply payouts
    for (const [playerId, amt] of Object.entries(paid)) {
        if (amt > 0) addToBalance(playerId, amt);
    }
}

/**
 * Finalizes a game by finding the guess closest to the target number.
 * This is called automatically if the deadline is passed.
 * @param game The game object to finalize.
 */
function finalizeByClosestGuess(game: Game) {
    if (game.finalized) return;

    let bestDistance = Number.POSITIVE_INFINITY;
    const winners: string[] = [];
    const target = game.target;

    // Decrypt all sealed guesses to find the closest one.
    for (const rec of game.guesses) {
        try {
            const { playerId, guess } = decryptJSON(rec.sealed, sealingKey) as { playerId: string; guess: number };
            const dist = Math.abs(guess - target);
            if (dist < bestDistance) {
                bestDistance = dist;
                winners.length = 0; // Clear previous winners
                winners.push(playerId);
            } else if (dist === bestDistance) {
                winners.push(playerId); // Handle ties
            }
        } catch { }
    }

    game.finalized = true;
    game.winners = winners;
    game.numParticipants = game.guesses.length;

    // Distribute the pot across winners using transitive revenue sharing
    if (winners.length > 0) {
        const basePot = game.guesses.length * game.guessFee;
        const perWinner = basePot / winners.length;
        for (const w of winners) {
            distributeRevenueGraph(game.id, w, Math.floor(perWinner));
        }
    }
}

/**
 * @route POST /game/create
 * Creates a new guessing game with a secret number.
 */
router.post('/create', (req: Request, res: Response) => {
    const body = req.body as { joinDeadlineSeconds?: number; min?: number; max?: number, guessFee?: number };
    const now = Date.now();
    const joinDeadlineMs = Math.max(
        now + 10_000,
        now + Math.min(Math.max((body.joinDeadlineSeconds ?? 120) * 1000, 10_000), 60 * 60 * 1000)
    );
    const min = Number.isFinite(body.min) ? Math.floor(body.min as number) : 0;
    const max = Number.isFinite(body.max) ? Math.floor(body.max as number) : 1000;
    const guessFee = Number.isFinite(body.guessFee) && body.guessFee! > 0 ? Math.floor(body.guessFee!) : 0;

    if (max <= min) {
        res.status(400).json({ error: 'max must be greater than min' });
        return;
    }
    const id = cryptoRandomId();
    // The secret number is generated at creation and stored. It is never revealed.
    const target = min + randomInt(max - min + 1);
    const game: Game = {
        id,
        createdAt: now,
        joinDeadline: joinDeadlineMs,
        min,
        max,
        target,
        guessFee,
        guesses: [],
        finalized: false,
    };
    setGame(id, game);
    res.status(200).json({ gameId: id, joinDeadline: game.joinDeadline, min: game.min, max: game.max, guessFee: game.guessFee });
});

/**
 * @route POST /game/:id/guess
 * Submits a guess for a game. Provides immediate feedback.
 * Requires authentication via a secret key provided as a Bearer token.
 */
router.post('/:id/guess', (req: Request, res: Response) => {
    // Player authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const authenticatedPlayerId = getPlayerIdByKey(key);
    if (!authenticatedPlayerId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const gameId = req.params.id;
    const game = getGame(gameId);
    if (!game) {
        res.status(404).json({ error: 'game not found' });
        return;
    }
    if (game.finalized) {
        res.status(400).json({ error: 'game already finalized' });
        return;
    }
    const now = Date.now();
    if (now > game.joinDeadline) {
        res.status(400).json({ error: 'join deadline passed' });
        return;
    }
    const body = req.body as { playerId: string; guess: number };
    const playerId = String(body.playerId ?? '').trim();

    // Authorization check
    if (authenticatedPlayerId !== playerId) {
        return res.status(403).json({ error: 'Authenticated user does not match playerId in request' });
    }

    // Check balance and deduct fee
    if (game.guessFee > 0) {
        const balance = getBalance(playerId);
        if (balance < game.guessFee) {
            return res.status(402).json({ error: 'Insufficient funds for guess fee' });
        }
        subtractFromBalance(playerId, game.guessFee);
    }

    const guessRaw = body.guess;
    if (!playerId) {
        res.status(400).json({ error: 'playerId required' });
        return;
    }
    if (!Number.isFinite(guessRaw)) {
        res.status(400).json({ error: 'guess must be a number' });
        return;
    }
    const guess = Math.floor(guessRaw);
    if (guess < game.min || guess > game.max) {
        res.status(400).json({ error: `guess out of range [${game.min}, ${game.max}]` });
        return;
    }

    // Immediate feedback: if the guess is correct, the game ends immediately.
    if (guess === game.target) {
        game.finalized = true;
        game.winners = [playerId];
        game.numParticipants = game.guesses.length + 1; // Include the winner

        const basePot = (game.guesses.length + 1) * game.guessFee;
        distributeRevenueGraph(game.id, playerId, basePot);

        res.status(200).json({ correct: true, message: "You guessed correctly!" });
    } else {
        // If guess is wrong, provide a hint and store it for potential "closest guess" win.
        const distance = Math.abs(guess - game.target);
        const range = game.max - game.min;
        let hint: 'hot' | 'warm' | 'cold' = 'cold';
        if (range > 0) {
            if (distance / range <= 0.10) hint = 'hot';
            else if (distance / range <= 0.25) hint = 'warm';
        }

        const sealed = encryptJSON({ playerId, guess }, sealingKey);
        const id = cryptoRandomId();
        const rec: GuessRecord = { id, sealed, submittedAt: now };
        game.guesses.push(rec);
        const receipt = createHash('sha256').update(JSON.stringify({ id, sealed, gameId })).digest('hex');
        res.status(200).json({ correct: false, hint, receipt, submissionId: id });
    }
});

/**
 * @route GET /game/:id/status
 * Gets the current status of a game, including auto-finalizing if the deadline has passed.
 */
router.get('/:id/status', (req: Request, res: Response) => {
    const gameId = req.params.id;
    const game = getGame(gameId);
    if (!game) {
        res.status(404).json({ error: 'game not found' });
        return;
    }

    // If the game is over and no one has won, finalize by choosing the closest guess.
    if (!game.finalized && Date.now() > game.joinDeadline) {
        finalizeByClosestGuess(game);
    }

    res.status(200).json({
        gameId,
        joinDeadline: game.joinDeadline,
        finalized: game.finalized,
        numSubmissions: game.guesses.length,
        min: game.min,
        max: game.max,
        winners: game.winners ?? [], // Winners are revealed in the status
    });
});

export default router;
