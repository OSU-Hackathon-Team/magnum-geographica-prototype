/**
 * Synthesis background worker (§Phase 10).
 *
 * - `enqueueSynthesis`: called after a trace is submitted; inserts or
 *   bumps a debounced job for the trace's system(s).
 * - Worker loop: in-process setInterval (15s tick) claims the oldest
 *   `queued` job whose created_at is older than the debounce window,
 *   then runs the full 5-step synthesis pipeline.
 * - Crash recovery: on boot, any jobs stuck in `running` for >10 min
 *   are reset to `queued`.
 * - Full re-synthesis CLI calls `runSynthesisJob` directly.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  synthesisJobs,
  type SynthesisJob,
  type NewSynthesisJob,
} from "../db/schema.js";
import {
  SYNTHESIS_DEBOUNCE_MS,
  type SynthesisScope,
} from "@magnum/shared/constants";
import { runSynthesis } from "./synthesis.js";

let workerRunning = false;

export interface EnqueueOptions {
  scope?: SynthesisScope;
  triggerTraceId?: string;
}

/**
 * Enqueue (or debounce-extend) a synthesis job for a system.
 * If a `queued` job already exists for this system and was created
 * within the debounce window, bump its `created_at` to now.
 * Otherwise insert a new `queued` row.
 */
export async function enqueueSynthesis(
  systemId: string,
  opts: EnqueueOptions = {},
): Promise<SynthesisJob> {
  const scope = opts.scope ?? "incremental";
  const cutoff = new Date(Date.now() - SYNTHESIS_DEBOUNCE_MS);

  // Find an existing queued job for this system within the debounce window.
  const existing = await db
    .select()
    .from(synthesisJobs)
    .where(
      and(
        eq(synthesisJobs.systemId, systemId),
        eq(synthesisJobs.status, "queued"),
        gte(synthesisJobs.createdAt, cutoff),
      ),
    )
    .orderBy(sql`created_at DESC`)
    .limit(1);

  if (existing.length > 0) {
    const existingJob = existing[0]!;
    // Bump the created_at to reset the debounce timer.
    const [updated] = await db
      .update(synthesisJobs)
      .set({ createdAt: new Date(), triggerTraceId: opts.triggerTraceId ?? existingJob.triggerTraceId })
      .where(eq(synthesisJobs.id, existingJob.id))
      .returning();
    return (updated ?? existingJob)!;
  }

  const values: NewSynthesisJob = {
    systemId,
    scope,
    triggerTraceId: opts.triggerTraceId ?? null,
    status: "queued",
    createdAt: new Date(),
  };
  const [job] = await db
    .insert(synthesisJobs)
    .values(values)
    .returning();
  if (!job) throw new Error("failed to enqueue synthesis job");
  return job;
}

/**
 * Claim the next eligible queued job (created_at older than debounce
 * window). Uses a simple SELECT + UPDATE; a future multi-process
 * deployment would wrap this in FOR UPDATE SKIP LOCKED.
 */
async function claimNextJob(): Promise<SynthesisJob | null> {
  const cutoff = new Date(Date.now() - SYNTHESIS_DEBOUNCE_MS);
  const jobs = await db
    .select()
    .from(synthesisJobs)
    .where(
      and(
        eq(synthesisJobs.status, "queued"),
        lte(synthesisJobs.createdAt, cutoff),
      ),
    )
    .orderBy(sql`created_at ASC`)
    .limit(1);

  if (jobs.length === 0) return null;
  const job = jobs[0]!;

  const [claimed] = await db
    .update(synthesisJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(
      and(
        eq(synthesisJobs.id, job.id),
        eq(synthesisJobs.status, "queued"),
      ),
    )
    .returning();

  return claimed ?? null;
}

/**
 * Run one synthesis job end-to-end. Writes results to the job row.
 */
async function runSynthesisJob(job: SynthesisJob): Promise<void> {
  try {
    const result = await runSynthesis(job.systemId);
    await db
      .update(synthesisJobs)
      .set({
        status: "complete",
        finishedAt: new Date(),
        trailsUpdated: result.trailsUpdated,
        segmentsEmitted: result.segmentsEmitted,
      })
      .where(eq(synthesisJobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(synthesisJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: message.slice(0, 2000),
      })
      .where(eq(synthesisJobs.id, job.id));
  }
}

/**
 * Recovery: reset any jobs stuck in `running` for >10 min.
 */
async function recoverStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const result = await db
    .update(synthesisJobs)
    .set({ status: "queued", startedAt: null })
    .where(
      and(
        eq(synthesisJobs.status, "running"),
        lte(synthesisJobs.startedAt ?? new Date(0), cutoff),
      ),
    );
  return result.rowCount ?? 0;
}

/**
 * Main worker loop. Called on a setInterval. Processes one job per
 * tick so the process stays responsive.
 */
async function tick(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const job = await claimNextJob();
    if (job) {
      await runSynthesisJob(job);
    }
  } finally {
    workerRunning = false;
  }
}

/**
 * Start the background synthesis worker. Safe to call on process boot.
 * Skips when MAGNUM_E2E=1 (tests shouldn't run background workers).
 */
export function startSynthesisWorker(): void {
  if (process.env.MAGNUM_E2E === "1") return;

  recoverStuckJobs().then((n) => {
    if (n > 0) console.log(`[synthesis-worker] recovered ${n} stuck jobs`);
  }).catch(console.error);

  setInterval(tick, 15_000).unref();
  console.log("[synthesis-worker] started (15s tick, 60s debounce)");
}
