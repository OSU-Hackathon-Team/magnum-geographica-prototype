import { describe, expect, test, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { castVote, retractVote, getScore } = await import("../src/services/votes.js");
const { Hono } = await import("hono");
const { votesRoute } = await import("../src/routes/votes.js");

// Set up an "authored" feature row so karma math has a target to attribute to.
const FEATURE_ID = "00000000-0000-0000-0000-0000000000aa";
const AUTHOR_ID = "00000000-0000-0000-0000-0000000000bb";
const VOTER_ID = "00000000-0000-0000-0000-0000000000cc";

beforeEach(() => {
  state.features.length = 0;
  state.features.push({
    id: FEATURE_ID,
    name: "Test feature",
    type_tag: "bench",
    point: { type: "Point", coordinates: [0, 0] },
    trail_id: null,
    system_id: null,
    created_by_user_id: AUTHOR_ID,
    contributor_name: "tester",
    description: null,
    hidden: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  state.users.length = 0;
  state.users.push({
    id: AUTHOR_ID,
    username: "author",
    email: "a@example.com",
    password_hash: "x",
    role: "contributor",
    trust_score: 10,
    display_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  state.votes = (state as unknown as { votes: Array<Record<string, unknown>> }).votes ?? [];
  (state as unknown as { votes: Array<Record<string, unknown>> }).votes.length = 0;
  state.entityStats = (state as unknown as { entityStats: Array<Record<string, unknown>> }).entityStats ?? [];
  (state as unknown as { entityStats: Array<Record<string, unknown>> }).entityStats.length = 0;
  // The karma service uses `db.execute` with raw SQL to look up the author
  // of a target entity. Route any SQL that mentions the features table to
  // return the seeded feature's author.
  state.executeRouter.length = 0;
  state.executeRouter.push({
    match: "from features",
    rows: [{ author_id: AUTHOR_ID }],
  });
});

describe("castVote", () => {
  test("upvote increments tally and awards karma to author", async () => {
    const res = await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: 1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    expect(res.upvotes).toBe(1);
    expect(res.downvotes).toBe(0);
    expect(res.net).toBe(1);
    expect(res.myVote).toBe(1);
    expect(res.karmaAwarded).toBe(1);
  });

  test("downvote decrements tally and subtracts karma", async () => {
    const res = await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: -1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    expect(res.upvotes).toBe(0);
    expect(res.downvotes).toBe(1);
    expect(res.net).toBe(-1);
    expect(res.karmaAwarded).toBe(-1);
  });

  test("trusted-tier upvote awards 3 karma", async () => {
    const res = await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: 1,
      userId: VOTER_ID,
      voterKarma: 500,
      voterTier: "trusted",
      contributorName: "trusted-voter",
    });
    expect(res.karmaAwarded).toBe(3);
  });

  test("changing vote reverses prior karma", async () => {
    // Start with an upvote.
    await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: 1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    // Flip to downvote.
    const flipped = await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: -1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    expect(flipped.upvotes).toBe(0);
    expect(flipped.downvotes).toBe(1);
    expect(flipped.net).toBe(-1);
    // Net karma awarded: -1 (this vote) - 1 (reverse prior +1) = -2
    expect(flipped.karmaAwarded).toBe(-2);
  });

  test("unauthenticated vote returns 401", async () => {
    const app = new Hono().route("/api/votes", votesRoute);
    const res = await app.request("/api/votes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "feature",
        target_id: FEATURE_ID,
        value: 1,
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("retractVote", () => {
  test("retract removes vote and reverses karma", async () => {
    await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: 1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    const res = await retractVote("feature", FEATURE_ID, VOTER_ID);
    expect(res.upvotes).toBe(0);
    expect(res.myVote).toBe(0);
    expect(res.karmaAwarded).toBe(-1);
  });

  test("retract of non-existent vote is a no-op", async () => {
    const res = await retractVote("feature", FEATURE_ID, VOTER_ID);
    expect(res.upvotes).toBe(0);
    expect(res.downvotes).toBe(0);
    expect(res.karmaAwarded).toBe(0);
  });
});

describe("getScore", () => {
  test("returns zero stats for unseen target", async () => {
    const res = await getScore("feature", FEATURE_ID, VOTER_ID);
    expect(res.upvotes).toBe(0);
    expect(res.downvotes).toBe(0);
    expect(res.net).toBe(0);
    expect(res.myVote).toBe(0);
  });

  test("returns my_vote when called with a userId", async () => {
    await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: 1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    const res = await getScore("feature", FEATURE_ID, VOTER_ID);
    expect(res.upvotes).toBe(1);
    expect(res.myVote).toBe(1);
  });

  test("returns my_vote=0 for a different user", async () => {
    await castVote({
      targetType: "feature",
      targetId: FEATURE_ID,
      value: 1,
      userId: VOTER_ID,
      voterKarma: 0,
      voterTier: "new",
      contributorName: "voter",
    });
    const res = await getScore("feature", FEATURE_ID, "other-user-id");
    expect(res.upvotes).toBe(1);
    expect(res.myVote).toBe(0);
  });
});
