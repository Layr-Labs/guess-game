# EigenX TEE TypeScript Application

The game is a sealed number-guessing contest where players submit guesses within a range and get immediate hot/warm/cold feedback without revealing their numbers. A correct guess ends the game and wins the pot; otherwise at the deadline the closest guess wins the accumulated fees.

## Requirements

- Node.js 20+
- npm
- eigenx CLI 

## Environment

The app requires the following environment variables:

- `MNEMONIC` (optional): Seed phrase used to derive a sealing key - automatically generated if not provided by Compute.
- `PORT` (optional): HTTP port, defaults to `3000`.

Create a `.env` file in the project root:

```bash
MNEMONIC="your twelve or twenty-four word phrase here"
PORT=3000
```

## Install & Run (Local)

```bash
npm install
npx ts-node src/index.ts
```

Then open `http://localhost:3000/`.

## Build (optional)

If you prefer compiled output:

```bash
npm run build
node dist/index.js
```

## Docker

The provided `Dockerfile` runs the app directly from `src/` using `ts-node`.

Build the image:

```bash
docker build -t eigenx-app .
```

Run (ensure `MNEMONIC` is provided):

```bash
docker run --rm -p 3000:3000 \
  -e MNEMONIC="your mnemonic" \
  -e PORT=3000 \
  eigenx-app
```

Open `http://localhost:3000/`.

## How To Deploy on EigenCompute

TBD.

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



## Architecture Diagram

```mermaid
graph TD
  A[Player Browser UI] -->|Register /player/register| B[Express API (TEE)]
  B -->|Create player key| A

  A -->|Mint /wallet/mint| B
  B -->|Update balance| WB[(Wallet Balances)]

  A -->|Create Game /game/create| B
  B -->|crypto.randomInt target| GS[(Games + Sealed Guesses \nAES-256-GCM)]

  A -->|Guess /game/:id/guess \n(Bearer key)| B
  B -->|Charge fee & store \nsealed guess| GS
  B -->|Hint hot/warm/cold| A

  A -->|Status /game/:id/status| B
  B -->|Auto-finalize at deadline \n(closest guess)| A
  B -->|Distribute pot via DFS \n(transitive deals)| WB

  subgraph Coordination
    A -->|List players \n/coordination/players| B
    A -->|View activities \n/coordination/:id/activities| B
    A -->|Auto-propose deal \n/coordination/auto-propose| B
    A -->|Fetch pending \n/coordination/pending-deals| B
    A -->|Accept deal \n/coordination/accept| B
    B -->|Grant share permission| GS
  end

  classDef store fill:#f8f9fa,stroke:#bbb,color:#333;
  class WB,GS store;
```

