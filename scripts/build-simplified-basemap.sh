#!/usr/bin/env bash
# build-simplified-basemap.sh
# Generate a compact MBTiles basemap from an OSM PBF extract using tilemaker.
# The output is placed at data/basemap.mbtiles where Martin auto-discovers it
# and serves it at /basemap/{z}/{x}/{y}.
#
# Usage:
#   ./scripts/build-simplified-basemap.sh [region]
#
#   region  OSM region to download from GeoFabrik (default: ohio).
#           Supported values: any US state name from GeoFabrik's
#           north-america/us/ directory (lowercase, dash-separated).
#
# Prerequisites: Docker (tilemaker runs in a container).
#
# Output:
#   data/basemap.mbtiles   — MVT tiles, zooms z2-z12, ~10-40MB per state.
#
# Example:
#   ./scripts/build-simplified-basemap.sh ohio      # Ohio (~15MB)
#   ./scripts/build-simplified-basemap.sh california # California (~35MB)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

REGION="${1:-ohio}"
EXTRACT_URL="https://download.geofabrik.de/north-america/us/${REGION}-latest.osm.pbf"
WORKDIR="$ROOT/data"
PBF_FILE="$WORKDIR/${REGION}-latest.osm.pbf"
OUTPUT="$WORKDIR/basemap.mbtiles"
TILEMAKER_IMAGE="ghcr.io/systemed/tilemaker:master"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()    { echo -e "${GREEN}[basemap]${NC} $*"; }
warn()   { echo -e "${YELLOW}[basemap]${NC} $*"; }
err()    { echo -e "${RED}[basemap]${NC} $*" >&2; }

# -- ensure output directory exists ----------------------------------------
mkdir -p "$WORKDIR"

# -- check for tilemaker Docker image --------------------------------------
if ! docker image inspect "$TILEMAKER_IMAGE" > /dev/null 2>&1; then
  log "Pulling tilemaker image..."
  docker pull "$TILEMAKER_IMAGE"
fi

# -- download OSM extract --------------------------------------------------
if [ -f "$PBF_FILE" ]; then
  log "Using existing OSM extract: $PBF_FILE"
else
  log "Downloading ${REGION} OSM extract..."
  log "  ${EXTRACT_URL}"
  curl -fL --progress-bar "$EXTRACT_URL" -o "$PBF_FILE"
  log "Download complete ($(du -h "$PBF_FILE" | cut -f1))"
fi

# -- run tilemaker ---------------------------------------------------------
log "Generating simplified basemap tiles..."

docker run --rm \
  -v "$ROOT/scripts:/scripts:ro" \
  -v "$ROOT/data:/data" \
  "$TILEMAKER_IMAGE" \
    --input  "/data/${REGION}-latest.osm.pbf" \
    --output "/data/basemap.mbtiles" \
    --config /scripts/tilemaker-config.json \
    --process /scripts/tilemaker-process.lua \
    --fast

if [ ! -f "$OUTPUT" ]; then
  err "MBTiles file was not created."
  exit 1
fi

MBTILES_SIZE=$(du -h "$OUTPUT" | cut -f1)
log "Basemap generated: ${OUTPUT} (${MBTILES_SIZE})"

log "Clean up the PBF file with: rm ${PBF_FILE}"
log "Martin will serve this at: /basemap/{z}/{x}/{y}"
