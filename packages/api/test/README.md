# Test database

This directory hosts the integration test infrastructure. Tests run
against a real PostgreSQL+PostGIS database in a throwaway Docker
container — the test database lives on host port `54329` (not the
default `5432`), in a tmpfs volume, and never touches the developer
database.

## Quick start

```bash
# 1. Start the test database (one-time per session).
docker compose -f docker/docker-compose.test.yml up -d

# 2. Run the tests.
cd packages/api && bun test
# or, to run across all packages:
bun run test
```

## How it works

- `docker/docker-compose.test.yml` runs `postgis/postgis:16-3.4` on
  `127.0.0.1:54329`, with data in tmpfs (no persistence).
- `packages/api/bunfig.toml` preloads `test/helpers/db.ts`, which
  sets `DATABASE_URL` to the test database **before any test file
  imports**. The original `db/index.ts` is loaded normally with this
  env var — no `mock.module` is needed for the real-DB tests.
- `setupRealDb()` is the entry point for test files that want a
  real-DB handle. It returns `{ db, pool, reset }` and lazily
  applies Drizzle migrations on first use. The pool is process-global
  and shared across all test files in a single `bun test` run.
- `resetTestDb()` truncates every app table — call it in
  `beforeEach` to give each test a clean slate.
- The two test styles (in-memory `mockDb` and real DB) coexist.
  `bun test --isolate` runs each test file in a fresh global object
  so the in-memory `mockDb` from one file cannot leak into another
  (this is enabled by the `test` script in `package.json`).

## Why `--isolate`?

`mockDb`-based tests use `mock.module("../src/db/index.js", ...)` to
substitute a hand-written in-memory DB. `bun test` shares
`mock.module` state across test files in the same run; the first
file's mock "wins" and persists. With `--isolate` each test file
runs in a fresh module cache, so the in-memory mock from one file
does not pollute another.

The cost is that each test file pays a small import overhead. For
~30 files and ~340 tests, the difference is ~1s — acceptable.

## Writing a real-DB test

```ts
import { describe, expect, test, beforeEach } from "bun:test";
import { setupRealDb } from "./helpers/db.js";
import { myRoute } from "../src/routes/my-route.js";
import { Hono } from "hono";
import { myTable } from "../src/db/schema.js";

const { db, reset } = setupRealDb();

beforeEach(async () => { await reset(); });

const buildApp = () => new Hono().route("/api/my-route", myRoute);

describe("POST /api/my-route", () => {
  test("inserts a real row", async () => {
    const res = await buildApp().request("/api/my-route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(201);
    const stored = await db.select().from(myTable);
    expect(stored.length).toBe(1);
  });
});
```

The route's `import { db } from "../db/index.js"` resolves to the
real Drizzle instance backed by the test database. SQL is real,
PostGIS is real, FK constraints are real.

## When to use mockDb vs real DB

- **mockDb**: when you only care about *call shapes* (was `insert`
  called? with what payload?). Cheaper, no DB needed.
- **Real DB**: when the SQL, PostGIS functions, or constraints are
  themselves under test. Slower, requires Docker.

Prefer the real DB for new tests unless the test is purely about
control flow. mockDb has known limitations (best-effort WHERE
filtering, no `RETURNING` defaults, no real PostGIS) and can mask
bugs in query construction.
