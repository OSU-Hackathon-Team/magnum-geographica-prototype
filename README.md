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

./scripts/dc.sh up -d                               # start postgres + martin + api (sources .env)
bun run --cwd packages/api db:migrate               # apply schema
# Seed demo data (admin secret header optional in development):
curl -X POST http://localhost:3000/api/seed \
  -H "x-admin-secret: ${ADMIN_SECRET:-dev-secret-change-me}"
bun run --cwd packages/app web                      # Expo dev server (web)
```

Use `./scripts/dc.sh` (a thin wrapper around `docker compose -f docker/docker-compose.yml`) instead of calling docker compose directly — it sources `.env` first so the project name and port overrides are picked up on every command.

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
  scripts/    build-simplified-basemap.sh, ports.sh, dc.sh, clean.sh, tilemaker config, dev helpers
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

## Trace heatmap

The Explore tab has a toggleable heatmap overlay showing where GPS traces have been recorded. It's served as MVT tiles by Martin from `/traces_heatmap/{z}/{x}/{y}` and reads from a pre-computed `trace_heatmap` summary table (tile-level counts at zoom 14, lower zooms aggregated up).

The overlay is *hidden by default*; tap the flame icon next to the base-layer switcher in the top-right of the Explore tab to toggle it on.

After seeding or bulk-importing traces, regenerate the heatmap so the cache reflects the new data:

```bash
curl -X POST http://localhost:3000/api/admin/heatmap/regenerate \
  -H "x-admin-secret: ${ADMIN_SECRET:-dev-secret-change-me}"
```

Response: `{ "ok": true, "cellsInserted": <n>, "durationMs": <ms> }`. Admin role only (requires either a valid admin JWT or the `x-admin-secret` header). The job truncates the cache, recomputes tile-level counts at zoom 14 from the trace bboxes, then aggregates up to zooms 5–13. For tens of thousands of traces this typically takes under a second; for ~1M traces expect ~10–30 seconds.

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

## Running multiple instances in parallel

To work on two checkouts (e.g. `main` and a feature branch) at once, give each its own host ports, docker containers, and postgres volume. `.env` is the single source of truth — `scripts/ports.sh` reads and writes it, and `docker-compose.yml` re-reads it on every `up`.

```bash
./scripts/ports.sh                        # show current ports, project, derived URLs
./scripts/ports.sh set <name> <port>      # set a single port (api | martin | postgres | metro)
./scripts/ports.sh shift <n>              # add N to every host port (e.g. 10, 100)
./scripts/ports.sh project <name>         # set COMPOSE_PROJECT_NAME (prefixes containers + volume)
./scripts/ports.sh reset                  # restore .env.example defaults
./scripts/ports.sh help
```

Example — bring up an "alice" instance on shifted ports alongside the default "magnum" one:

```bash
./scripts/ports.sh project alice
./scripts/ports.sh shift 10
# api=3010 martin=3011 postgres=5442 metro=8091
./scripts/dc.sh up -d

# The default instance keeps running on 3000/3001/5432/8081.
# Tear down the alt one without affecting the other:
./scripts/dc.sh down
```

The script also rewrites the derived URLs (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_MARTIN_URL`, `MARTIN_URL`) and adds the API origin to `CORS_ORIGINS` automatically. If you change `EXPO_PUBLIC_*` by hand, rebuild the APK — they're inlined at build time.

To tear down the current instance without affecting the others:

```bash
./scripts/clean.sh                 # stop + remove containers + networks (asks first)
./scripts/clean.sh --volumes       # also delete the postgres data volume
./scripts/clean.sh --images        # also delete the built api image
./scripts/clean.sh --build         # also prune this project's build cache
./scripts/clean.sh --all           # everything above
./scripts/clean.sh --dry-run       # show what would be removed, do nothing
./scripts/clean.sh --force         # skip the confirmation prompt
```

Scope is driven by `COMPOSE_PROJECT_NAME` from `.env`, so `./scripts/clean.sh` in the `alice` checkout only touches `alice-*` resources; `magnum` (or any other project) on the same host is left alone. Upstream images (`postgis`, `martin`) are never removed — `--images` only deletes the locally-built `api` image.

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
