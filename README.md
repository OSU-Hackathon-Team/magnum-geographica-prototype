# Magnum

> A community-edited atlas of trails. Browse, edit, and annotate trail maps with a wiki for every trail, system, and landmark. Offline-first on mobile. Self-hostable via Docker. FOSS map stack.

See [PLAN.md](./PLAN.md) for the full architecture and phased build plan, and [outline.md](./outline.md) for the scope and content rules.

## Stack

- **Mobile + Web**: Expo SDK 52 (React Native 0.76 + React Native Web)
- **Backend**: Bun + Hono 4
- **Database**: PostgreSQL 16 + PostGIS 3
- **Tiles**: Martin (PostGIS vector tiles + MBTiles) — Phase 1
- **Map**: OpenLayers 10, two base layers: Simplified (MVT) + Satellite (raster)
- **Monorepo**: Turborepo + Bun workspaces
- **License**: AGPL-3.0 (self-hostable, contributions stay FOSS)

## Quick start

```bash
cp .env.example .env                                # copy local env (DB password, ports)
bun install                                         # workspace install

# Generate the simplified basemap (required for the map to render):
./scripts/build-simplified-basemap.sh ohio          # ~2 min, produces ~64MB data/basemap.mbtiles

docker compose -f docker/docker-compose.yml up -d   # start postgres + martin + api
bun run --cwd packages/api db:migrate               # apply schema
curl -X POST http://localhost:3000/api/seed         # seed demo data
bun run --cwd packages/app web                      # Expo dev server (web)
```

All commands run from the repo root. The API will be available at `http://localhost:3000`, Martin at `http://localhost:3001`, and the web app at `http://localhost:8081`.

The map has two base layers — tap the layer switcher in the top-right corner to toggle:

- **Simplified** — heavily simplified OSM basemap (major roads, water, parks/forests at zooms z2–z12). Served from a pre-generated MBTiles file. Small enough to download in its entirety for a state (~10–60MB).
- **Satellite** — Sentinel-2 cloudless imagery (EOX, zooms z0–z13).

## Layout

```
magnum/
  packages/
    api/      Bun + Hono backend (Hono routes, Drizzle schema, PostGIS)
    shared/   Types, zod schemas, typed API client, constants
    map/      OpenLayers wrapper (web + native WebView), two base layers
    app/      Expo app (mobile + web), expo-router tabs, zustand stores
  docker/     docker-compose, Dockerfile, Martin YAML config, init SQL
  scripts/    build-simplified-basemap.sh, tilemaker config, dev helpers
  data/       generated MBTiles and OSM extracts (gitignored)
  PLAN.md     full architecture and phased build plan
  outline.md  scope + content rules
```

## Building the basemap

The simplified basemap is a pre-generated MBTiles file produced by [tilemaker](https://tilemaker.org/) from an OSM PBF extract. Run:

```bash
./scripts/build-simplified-basemap.sh [region]

# Examples:
./scripts/build-simplified-basemap.sh ohio         # ~64MB at z2–z12
./scripts/build-simplified-basemap.sh california    # larger, adjust zoom in tilemaker-config.json
```

The script downloads the region's OSM PBF from GeoFabrik, runs tilemaker via Docker, and writes `data/basemap.mbtiles`. Martin serves it at `/basemap/{z}/{x}/{y}`.

To change the zoom range or features included, edit `scripts/tilemaker-config.json` and `scripts/tilemaker-process.lua`, then re-run the build script.

## Common commands

From the repo root:

```bash
bun run dev          # turbo dev (parallel across packages)
bun run build        # turbo build
bun run typecheck    # tsc --noEmit in every package
bun run lint         # eslint in every package
bun run test         # bun test in every package
bun run format       # prettier --write
```

## Phase 0 status

Verified:

- Monorepo installs (`bun install`)
- All four packages typecheck (`bun run typecheck`)
- ESLint + Prettier configured and clean (`bun run lint`)
- Bun tests pass (54 tests across `api` + `shared`)
- Drizzle migration generated and applied
- API boots and serves all routes
- Expo web build exports all 4 tab routes
- Martin serves both PostGIS function tiles (trails, systems, features, segments, super-systems) and the MBTiles basemap
- Two-map-layer switcher (Simplified + Satellite) with persisted preference

To run end-to-end with a real database, start the docker-compose stack after generating the basemap.

## License

AGPL-3.0. See [LICENSE](./LICENSE).
