# Magnum

> A community-edited atlas of trails. Browse, edit, and annotate trail maps with a wiki for every trail, system, and landmark. Offline-first on mobile. Self-hostable via Docker. FOSS map stack.

See [PLAN.md](./PLAN.md) for the full architecture and phased build plan, and [outline.md](./outline.md) for the scope and content rules.

## Stack

- **Mobile + Web**: Expo SDK 52 (React Native 0.76 + React Native Web)
- **Backend**: Bun + Hono 4
- **Database**: PostgreSQL 16 + PostGIS 3
- **Tiles**: Martin (PostGIS → vector tiles) — Phase 1
- **Map**: OpenLayers 10
- **Monorepo**: Turborepo + Bun workspaces
- **License**: AGPL-3.0 (self-hostable, contributions stay FOSS)

## Quick start

```bash
bun install                              # workspace install
docker compose -f docker/docker-compose.yml up -d
cd packages/api && bun run db:migrate    # apply schema
curl -X POST http://localhost:3000/api/seed
cd packages/app && bun run web           # Expo dev server
```

## Layout

```
magnum/
  packages/
    api/      Bun + Hono backend (Hono routes, Drizzle schema, PostGIS)
    shared/   Types, zod schemas, typed API client, constants
    map/      OpenLayers wrapper (web + native WebView)
    app/      Expo app (mobile + web), expo-router tabs, zustand stores
  docker/     docker-compose, Dockerfile, Martin config, init SQL
  scripts/    OSM ingest helpers (Phase 1)
  PLAN.md     full architecture and phased build plan
  outline.md  scope + content rules
```

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
- Bun tests pass (6 tests across `api` + `shared`)
- Drizzle migration generated (`packages/api/drizzle/0000_init.sql`)
- API boots and serves all routes (returns 500s on DB-backed routes without Postgres — expected)
- Expo web build exports all 4 tab routes (~1.6 MB JS)

To run end-to-end with a real database, start the docker-compose stack and the API will use PostGIS.

## License

AGPL-3.0. See [LICENSE](./LICENSE).
