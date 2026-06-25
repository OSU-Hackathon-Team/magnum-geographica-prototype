import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  castVoteInputSchema,
  entityScoreSchema,
  voteTargetTypeSchema,
  userKarmaSchema,
} from "@magnum/shared/schemas";
import { castVote, getScore, retractVote, onVoteChange } from "../services/votes.js";
import { tierFromKarma } from "../services/karma.js";
import { authRequired, type AuthUser } from "../middleware/auth.js";

type Variables = { user?: AuthUser };

export const votesRoute = new Hono<{ Variables: Variables }>();

async function loadActorContext(
  user: AuthUser | undefined,
  contributorName: string | undefined,
): Promise<{ userId: string | null; karma: number; tier: ReturnType<typeof tierFromKarma>; contributorName: string }> {
  if (user) {
    const rows = await db
      .select({ karma: users.trustScore, username: users.username })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const karma = Number(rows[0]?.karma ?? 0);
    return {
      userId: user.id,
      karma,
      tier: tierFromKarma(karma),
      contributorName: user.username,
    };
  }
  return {
    userId: null,
    karma: 0,
    tier: "new",
    contributorName: contributorName ?? "anonymous",
  };
}

// Cast a vote. Body: { target_type, target_id, value: 1 | -1 }.
votesRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = castVoteInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "validation failed" },
      400,
    );
  }
  const authUser = c.get("user");
  const actor = await loadActorContext(authUser, c.req.header("x-contributor-name") ?? undefined);
  if (!actor.userId && !actor.contributorName) {
    return c.json({ error: "unauthorized", message: "login or set contributor name" }, 401);
  }
  const result = await castVote({
    targetType: parsed.data.target_type,
    targetId: parsed.data.target_id,
    value: parsed.data.value as 1 | -1,
    userId: actor.userId,
    voterKarma: actor.karma,
    voterTier: actor.tier,
    contributorName: actor.contributorName,
  });
  await onVoteChange(parsed.data.target_type, parsed.data.target_id);
  return c.json({
    upvotes: result.upvotes,
    downvotes: result.downvotes,
    net: result.net,
    hidden: result.hidden,
    my_vote: result.myVote,
    karma_awarded: result.karmaAwarded,
  });
});

// Retract a vote.
votesRoute.delete("/:targetType/:targetId", async (c) => {
  const targetTypeParsed = voteTargetTypeSchema.safeParse(c.req.param("targetType"));
  if (!targetTypeParsed.success) {
    return c.json({ error: "invalid_input", message: "unknown target_type" }, 400);
  }
  const targetId = c.req.param("targetId");
  const authUser = c.get("user");
  if (!authUser) {
    return c.json({ error: "unauthorized", message: "login required" }, 401);
  }
  const result = await retractVote(targetTypeParsed.data, targetId, authUser.id);
  await onVoteChange(targetTypeParsed.data, targetId);
  return c.json({
    upvotes: result.upvotes,
    downvotes: result.downvotes,
    net: result.net,
    hidden: result.hidden,
    my_vote: result.myVote,
    karma_awarded: result.karmaAwarded,
  });
});

// Get current score + (if logged in) the caller's vote on a target.
votesRoute.get("/:targetType/:targetId", async (c) => {
  const targetTypeParsed = voteTargetTypeSchema.safeParse(c.req.param("targetType"));
  if (!targetTypeParsed.success) {
    return c.json({ error: "invalid_input", message: "unknown target_type" }, 400);
  }
  const targetId = c.req.param("targetId");
  const authUser = c.get("user");
  const score = await getScore(targetTypeParsed.data, targetId, authUser?.id ?? null);
  return c.json(entityScoreSchema.parse({ ...score, target_type: targetTypeParsed.data, target_id: targetId }));
});

// Generic entity score shortcut (used by the UI for any votable surface).
votesRoute.get("/score/:targetType/:targetId", async (c) => {
  const targetTypeParsed = voteTargetTypeSchema.safeParse(c.req.param("targetType"));
  if (!targetTypeParsed.success) {
    return c.json({ error: "invalid_input", message: "unknown target_type" }, 400);
  }
  const targetId = c.req.param("targetId");
  const authUser = c.get("user");
  const score = await getScore(targetTypeParsed.data, targetId, authUser?.id ?? null);
  return c.json(entityScoreSchema.parse({ ...score, target_type: targetTypeParsed.data, target_id: targetId }));
});

// Per-user karma lookup (used by Profile page).
votesRoute.get("/users/:id/karma", async (c) => {
  const id = c.req.param("id");
  const rows = await db
    .select({
      user_id: users.id,
      username: users.username,
      display_name: users.displayName,
      karma: users.trustScore,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const u = rows[0];
  if (!u) return c.json({ error: "not_found", message: "user not found" }, 404);
  const tier = tierFromKarma(Number(u.karma));
  // Tally contributions received across votable targets.
  const received = await db.execute<{ up: number; down: number; traces: number; features: number; revisions: number }>(
    sql`SELECT
      COALESCE((SELECT sum(upvotes) FROM entity_stats es
                JOIN features f ON f.id = es.target_id AND es.target_type = 'feature'
                WHERE f.created_by_user_id = ${id}), 0)::int AS up,
      COALESCE((SELECT sum(downvotes) FROM entity_stats es
                JOIN features f ON f.id = es.target_id AND es.target_type = 'feature'
                WHERE f.created_by_user_id = ${id}), 0)::int AS down,
      COALESCE((SELECT count(*) FROM gps_traces WHERE user_id = ${id}), 0)::int AS traces,
      COALESCE((SELECT count(*) FROM features WHERE created_by_user_id = ${id}), 0)::int AS features,
      COALESCE((SELECT count(*) FROM revisions WHERE author_id = ${id}), 0)::int AS revisions`,
  );
  const row = received.rows[0] as
    | { up: number; down: number; traces: number; features: number; revisions: number }
    | undefined;
  return c.json(
    userKarmaSchema.parse({
      user_id: u.user_id,
      karma: Number(u.karma),
      tier,
      tier_label: tier,
      upvotes_received: Number(row?.up ?? 0),
      downvotes_received: Number(row?.down ?? 0),
      trace_count: Number(row?.traces ?? 0),
      feature_count: Number(row?.features ?? 0),
      revision_count: Number(row?.revisions ?? 0),
    }),
  );
});
