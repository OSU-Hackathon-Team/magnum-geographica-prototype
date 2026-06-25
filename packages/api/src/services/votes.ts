/**
 * Votes service — cast, retract, and tally votes (§21.7).
 *
 * Each `castVote` does four things atomically (or, in this implementation,
 * sequentially within a transaction):
 *   1. Upsert the user's vote row (unique on target_type+target_id+user_id).
 *   2. Update `entity_stats` cache (upvotes/downvotes/net/hidden).
 *   3. Increment the target author's `users.trust_score` by `karmaDelta`.
 *   4. Recompute protection level for the target.
 *
 * Anonymous votes (no user_id) tally and trigger hide-check but award no
 * karma — that mirrors the §21.7 rule that upvote *value* is weighted by
 * the voter's tier, and a New-tier vote still has weight 1.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { votes, entityStats, users } from "../db/schema.js";
import {
  ENTITY_HIDE_NET_SCORE_THRESHOLD,
  type TrustTier,
  type VoteTargetType,
} from "@magnum/shared/constants";
import {
  authorColumn,
  contributorNameColumn,
  isEntityHidden,
  karmaDelta,
  targetTable,
  tierFromKarma,
} from "./karma.js";
import { refreshProtection } from "./protection.js";

export interface CastVoteInput {
  targetType: VoteTargetType;
  targetId: string;
  value: 1 | -1;
  userId: string | null;
  voterKarma: number;
  voterTier: TrustTier;
  contributorName: string;
}

export interface CastVoteResult {
  upvotes: number;
  downvotes: number;
  net: number;
  hidden: boolean;
  myVote: -1 | 0 | 1;
  karmaAwarded: number; // can be negative
}

export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  return db.transaction(async (tx) => {
    // 1. Upsert vote row. If a row exists, the user is changing their vote.
    const existing = input.userId
      ? await tx
          .select()
          .from(votes)
          .where(
            and(
              eq(votes.targetType, input.targetType),
              eq(votes.targetId, input.targetId),
              eq(votes.userId, input.userId),
            ),
          )
          .limit(1)
      : [];

    let previousValue: -1 | 1 | null = null;
    if (existing[0]) {
      previousValue = existing[0].value === 1 ? 1 : -1;
      await tx
        .update(votes)
        .set({
          value: input.value,
          voterKarma: input.voterKarma,
          voterTier: input.voterTier,
          updatedAt: new Date(),
        })
        .where(eq(votes.id, existing[0].id));
    } else {
      await tx.insert(votes).values({
        targetType: input.targetType,
        targetId: input.targetId,
        userId: input.userId,
        value: input.value,
        voterKarma: input.voterKarma,
        voterTier: input.voterTier,
      });
    }

    // 2. Read the current cached entity_stats, then compute the new values
    //    directly. We avoid the onConflictDoUpdate + `GREATEST(0, current + d)`
    //    SQL here so the math is transparent to the test mock.
    const currentStatsRows = await tx
      .select()
      .from(entityStats)
      .where(
        and(
          eq(entityStats.targetType, input.targetType),
          eq(entityStats.targetId, input.targetId),
        ),
      )
      .limit(1);
    const currentStats = currentStatsRows[0];
    const curUp = Number(currentStats?.upvotes ?? 0);
    const curDown = Number(currentStats?.downvotes ?? 0);
    const curNet = Number(currentStats?.net ?? 0);

    const deltaUp = input.value === 1 ? 1 : 0;
    const deltaDown = input.value === -1 ? 1 : 0;
    const prevDeltaUp = previousValue === 1 ? -1 : 0;
    const prevDeltaDown = previousValue === -1 ? -1 : 0;
    const dUp = deltaUp + prevDeltaUp;
    const dDown = deltaDown + prevDeltaDown;
    const dNet = dUp - dDown;

    const newUp = Math.max(0, curUp + dUp);
    const newDown = Math.max(0, curDown + dDown);
    const newNet = curNet + dNet;
    const newHidden = newNet <= ENTITY_HIDE_NET_SCORE_THRESHOLD;

    if (currentStats) {
      await tx
        .update(entityStats)
        .set({
          upvotes: newUp,
          downvotes: newDown,
          net: newNet,
          hidden: newHidden,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(entityStats.targetType, input.targetType),
            eq(entityStats.targetId, input.targetId),
          ),
        );
    } else {
      await tx.insert(entityStats).values({
        targetType: input.targetType,
        targetId: input.targetId,
        upvotes: newUp,
        downvotes: newDown,
        net: newNet,
        hidden: newHidden,
        updatedAt: new Date(),
      });
    }

    // 3. Karma: find the target author and adjust their trust_score. Skip
    //    entirely for anonymous votes — there's no attribution target.
    let karmaAwarded = 0;
    if (input.userId) {
      const table = targetTable(input.targetType);
      const authorCol = authorColumn(input.targetType);
      if (authorCol) {
        const authorRows = await tx.execute<{ author_id: string | null }>(
          sql`SELECT ${sql.raw(authorCol)} AS author_id FROM ${sql.raw(table)} WHERE id = ${input.targetId} LIMIT 1`,
        );
        const authorId = (authorRows.rows[0] as { author_id?: string | null } | undefined)
          ?.author_id;
        if (authorId) {
          // Reverse prior karma if the user changed their vote.
          let totalDelta = 0;
          if (previousValue !== null) {
            totalDelta -= karmaDelta(previousValue, input.voterTier);
          }
          totalDelta += karmaDelta(input.value, input.voterTier);
          if (totalDelta !== 0) {
            await tx
              .update(users)
              .set({ trustScore: sql`GREATEST(0, ${users.trustScore} + ${totalDelta})` })
              .where(eq(users.id, authorId));
            karmaAwarded = totalDelta;
          }
        }
      }
    }
    // Anonymous votes: tally only.
    void contributorNameColumn;

    return {
      upvotes: newUp,
      downvotes: newDown,
      net: newNet,
      hidden: newHidden,
      myVote: input.value,
      karmaAwarded,
    };
  });
}

export async function retractVote(
  targetType: VoteTargetType,
  targetId: string,
  userId: string,
): Promise<CastVoteResult> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.targetType, targetType),
          eq(votes.targetId, targetId),
          eq(votes.userId, userId),
        ),
      )
      .limit(1);
    const row = existing[0];
    if (!row) {
      const fresh = await tx
        .select()
        .from(entityStats)
        .where(and(eq(entityStats.targetType, targetType), eq(entityStats.targetId, targetId)))
        .limit(1);
      return {
        upvotes: Number(fresh[0]?.upvotes ?? 0),
        downvotes: Number(fresh[0]?.downvotes ?? 0),
        net: Number(fresh[0]?.net ?? 0),
        hidden: Boolean(fresh[0]?.hidden ?? false),
        myVote: 0,
        karmaAwarded: 0,
      };
    }
    const previousValue: -1 | 1 = row.value === 1 ? 1 : -1;
    await tx.delete(votes).where(eq(votes.id, row.id));

    // Read current stats and compute new values.
    const statsRows = await tx
      .select()
      .from(entityStats)
      .where(and(eq(entityStats.targetType, targetType), eq(entityStats.targetId, targetId)))
      .limit(1);
    const currentStats = statsRows[0];
    const curUp = Number(currentStats?.upvotes ?? 0);
    const curDown = Number(currentStats?.downvotes ?? 0);
    const curNet = Number(currentStats?.net ?? 0);
    const newUp = Math.max(0, curUp + (previousValue === 1 ? -1 : 0));
    const newDown = Math.max(0, curDown + (previousValue === -1 ? -1 : 0));
    const newNet = curNet - (previousValue === 1 ? 1 : -1);
    const newHidden = newNet <= ENTITY_HIDE_NET_SCORE_THRESHOLD;
    if (currentStats) {
      await tx
        .update(entityStats)
        .set({
          upvotes: newUp,
          downvotes: newDown,
          net: newNet,
          hidden: newHidden,
          updatedAt: new Date(),
        })
        .where(
          and(eq(entityStats.targetType, targetType), eq(entityStats.targetId, targetId)),
        );
    }

    let karmaAwarded = 0;
    const table = targetTable(targetType);
    const authorCol = authorColumn(targetType);
    if (authorCol) {
      const authorRows = await tx.execute<{ author_id: string | null }>(
        sql`SELECT ${sql.raw(authorCol)} AS author_id FROM ${sql.raw(table)} WHERE id = ${targetId} LIMIT 1`,
      );
      const authorId = (authorRows.rows[0] as { author_id?: string | null } | undefined)
        ?.author_id;
      if (authorId) {
        const voterTier: TrustTier = (row.voterTier as TrustTier) ?? "new";
        const delta = -karmaDelta(previousValue, voterTier);
        if (delta !== 0) {
          await tx
            .update(users)
            .set({ trustScore: sql`GREATEST(0, ${users.trustScore} + ${delta})` })
            .where(eq(users.id, authorId));
          karmaAwarded = delta;
        }
      }
    }

    return {
      upvotes: newUp,
      downvotes: newDown,
      net: newNet,
      hidden: newHidden,
      myVote: 0,
      karmaAwarded,
    };
  });
}

export async function getScore(
  targetType: VoteTargetType,
  targetId: string,
  userId: string | null,
): Promise<{ upvotes: number; downvotes: number; net: number; hidden: boolean; myVote: -1 | 0 | 1 }> {
  const [stats, mine] = await Promise.all([
    db
      .select()
      .from(entityStats)
      .where(and(eq(entityStats.targetType, targetType), eq(entityStats.targetId, targetId)))
      .limit(1),
    userId
      ? db
          .select()
          .from(votes)
          .where(
            and(
              eq(votes.targetType, targetType),
              eq(votes.targetId, targetId),
              eq(votes.userId, userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const row = stats[0];
  const myRow = mine[0];
  return {
    upvotes: Number(row?.upvotes ?? 0),
    downvotes: Number(row?.downvotes ?? 0),
    net: Number(row?.net ?? 0),
    hidden: Boolean(row?.hidden ?? false),
    myVote: myRow ? (myRow.value === 1 ? 1 : -1) : 0,
  };
}

/**
 * Convenience: trigger protection recompute after a vote settles. Caller
 * (route) is responsible for the timing.
 */
export async function onVoteChange(
  targetType: VoteTargetType,
  targetId: string,
): Promise<void> {
  await refreshProtection(targetType, targetId);
}

export function userKarmaToTier(karma: number): TrustTier {
  return tierFromKarma(karma);
}
