#!/bin/sh
# Hosted worker entry — selects verify|render. No secrets printed.
set -eu

MODE="${1:-}"
if [ -z "$MODE" ]; then
  MODE="${HEADLESS_WORKER_MODE:-}"
fi

case "$MODE" in
  verify|render)
    ;;
  *)
    echo '{"name":"hosted.process.exit","reasonId":"invalid_mode","status":"failed"}'
    exit 1
    ;;
esac

export HEADLESS_WORKER_MODE="$MODE"
export HEADLESS_HOSTED_WORKER_ROOT=/app

# Bounded workspace — ephemeral, not baked into the image.
mkdir -p "${HEADLESS_WORKER_WORKSPACE_ROOT:-/tmp/footiebitz-headless-worker}"

# Propagate SIGTERM to Node (tini already forwards to this script's child).
exec node /app/hosted-worker.js
