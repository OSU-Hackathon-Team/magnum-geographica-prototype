#!/usr/bin/env bash
# ingest-osm.sh
# Download an OSM extract and import it into PostGIS for Magnum.
# Phase 1. Run from the magnum repo root.
#
# Requires: osm2pgsql >= 1.7, psql, curl, gunzip
# Requires: the api/db is reachable (docker compose up)

set -euo pipefail

echo "Step 0/3: Running Drizzle migrations"
(cd packages/api && bun run drizzle-kit push)

REGION="${REGION:-ohio}"
EXTRACT_URL="${EXTRACT_URL:-https://download.geofabrik.de/north-america/us/${REGION}-latest.osm.pbf}"
WORKDIR="${WORKDIR:-./data}"
DB_URL="${DATABASE_URL:-postgres://magnum:magnum@localhost:5432/magnum}"

mkdir -p "$WORKDIR"
EXTRACT_FILE="$WORKDIR/${REGION}-latest.osm.pbf"

if [ ! -f "$EXTRACT_FILE" ]; then
  echo "Downloading $EXTRACT_URL"
  curl -fL "$EXTRACT_URL" -o "$EXTRACT_FILE"
fi

echo "Step 1/3: Importing $EXTRACT_FILE with osm2pgsql flex output"
osm2pgsql \
  --database "$DB_URL" \
  --create \
  --slim \
  --style "scripts/osm2pgsql.lua" \
  --output flex \
  "$EXTRACT_FILE"

echo "Step 2/3: Post-processing into production tables"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/ingest-post.sql

echo "Done."
echo "Run 'POST /api/seed' or 'bun run seed' to add the Ohio demo data."
