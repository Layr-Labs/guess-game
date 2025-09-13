import { Router, Request, Response } from 'express';
import { createDeal, Deal, updateDealStatus, getDeal, grantSharePermission, getPendingDealsForRecipient } from './state';
import { getPlayerIdByKey, playerExists, listPlayers } from '../player/state';
import { cryptoRandomId } from '../crypto';
import { getGame, listGameActivities } from '../game/state';
import { decryptJSON } from '../crypto';
import { sealingKey } from '../config';
import { hasSharePermission } from './state';

const router = Router();

/**
 * @route GET /coordination/players
 * Lists all registered players (IDs only).
 */
router.get('/players', (_req: Request, res: Response) => {
    res.status(200).json({ players: listPlayers() });
});

/**
 * @route GET /coordination/:gameId/activities
 * Lists all activities (playerId + hint) for a game. No numbers revealed.
 */
router.get('/:gameId/activities', (req: Request, res: Response) => {
    const { gameId } = req.params;
    const game = getGame(gameId);
    if (!game) return res.status(404).json({ error: 'game not found' });

    // Optional authentication: if provided, we can reveal guesses per accepted deals
    let viewerId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const key = authHeader.split(' ')[1];
        viewerId = getPlayerIdByKey(key);
    }

    const range = game.max - game.min;
    const activities = [] as Array<{ playerId: string; hint: 'hot' | 'warm' | 'cold'; guess?: number }>;
    for (const rec of game.guesses) {
        try {
            const payload = decryptJSON(rec.sealed, sealingKey) as { playerId: string; guess: number };
            const distance = Math.abs(payload.guess - game.target);
            let hint: 'hot' | 'warm' | 'cold' = 'cold';
            if (range > 0) {
                if (distance / range <= 0.10) hint = 'hot';
                else if (distance / range <= 0.25) hint = 'warm';
            }
            const item: { playerId: string; hint: 'hot' | 'warm' | 'cold'; guess?: number } = { playerId: payload.playerId, hint };
            if (viewerId && hasSharePermission(gameId, payload.playerId, viewerId)) {
                item.guess = payload.guess;
            }
            activities.push(item);
        } catch {
            // ignore malformed entries
        }
    }
    res.status(200).json({ gameId, activities });
});

/**
 * @route POST /coordination/auto-propose
 * Automatically propose a fixed message to a target player.
 * Body: { recipientId, potSharePercent, gameId }
 * Message template: "I have a {hint} clue. Share the number for {percent}% pot share?"
 */
router.post('/auto-propose', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const senderId = getPlayerIdByKey(key);
    if (!senderId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const { recipientId, potSharePercent, gameId } = req.body as { recipientId: string; potSharePercent: number; gameId: string };
    if (!recipientId || typeof recipientId !== 'string' || !playerExists(recipientId)) {
        return res.status(400).json({ error: 'recipientId is required and must belong to an existing player' });
    }
    if (!Number.isFinite(potSharePercent) || potSharePercent <= 0 || potSharePercent > 100) {
        return res.status(400).json({ error: 'potSharePercent must be in (0, 100]' });
    }
    const game = getGame(gameId);
    if (!game) return res.status(404).json({ error: 'game not found' });

    // Find recipient hint from activities
    const activities = listGameActivities(gameId);
    const rec = activities.find((a: { playerId: string; hint: 'hot' | 'warm' | 'cold' }) => a.playerId === recipientId);
    const hint = rec?.hint || 'warm';
    const message = `I have a ${hint} clue. Share the number for ${potSharePercent}% pot share?`;

    const newDeal: Deal = {
        dealId: `deal_` + cryptoRandomId(),
        gameId,
        senderId,
        recipientId,
        message,
        potSharePercent,
        status: 'pending',
        timestamp: Date.now(),
    };

    createDeal(newDeal);
    res.status(201).json({ status: 'Deal proposed successfully', dealId: newDeal.dealId, message });
});

/**
 * @route POST /coordination/accept
 * Recipient accepts a deal; grants permission for sender to view their guesses for gameId.
 * Body: { dealId }
 */
router.post('/accept', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const recipientId = getPlayerIdByKey(key);
    if (!recipientId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const { dealId } = req.body as { dealId: string };
    if (!dealId) return res.status(400).json({ error: 'dealId is required' });
    const deal = getDeal(dealId);
    if (!deal || deal.recipientId !== recipientId) {
        return res.status(404).json({ error: 'deal not found or not authorized' });
    }
    if (deal.status !== 'pending') {
        return res.status(400).json({ error: 'deal already resolved' });
    }

    updateDealStatus(dealId, 'accepted');
    // Grant permission: recipient authorizes sender to view recipient's guesses
    grantSharePermission(deal.gameId, recipientId, deal.senderId);

    res.status(200).json({ status: 'accepted', dealId });
});

/**
 * @route GET /coordination/pending-deals
 * Fetches all pending deals for the authenticated player.
 */
router.get('/pending-deals', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const playerId = getPlayerIdByKey(key);
    if (!playerId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const pendingDeals = getPendingDealsForRecipient(playerId);
    res.status(200).json({ pendingDeals });
});

export default router;
