#!/usr/bin/env bash
# Wrapper around `docker compose` that sources .env first, so
# COMPOSE_PROJECT_NAME and host-port overrides (managed by scripts/ports.sh)
# are picked up on every invocation.
#
# Usage: ./scripts/dc.sh <compose args...>
# Example: ./scripts/dc.sh up -d
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
elif [ -f .env.example ]; then
  echo "[dc] .env not found; falling back to .env.example defaults" >&2
  set -a
  # shellcheck disable=SC1091
  source .env.example
  set +a
fi

exec docker compose -f docker/docker-compose.yml "$@"
