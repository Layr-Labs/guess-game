import { Router, Request, Response } from 'express';
import { createPlayer, playerExists } from './state';
import { cryptoRandomId } from '../crypto';

const router = Router();

/**
 * @route POST /player/register
 * Registers a new player and returns a secret key for them.
 * The key should be stored securely by the client.
 * NOTE: This is for demonstration. In production, use a robust identity system.
 */
router.post('/register', (req: Request, res: Response) => {
    const { playerId } = req.body as { playerId: string };

    if (!playerId || typeof playerId !== 'string') {
        return res.status(400).json({ error: 'playerId is required and must be a string' });
    }

    if (playerExists(playerId)) {
        return res.status(409).json({ error: 'Player with this ID already exists' });
    }

    // Generate a new secret key for the player.
    const key = `sk_` + cryptoRandomId(); // Simple prefix for clarity

    createPlayer(playerId, key);

    // Return the key to the user. This is the ONLY time it's sent.
    res.status(201).json({ playerId, key });
});

export default router;
