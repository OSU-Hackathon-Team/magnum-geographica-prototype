# @magnum/api

Bun + Hono backend. PostgreSQL 16 + PostGIS 3 via Drizzle ORM. Single-port REST API.

## Routes (Phase 0)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | liveness + DB probe |
| `GET` | `/api/systems` | list, paginated, `?q=`, `?page=`, `?pageSize=` |
| `GET` | `/api/systems/:id` | detail |
| `POST` | `/api/systems` | create |
| `GET` | `/api/trails` | list, filterable by `?systemId=`, `?q=`, `?difficulty=` |
| `GET` | `/api/trails/:id` | detail |
| `POST` | `/api/trails` | create |
| `GET` | `/api/search?q=&type=&limit=` | full-text over systems/trails/features |
| `POST` | `/api/seed` | dev seed of Ohio test data |

## Scripts

```bash
bun run dev           bun --watch src/index.ts
bun run start         bun run src/index.ts
bun run typecheck     tsc --noEmit
bun run lint          eslint src
bun run test          bun test
bun run db:generate   drizzle-kit generate
bun run db:push       drizzle-kit push
bun run db:migrate    apply SQL migrations
bun run db:studio     drizzle studio
bun run seed          curl the /api/seed route (or run src/seed.ts)
```

## Layout

```
src/
  index.ts            Hono app entry
  migrate.ts          runs ./drizzle migrations
  seed.ts             CLI entry for seedOhioData
  db/
    schema.ts         Drizzle schema (PostGIS customTypes)
    index.ts          pg pool + drizzle instance
  middleware/
    cors.ts           CORS with origin whitelist
    auth.ts           x-admin-secret guard
  routes/
    health.ts
    systems.ts
    trails.ts
    search.ts
    seed.ts
  services/
    seed.ts           seedOhioData (3 systems, 5 trails, 7 features, 3 wiki pages)
drizzle/              generated SQL migrations
test/                 bun test files
```

## Env

| Var | Default |
|---|---|
| `DATABASE_URL` | `postgres://magnum:magnum@localhost:5432/magnum` |
| `API_PORT` | `3000` |
| `ADMIN_SECRET` | `dev-secret-change-me` |
| `CORS_ORIGINS` | comma-separated; `*` for dev |
