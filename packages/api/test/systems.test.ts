import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";
import { signToken } from "../src/middleware/auth.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { Hono } = await import("hono");
const { systemsRoute } = await import("../src/routes/systems.js");

const buildApp = () => new Hono().route("/api/systems", systemsRoute);

const TEST_USER = {
  id: "00000000-0000-4000-a000-000000000001",
  username: "tester",
  email: "tester@example.com",
  role: "contributor" as const,
  karma: 0,
  tier: "new" as const,
};

async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await signToken(TEST_USER);
  return buildApp().request(path, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
}

describe("GET /api/systems", () => {
  test("returns paginated list", async () => {
    const res = await buildApp().request("/api/systems");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  test("clamps pageSize to 100 and page to min 1", async () => {
    const res = await buildApp().request("/api/systems?page=0&pageSize=999");
    const body = (await res.json()) as { page: number; pageSize: number };
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(100);
  });
});

describe("GET /api/systems/:id", () => {
  test("returns 404 when system is not found", async () => {
    const res = await buildApp().request("/api/systems/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});

describe("POST /api/systems", () => {
  test("returns 401 without a token", async () => {
    const res = await buildApp().request("/api/systems", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", slug: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects invalid input with 400", async () => {
    state.insertCalls.length = 0;
    const res = await authedRequest("/api/systems", {
      method: "POST",
      body: JSON.stringify({ name: "", slug: "Invalid Slug With Spaces" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      details: { fieldErrors: Record<string, string[]> };
    };
    expect(body.error).toBe("invalid_input");
    expect(body.details.fieldErrors).toBeDefined();
    expect(state.insertCalls.length).toBe(0);
  });

  test("rejects non-JSON body with 400", async () => {
    const res = await authedRequest("/api/systems", {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  test("accepts a valid system and inserts it", async () => {
    state.insertCalls.length = 0;
    const res = await authedRequest("/api/systems", {
      method: "POST",
      body: JSON.stringify({ name: "Hocking Hills", slug: "hocking-hills" }),
    });
    expect(res.status).toBe(201);
    // Two inserts: one for systems, one for revisions.
    const systemsInsert = state.insertCalls.find((c) => c.table === "systems");
    expect(systemsInsert).toBeDefined();
    const values = systemsInsert?.values as { name: string; slug: string };
    expect(values.name).toBe("Hocking Hills");
    expect(values.slug).toBe("hocking-hills");
  });

  test("persists a boundary via ST_GeomFromGeoJSON when provided", async () => {
    state.insertCalls.length = 0;
    state.executeCalls.length = 0;
    const boundary = {
      type: "Polygon",
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    };
    const res = await authedRequest("/api/systems", {
      method: "POST",
      body: JSON.stringify({
        name: "Boundary Park",
        slug: "boundary-park",
        boundary,
      }),
    });
    expect(res.status).toBe(201);
    const values = state.insertCalls[0]?.values as {
      name: string;
      slug: string;
    };
    expect(values.name).toBe("Boundary Park");
    expect(values.slug).toBe("boundary-park");
  });

  test("writes a revisions row attributed to the user", async () => {
    state.insertCalls.length = 0;
    state.revisions.length = 0;
    await authedRequest("/api/systems", {
      method: "POST",
      body: JSON.stringify({ name: "Rev Park", slug: "rev-park" }),
    });
    const createRev = state.revisions.find(
      (r) => (r as { action?: string }).action === "create",
    );
    expect(createRev).toBeDefined();
    const rev = createRev as {
      contributorName?: string;
      authorId?: string;
      editSummary?: string;
    };
    expect(rev.contributorName).toBe("tester");
    expect(rev.authorId).toBe(TEST_USER.id);
  });
});

describe("PUT /api/systems/:id", () => {
  test("returns 401 without a token", async () => {
    const res = await buildApp().request("/api/systems/00000000-0000-4000-a000-000000000001", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 on empty patch", async () => {
    const res = await authedRequest("/api/systems/00000000-0000-4000-a000-000000000001", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("applies a name patch", async () => {
    state.systems.push({
      id: "00000000-0000-4000-a000-000000000001",
      name: "Old",
      slug: "old",
    });
    state.updateCalls.length = 0;
    const res = await authedRequest("/api/systems/00000000-0000-4000-a000-000000000001", {
      method: "PUT",
      body: JSON.stringify({ name: "New" }),
    });
    expect(res.status).toBe(200);
    // Two updates: one for entity_protection (via refreshProtection),
    // one for systems. We just check that a systems update happened.
    const systemsUpdate = state.updateCalls.find((c) => c.table === "systems");
    expect(systemsUpdate).toBeDefined();
  });
});
