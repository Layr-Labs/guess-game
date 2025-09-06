import express from 'express';
import gameRoutes from './game/routes';
import walletRoutes from './wallet/routes';
import playerRoutes from './player/routes';
import coordinationRoutes from './coordination/routes';
import './config'; // This will load and validate the environment variables

/**
 * Main application entry point.
 */
async function main() {
    const app = express();
    // Middleware to parse JSON bodies.
    app.use(express.json({ limit: '1mb' }));
    // Middleware to serve static files from the 'public' directory.
    app.use(express.static('public'));

    // A simple health check endpoint.
    app.get('/health', (_req, res) => {
        res.status(200).json({ ok: true });
    });

    // Mount the game-specific routes under the /game path.
    app.use('/game', gameRoutes);

    // Mount the wallet routes under the /wallet path (NOT FOR PRODUCTION)
    app.use('/wallet', walletRoutes);

    // Mount the player registration routes.
    app.use('/player', playerRoutes);

    // Mount the coordination routes for messaging.
    app.use('/coordination', coordinationRoutes);

    const port = Number(process.env.PORT ?? 3000);
    app.listen(port, () => {
        console.log(`Number guess server (Express) listening on :${port}`);
    });
}

main().catch(console.error);
