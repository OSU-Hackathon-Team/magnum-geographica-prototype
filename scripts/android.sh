#!/usr/bin/env bash
# Run the Expo Android dev app with adb reverse and EXPO_PUBLIC_* set
# from .env. Use this instead of `bun run android` (or `npm run android`)
# when you've shifted ports via scripts/ports.sh.
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
  echo "[android] .env not found; falling back to .env.example defaults" >&2
  set -a
  # shellcheck disable=SC1091
  source .env.example
  set +a
fi

API_PORT="${API_HOST_PORT:-3000}"
MARTIN_PORT="${MARTIN_HOST_PORT:-3001}"
METRO_PORT="${METRO_HOST_PORT:-8081}"
API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:${API_PORT}}"
MARTIN_URL="${EXPO_PUBLIC_MARTIN_URL:-http://localhost:${MARTIN_PORT}}"

echo "[android] adb reverse: metro=${METRO_PORT} api=${API_PORT} martin=${MARTIN_PORT}"
adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" 2>/dev/null || true
adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}" 2>/dev/null || true
adb reverse "tcp:${MARTIN_PORT}" "tcp:${MARTIN_PORT}" 2>/dev/null || true

echo "[android] EXPO_PUBLIC_API_URL=${API_URL}"
echo "[android] EXPO_PUBLIC_MARTIN_URL=${MARTIN_URL}"

cd packages/app
exec env \
  EXPO_PUBLIC_API_URL="${API_URL}" \
  EXPO_PUBLIC_MARTIN_URL="${MARTIN_URL}" \
  expo run:android "$@"
