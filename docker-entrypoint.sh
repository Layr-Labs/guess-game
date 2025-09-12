#!/bin/sh
set -e

# Start the app in the background
npx ts-node src/index.ts &

# Run ngrok in the foreground so the container stays alive
# NGROK_AUTHTOKEN can be supplied via environment variable. If provided via
# Docker --env-file, avoid quoting in the file. As a safeguard, strip quotes.
PORT="${PORT:-3000}"
TOKEN="${NGROK_AUTHTOKEN:-}"
# strip leading/trailing quotes and whitespace if present
TOKEN=$(printf '%s' "$TOKEN" | sed -e 's/^"//' -e 's/"$//' -e 's/^\s\+//' -e 's/\s\+$//')

AUTHTOKEN_ARGS=""
if [ -n "$TOKEN" ]; then
    AUTHTOKEN_ARGS="--authtoken $TOKEN"
fi

exec ngrok http --log=stdout --log-level=info $AUTHTOKEN_ARGS "$PORT"


