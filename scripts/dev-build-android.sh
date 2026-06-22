#!/usr/bin/env bash
# Build Android APK and install on connected emulator/device.
# Usage: ./scripts/dev-build-android.sh [--release]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
log()  { echo -e "${GREEN}[build]${NC} $*"; }
err()  { echo -e "${RED}[err]${NC} $*" >&2; }

VARIANT="${1:-debug}"
case "$VARIANT" in
  --release|release) VARIANT="release" ;;
  *) VARIANT="debug" ;;
esac

APP_DIR="$ROOT/packages/app"
GRADLE_DIR="$APP_DIR/android"

log "Building $VARIANT APK..."

# Ensure emulator is connected
if ! adb devices 2>/dev/null | grep -q "emulator"; then
  err "No Android emulator/device found. Start one with: scripts/dev-start.sh --emulator"
  exit 1
fi

# Metro needs to be running for debug builds
if [[ "$VARIANT" == "debug" ]]; then
  if ! curl -sf http://localhost:8081/status > /dev/null 2>&1; then
    warn "Metro doesn't seem to be running on :8081"
    warn "Start it with: scripts/dev-start.sh --app"
  fi
fi

cd "$GRADLE_DIR"

if [[ "$VARIANT" == "release" ]]; then
  # For release, export the JS bundle first
  cd "$APP_DIR"
  log "Exporting JS bundle..."
  EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:3000}" \
  EXPO_PUBLIC_MARTIN_URL="${EXPO_PUBLIC_MARTIN_URL:-http://localhost:3001}" \
    npx expo export --platform android --output-dir dist 2>&1 | tail -3
  cd "$GRADLE_DIR"

  ./gradlew app:assembleRelease -x lint -x test -PreactNativeArchitectures=x86_64 2>&1 | tail -20
  APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew app:assembleDebug -x lint -x test -PreactNativeArchitectures=x86_64 2>&1 | tail -20
  APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

if [[ ! -f "$APK_PATH" ]]; then
  err "APK not found at $APK_PATH"
  exit 1
fi

log "Installing APK..."
adb install -r "$APK_PATH" 2>&1

log "Starting app..."
adb shell am start -n org.magnum.app/.MainActivity 2>&1

log "Done. APK: $APK_PATH"
log ""
log "To tail logs:"
log "  adb logcat -s ReactNativeJS:V AndroidRuntime:E"
log ""
log "To reload (debug builds with Metro):"
log "  adb shell am broadcast -a android.intent.action.BOOT_COMPLETED -n org.magnum.app/.MainActivity"
log "  # Or shake device to open dev menu → Reload"
