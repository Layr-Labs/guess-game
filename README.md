# eigenx-tee-typescript-app

The game is a sealed number-guessing contest where players submit guesses within a range and get immediate hot/warm/cold feedback without revealing their numbers. A correct guess ends the game and wins the pot; otherwise at the deadline the closest guess wins the accumulated fees.

## Prerequisites

Before deploying, you'll need:

- **Docker** - To package and publish your application image
  - [Download Docker](https://www.docker.com/get-started/)
  - You'll also need to `docker login` to push images to your registry
- **Sepolia ETH** - To pay for deployment transactions
  - [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)
  - [Alchemy Faucet](https://sepoliafaucet.com/)
  
Runtime requirements for local dev:

- Node.js 20+
- npm
- eigenx CLI

## Environment

Set the following environment variables for local development:

- `MNEMONIC` (required): Seed phrase used to derive a sealing key. Required locally. In production, the platform should supply this.
- `PORT` (optional): HTTP port, defaults to `3000`.
- `NGROK_AUTHTOKEN` (optional): Token for authenticated ngrok tunnels when running via Docker.

Create a `.env` file and populate it with your values.

## Development

### Setup & Local Testing
```bash
npm install
# Create .env and set MNEMONIC (and optional PORT)
npm run dev
```

Open `http://localhost:3000/`.

### Docker Testing
```bash
docker build -t my-app .
docker run --rm \
  -p 3000:3000 -p 4040:4040 \
  --env-file .env \
  my-app
```

- App: `http://localhost:3000`
- Ngrok web UI: `http://localhost:4040`

Note: When using `--env-file`, do not quote values. For example:
```
MNEMONIC=word1 word2 ...
PORT=3000
NGROK_AUTHTOKEN=2wVdN4... # no quotes
```

## Deployment

```bash
# Store your private key (generate new or use existing)
eigenx auth generate --store
# OR: eigenx auth login (if you have an existing key)

eigenx app deploy username/image-name
```

The CLI will automatically detect the `Dockerfile` and build your app before deploying.

## Management & Monitoring

### App Lifecycle
```bash
eigenx app list                    # List all apps
eigenx app info [app-name]         # Get app details
eigenx app logs [app-name]         # View logs
eigenx app start [app-name]        # Start stopped app
eigenx app stop [app-name]         # Stop running app
eigenx app terminate [app-name]    # Terminate app
eigenx app upgrade [app-name] [image] # Update deployment
```

### App Naming
```bash
eigenx app name [app-id] [new-name]  # Update friendly name
```

## Documentation

[EigenX CLI Documentation](https://github.com/Layr-Labs/eigenx-cli/blob/main/README.md)

## API Overview

- `GET /health`: Health check
- `POST /player/register`: Create a player key for a `playerId`
- `GET /wallet/:playerId/balance`
- `POST /wallet/mint`
- `POST /game/create`
- `POST /game/:gameId/guess`
- `GET /game/:gameId/status`
- `GET /coordination/players`
- `GET /coordination/:gameId/activities`
- `POST /coordination/auto-propose`
- `GET /coordination/pending-deals`
- `POST /coordination/accept`

The `public/` app provides a minimal UI to interact with these endpoints.