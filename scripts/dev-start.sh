#!/usr/bin/env bash
# Start full Magnum dev environment.
# Usage: ./scripts/dev-start.sh [--api] [--app] [--emulator]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[dev]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[err]${NC} $*" >&2; }

START_ALL=false
START_API=false
START_APP=false
START_EMULATOR=false

if [[ $# -eq 0 ]]; then
  START_ALL=true
else
  for arg in "$@"; do
    case "$arg" in
      --api) START_API=true ;;
      --app) START_APP=true ;;
      --emulator) START_EMULATOR=true ;;
      --all) START_ALL=true ;;
      *) err "Unknown arg: $arg"; exit 1 ;;
    esac
  done
fi

$START_ALL && { START_API=true; START_APP=true; START_EMULATOR=true; }

# ── Docker backend (Postgres + Martin) ──────────────────────────────
if $START_API || $START_APP; then
  log "Starting Docker services (postgres + martin)..."
  docker compose -f docker/docker-compose.yml up -d postgres martin 2>&1 | sed 's/^/  /'
fi

# ── API server (Bun + Hono) ─────────────────────────────────────────
if $START_API; then
  log "Starting API server on :3000..."
  cd packages/api
  bun run dev &
  API_PID=$!
  cd "$ROOT"
  sleep 2
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    log "API is healthy on http://localhost:3000"
  else
    warn "API health check failed; it might still be starting"
  fi
fi

# ── Android Emulator ────────────────────────────────────────────────
if $START_EMULATOR; then
  AVD="${AVD_NAME:-test_device}"
  if adb devices 2>/dev/null | grep -q "emulator"; then
    log "Emulator already running: $(adb devices | grep emulator)"
  else
    log "Starting Android emulator ($AVD)..."
    $ANDROID_HOME/emulator/emulator -avd "$AVD" -no-audio -no-window -gpu swiftshader_indirect &
    log "Waiting for emulator to boot..."
    adb wait-for-device 2>/dev/null
    while [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]]; do
      sleep 2
    done
    log "Emulator booted successfully"
  fi
fi

# ── Metro + Expo ────────────────────────────────────────────────────
if $START_APP; then
  log "Setting up adb reverse forwarding..."
  adb reverse tcp:8081 tcp:8081 2>/dev/null || warn "Could not reverse tcp:8081 (no device?)"
  adb reverse tcp:3000 tcp:3000 2>/dev/null || warn "Could not reverse tcp:3000 (no device?)"

  log "Starting Metro bundler..."
  cd packages/app
  EXPO_PUBLIC_API_URL=http://localhost:3000 \
  EXPO_PUBLIC_MARTIN_URL=http://localhost:3001 \
    npx expo start --dev-client --no-dev --port 8081 &
  METRO_PID=$!
  cd "$ROOT"
  sleep 3
  log "Metro should be running on :8081"
  log "Launch app on emulator with: adb shell am start -n org.magnum.app/.MainActivity"
fi

log "Dev environment started."
if $START_APP; then
  echo ""
  log "  API:       http://localhost:3000"
  log "  Martin:    http://localhost:3001"
  log "  Metro:     http://localhost:8081"
  log "  Emulator:  adb devices"
fi
