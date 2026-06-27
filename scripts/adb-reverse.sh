#!/usr/bin/env bash
# Set up adb reverse port forwarding so the Android device/emulator can
# reach the host's Metro, API, and Martin services on localhost.
# Usage: ./scripts/adb-reverse.sh
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
  echo "[adb-reverse] .env not found; falling back to .env.example defaults" >&2
  set -a
  # shellcheck disable=SC1091
  source .env.example
  set +a
fi

API_PORT="${API_HOST_PORT:-3000}"
MARTIN_PORT="${MARTIN_HOST_PORT:-3001}"
METRO_PORT="${METRO_HOST_PORT:-8081}"

echo "[adb-reverse] forwarding: metro=${METRO_PORT} api=${API_PORT} martin=${MARTIN_PORT}"
adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" 2>/dev/null || echo "  metro :${METRO_PORT} — failed (no device?)" >&2
adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}" 2>/dev/null || echo "  api :${API_PORT} — failed (no device?)" >&2
adb reverse "tcp:${MARTIN_PORT}" "tcp:${MARTIN_PORT}" 2>/dev/null || echo "  martin :${MARTIN_PORT} — failed (no device?)" >&2
echo "[adb-reverse] done"
