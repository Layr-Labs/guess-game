/**
 * Represents a deal proposal between two players.
 */
export type Deal = {
    dealId: string;
    gameId: string;
    senderId: string; // proposer (viewer)
    recipientId: string; // owner who may share
    message: string;
    potSharePercent: number;
    status: 'pending' | 'accepted' | 'rejected';
    timestamp: number;
};

// In-memory stores for deals. In production, use a persistent database.
const deals = new Map<string, Deal>();
const pendingDealsByRecipient = new Map<string, string[]>();

// In-memory share permissions: key = `${gameId}|${ownerId}|${viewerId}`
const sharePermissions = new Set<string>();

/**
 * Creates and stores a new deal proposal.
 * @param deal The deal object to store.
 */
export function createDeal(deal: Deal): void {
    deals.set(deal.dealId, deal);
    const recipientDeals = pendingDealsByRecipient.get(deal.recipientId) ?? [];
    recipientDeals.push(deal.dealId);
    pendingDealsByRecipient.set(deal.recipientId, recipientDeals);
}

/**
 * Retrieves a deal by its ID.
 * @param dealId The ID of the deal.
 * @returns The deal object, or undefined if not found.
 */
export function getDeal(dealId: string): Deal | undefined {
    return deals.get(dealId);
}

/**
 * Updates the status of an existing deal.
 * @param dealId The ID of the deal to update.
 * @param status The new status.
 * @returns The updated deal object, or undefined if not found.
 */
export function updateDealStatus(dealId: string, status: 'accepted' | 'rejected'): Deal | undefined {
    const deal = deals.get(dealId);
    if (deal) {
        deal.status = status;
        // Remove from pending list once resolved
        const recipientDeals = pendingDealsByRecipient.get(deal.recipientId)?.filter(id => id !== dealId);
        if (recipientDeals) {
            pendingDealsByRecipient.set(deal.recipientId, recipientDeals);
        }
    }
    return deal;
}

/**
 * Retrieves all pending deals for a specific recipient.
 * @param recipientId The ID of the player.
 * @returns An array of pending deals.
 */
export function getPendingDealsForRecipient(recipientId: string): Deal[] {
    const dealIds = pendingDealsByRecipient.get(recipientId) ?? [];
    return dealIds.map(id => deals.get(id)).filter(deal => deal !== undefined) as Deal[];
}

/**
 * Grants permission for viewerId to view ownerId's guesses for gameId.
 */
export function grantSharePermission(gameId: string, ownerId: string, viewerId: string): void {
    sharePermissions.add(`${gameId}|${ownerId}|${viewerId}`);
}

/**
 * Checks permission for viewerId to view ownerId's guesses for gameId.
 */
export function hasSharePermission(gameId: string, ownerId: string, viewerId: string): boolean {
    return sharePermissions.has(`${gameId}|${ownerId}|${viewerId}`);
}

/**
 * Returns accepted share terms for a given winner (viewer) in a game.
 * Each entry contains the ownerId and agreed potSharePercent.
 */
export function getAcceptedSharesForWinner(gameId: string, viewerId: string): { ownerId: string; percent: number }[] {
    const out: { ownerId: string; percent: number }[] = [];
    deals.forEach(d => {
        if (d.gameId === gameId && d.senderId === viewerId && d.status === 'accepted') {
            out.push({ ownerId: d.recipientId, percent: d.potSharePercent });
        }
    });
    return out;
}

export function getOutgoingShares(gameId: string, viewerId: string): { recipientId: string; percent: number }[] {
    const out: { recipientId: string; percent: number }[] = [];
    deals.forEach(d => {
        if (d.gameId === gameId && d.senderId === viewerId && d.status === 'accepted') {
            out.push({ recipientId: d.recipientId, percent: d.potSharePercent });
        }
    });
    return out;
}
