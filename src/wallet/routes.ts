import { Router, Request, Response } from 'express';
import { getBalance, addToBalance } from './state';

const router = Router();

/**
 * @route GET /wallet/:playerId/balance
 * Retrieves the current balance for a given player.
 */
router.get('/:playerId/balance', (req: Request, res: Response) => {
    const { playerId } = req.params;
    if (!playerId) {
        return res.status(400).json({ error: 'playerId is required' });
    }
    const balance = getBalance(playerId);
    res.status(200).json({ playerId, balance });
});

/**
 * @route POST /wallet/mint
 * Mints a specified amount of currency for a player.
 * This is a simplified function for demonstration purposes.
 */
router.post('/mint', (req: Request, res: Response) => {
    const { playerId, amount } = req.body as { playerId: string; amount: number };

    if (!playerId || typeof playerId !== 'string') {
        return res.status(400).json({ error: 'playerId is required and must be a string' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'amount is required and must be a positive number' });
    }

    const newBalance = addToBalance(playerId, amount);
    res.status(200).json({ playerId, newBalance });
});

export default router;
