# Build a Private, Verifiable Guess Game

This hands-on guide shows you how to run and deploy a privacy-preserving “Guess Game” on EigenCompute. If you’ve seen the
[Quickstart](https://www.notion.so/Quickstart-26913c11c3e080b78230d5884c0cea5f?pvs=21), you already know how to install the CLI and deploy; here we apply it to a real app that keeps guesses private and verifiable end‑to‑end.

What the app does (in plain English): it’s a sealed number‑guessing contest. Players submit guesses within a range and instantly receive hot/warm/cold feedback without revealing their actual numbers. A correct guess ends the game and wins the pot; otherwise, at the deadline the closest guess wins the accumulated fees. Deals between players can selectively reveal numbers while preserving privacy for everyone else.

Why this matters: without trusted hardware, app operators can see user inputs. EigenCompute executes your code in a TEE, so guesses are encrypted at rest and only revealed under explicit rules (winner or accepted deal).

## Table of contents

- [At a glance](#at-a-glance)
- [Flow](#flow)
  - [Hint thresholds](#hint-thresholds)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Run locally](#run-locally)
- [Run with Docker + ngrok (optional)](#run-with-docker--ngrok-optional)
- [How to play (UI walkthrough)](#how-to-play-ui-walkthrough)
- [API quick reference](#api-quick-reference)
- [Notes on privacy and shares](#notes-on-privacy-and-shares)
- [Troubleshooting](#troubleshooting)
- [Deploy to EigenCompute in minutes (Beginner-friendly)](#deploy-to-eigencompute-in-minutes-beginner-friendly)
  - [What you’ll do](#what-youll-do)
  - [Prerequisites](#prerequisites-1)
  - [1) Install the CLI](#1-install-the-cli)
  - [2) Set up authentication (wallet)](#2-set-up-authentication-wallet)
  - [3) Log in to your Docker registry](#3-log-in-to-your-docker-registry)
  - [4) Deploy to EigenCompute](#4-deploy-to-eigencompute)
  - [5) Make a change and upgrade](#5-make-a-change-and-upgrade)
  - [Useful commands](#useful-commands)
  - [Deploy troubleshooting](#deploy-troubleshooting)

## At a glance

- What you’ll do: run locally, optionally expose via Docker+ngrok, then deploy to EigenCompute
- Time: ~10–20 minutes
- You’ll learn: private state sealing, qualitative hints, opt‑in sharing via deals, TEE deployment
- Requirements: Node.js 20+, npm, Docker (optional for ngrok), EigenX CLI, ngrok account (optional)

## Flow

- A secret target number is generated when the game is created.
- Guesses remain private (encrypted at rest); only qualitative hints are public.
- Players submit guesses and receive hot/warm/cold hints based on distance.
- Each guess costs a fixed fee (if set at creation).
- If someone guesses exactly, the game ends immediately and the winner is paid.
- If the deadline passes without an exact guess, the closest guess wins.
- Players can propose revenue‑share deals; if accepted, the viewer can see the recipient’s guess for that game.
- Payouts distribute the pot to winners and propagate agreed percentages via the shares graph.

In this example, we use a local in‑memory ledger for testing purposes.

### Hint thresholds

Hints are qualitative and depend on the guess’s distance from the secret target relative to the game range (`max - min`):

- Hot: distance / range ≤ 10%
- Warm: distance / range ≤ 25% (and > 10%)
- Cold: otherwise

## Prerequisites

- Node.js 20+, npm
- Docker (optional; required for ngrok-in-container)
- eigenx CLI (for deployment later)
- ngrok account (for public tunneling) — get an auth token at https://dashboard.ngrok.com/get-started/your-authtoken

## Setup

1) Install deps
```
npm install
```
2) Create `.env` with at least:
```
MNEMONIC=your twelve or twenty-four words here
PORT=3000
```

## Run locally

```
npm run dev
```
Open http://localhost:3000

## Run with Docker + ngrok (optional)

1) Create an ngrok account and copy your auth token from https://dashboard.ngrok.com/get-started/your-authtoken

2) Ensure `.env` also includes (no quotes):
```
NGROK_AUTHTOKEN=YOUR_REAL_TOKEN
```
3) Build and run
```
docker build -t guess-game .
docker run --rm \
  -p 3000:3000 -p 4040:4040 \
  --env-file .env \
  guess-game
```
App: http://localhost:3000  •  Ngrok UI: http://localhost:4040

## How to play (UI walkthrough)

1) Register two players (e.g., alice, bob). Copy/save both secret keys on two different screens.
2) Mint funds for each player (if you set a non-zero guess fee).
3) Create a game (choose min, max, fee, deadline). The Game ID is auto-filled globally.
4) Make guesses as a player:
   - Enter playerId and the player’s secret key.
   - Submit guesses; you’ll get hot/warm/cold hints. Wrong guesses are stored encrypted.
5) Propose a deal (viewer → owner):
   - Using the viewer’s key (e.g., alice), propose a deal to the owner (e.g., bob) with a % cut.
6) Recipient fetches and accepts the deal:
   - Switch the global secret key to the recipient’s key (bob), fetch pending deals, accept.
7) View revealed guesses via activities:
   - Switch back to the viewer’s key (alice) and load activities. For owners who accepted, their actual guess appears next to the hint.
8) Finalization:
   - Exact guess ends the game immediately and pays out the pot.
   - Otherwise, after the deadline, checking status auto-finalizes to the closest guess (ties possible). Pot is distributed, including accepted revenue shares.

## API quick reference

- POST `/player/register` { playerId } → { key }
- GET `/wallet/:playerId/balance`
- POST `/wallet/mint` { playerId, amount }
- POST `/game/create` { min, max, guessFee, joinDeadlineSeconds }
- POST `/game/:gameId/guess` { playerId, guess }  (Authorization: Bearer <key>)
- GET `/game/:gameId/status`
- GET `/coordination/:gameId/activities`  (Authorization optional; if provided and authorized via accepted deal, includes `guess`)
- POST `/coordination/auto-propose` { recipientId, potSharePercent, gameId }  (Authorization: Bearer viewerKey)
- GET `/coordination/pending-deals`  (Authorization: Bearer recipientKey)
- POST `/coordination/accept` { dealId }  (Authorization: Bearer recipientKey)

## Notes on privacy and shares

- Guesses are encrypted at rest (AES-256-GCM) using a sealing key derived from `MNEMONIC`.
- Activities show only hints by default. Accepted deals allow a specific viewer to see a specific owner’s guess for that game.
- Revenue sharing uses an outgoing-percentage graph from each winner with cycle protection and clamping to 100% per node.

## Troubleshooting

- “Missing MNEMONIC” at startup: ensure `.env` contains `MNEMONIC`.
- Ngrok auth error: put `NGROK_AUTHTOKEN` in `.env` without quotes when using `--env-file`.
- Pending deals are empty: fetch using the recipient’s key.
- Guess not showing after accept: load activities using the viewer’s key that proposed the deal; ensure you’re querying the same Game ID.

---

## Deploy to EigenCompute in minutes (Beginner-friendly)

This quickstart keeps the essentials from the main EigenX guide. It assumes macOS/Linux and a terminal.

### What you’ll do

- Install the EigenX CLI
- Generate a wallet (private key) and fund it with Sepolia test ETH
- Deploy your app to a secure TEE and view logs

### Prerequisites

- Docker installed and running ([Get Docker](https://www.docker.com/get-started/))
- A Docker registry account and `docker login`
- Some Sepolia test ETH for fees: [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)

Tip: EigenX can generate and store your key securely in your OS keyring. After generating, fund it with a faucet.

### 1) Install the CLI

```bash
curl -fsSL https://eigenx-scripts.s3.us-east-1.amazonaws.com/install-eigenx.sh | bash

# Verify
eigenx --help
```

If the command isn’t found, restart your terminal or add the printed bin dir to PATH.

### 2) Set up authentication (wallet)

```bash
eigenx auth generate --store
eigenx auth whoami   # prints your address
```

Fund the printed address with a faucet (see links above). For access to EigenCompute at events, fill out the form and ping the booth/Discord contact if applicable.

### 3) Log in to your Docker registry

```bash
docker login
```

### 4) Deploy to EigenCompute

From this project directory (which contains a Dockerfile):

```bash
eigenx app deploy
```

What happens:
- Builds your container image and pushes it
- Provisions an EigenCompute instance (TEE)
- Makes `MNEMONIC` available to that TEE at launch
- Registers the deployment on Ethereum

Check status and logs:

```bash
# Wait ~30–90s
eigenx app info
eigenx app logs
```

### 5) Make a change and upgrade

```bash
# after you edit code
eigenx app upgrade my-app
eigenx app logs my-app
```

### Useful commands

```bash
eigenx app list
eigenx app stop my-app
eigenx app start my-app
eigenx app info my-app
eigenx app terminate my-app
```

### Deploy troubleshooting

- No Sepolia ETH: Fund your address, then redeploy.
- Not logged into Docker: `docker login` and retry.
- Private key not found: `eigenx auth generate --store` (or `eigenx auth login`).
- CLI not found: reopen terminal or fix PATH per installer output.