import { describe, expect, test, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { recordRevision, queryRevisions, getRevisionById } = await import("../src/services/revisions.js");

beforeEach(() => {
  state.revisions.length = 0;
});

describe("recordRevision", () => {
  test("writes a revision row for a non-wiki target", async () => {
    const id = await recordRevision({
      targetType: "system",
      targetId: "00000000-0000-0000-0000-000000000001",
      action: "create",
      actorId: "u1",
      contributorName: "tester",
      editSummary: "Initial",
      payloadAfter: { name: "X" },
    });
    expect(id).toBeDefined();
    expect(state.insertCalls.length).toBeGreaterThan(0);
  });

  test("supports revert with revertedFromId", async () => {
    const id = await recordRevision({
      targetType: "system",
      targetId: "00000000-0000-0000-0000-000000000001",
      action: "revert",
      actorId: "u1",
      contributorName: "tester",
      editSummary: "Reverting to v1",
      revertedFromId: "00000000-0000-0000-0000-000000000002",
    });
    expect(id).toBeDefined();
  });
});

describe("queryRevisions", () => {
  test("returns empty result when no revisions match", async () => {
    const res = await queryRevisions({
      targetType: "system",
      targetId: "missing",
      page: 1,
      pageSize: 10,
    });
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
  });

  test("filters by author", async () => {
    const res = await queryRevisions({
      authorId: "u1",
      page: 1,
      pageSize: 10,
    });
    expect(Array.isArray(res.items)).toBe(true);
  });
});

describe("getRevisionById", () => {
  test("returns null for missing id", async () => {
    const res = await getRevisionById("missing");
    expect(res).toBe(null);
  });
});
