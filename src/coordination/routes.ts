import { Router, Request, Response } from 'express';
import { createDeal, getDeal, updateDealStatus, getPendingDealsForRecipient, Deal } from './state';
import { getPlayerIdByKey, playerExists } from '../player/state';
import { cryptoRandomId } from '../crypto';

const router = Router();

/**
 * @route POST /coordination/propose
 * Proposes a deal to another player.
 */
router.post('/propose', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const senderId = getPlayerIdByKey(key);
    if (!senderId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const { recipientId, message } = req.body as { recipientId: string; message: string };

    if (!recipientId || typeof recipientId !== 'string' || !playerExists(recipientId)) {
        return res.status(400).json({ error: 'recipientId is required and must belong to an existing player' });
    }
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required and must be a string' });
    }

    const newDeal: Deal = {
        dealId: `deal_` + cryptoRandomId(),
        senderId,
        recipientId,
        message,
        status: 'pending',
        timestamp: Date.now(),
    };

    createDeal(newDeal);
    res.status(201).json({ status: 'Deal proposed successfully', dealId: newDeal.dealId });
});

/**
 * @route GET /coordination/proposals
 * Retrieves all pending deal proposals for the authenticated player.
 */
router.get('/proposals', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const recipientId = getPlayerIdByKey(key);
    if (!recipientId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const proposals = getPendingDealsForRecipient(recipientId);
    res.status(200).json({ proposals });
});

/**
 * @route POST /coordination/respond
 * Responds to a deal proposal.
 */
router.post('/respond', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const recipientId = getPlayerIdByKey(key);
    if (!recipientId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const { dealId, response } = req.body as { dealId: string; response: 'accept' | 'reject' };

    if (!dealId || !['accept', 'reject'].includes(response)) {
        return res.status(400).json({ error: 'dealId and a valid response ("accept" or "reject") are required' });
    }

    const deal = getDeal(dealId);
    if (!deal || deal.recipientId !== recipientId) {
        return res.status(403).json({ error: 'Deal not found or you are not the recipient' });
    }
    if (deal.status !== 'pending') {
        return res.status(400).json({ error: 'This deal has already been resolved' });
    }

    const updatedDeal = updateDealStatus(dealId, response === 'accept' ? 'accepted' : 'rejected');
    res.status(200).json({ status: `Deal ${response === 'accept' ? 'accepted' : 'rejected'}`, deal: updatedDeal });
});

/**
 * @route GET /coordination/deal/:dealId
 * Retrieves the status of a specific deal.
 */
router.get('/deal/:dealId', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    }
    const key = authHeader.split(' ')[1];
    const requesterId = getPlayerIdByKey(key);
    if (!requesterId) {
        return res.status(403).json({ error: 'Invalid authentication key' });
    }

    const { dealId } = req.params;
    const deal = getDeal(dealId);

    if (!deal || (deal.senderId !== requesterId && deal.recipientId !== requesterId)) {
        return res.status(403).json({ error: 'Deal not found or you are not part of this deal' });
    }

    res.status(200).json({ deal });
});

export default router;
