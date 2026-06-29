/**
 * Full re-synthesis CLI (§Phase 10).
 *
 * Usage:
 *   bun run src/cli/resynthesize-all.ts [--all] [--system=<id>] [--tier=<tier>]
 *
 * Defaults to --all (every system, all tiers).
 * --system=<id>  restricts to traces passing through that system.
 * --tier=<tier>  restricts to trails of that tier (frozen / synthesized).
 *
 * Runs the synthesis pipeline synchronously, one job per system,
 * and prints a summary when done.
 */
import { eq, sql, and } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import {
  systems,
  trails,
  synthesisJobs,
} from "../db/schema.js";
import { runSynthesis } from "../services/synthesis.js";

const args = process.argv.slice(2);

const flags: {
  all?: boolean;
  system?: string;
  tier?: string;
} = {};

for (const arg of args) {
  if (arg === "--all") flags.all = true;
  else if (arg.startsWith("--system=")) flags.system = arg.slice(9);
  else if (arg.startsWith("--tier=")) flags.tier = arg.slice(7);
  else {
    console.error(`Unknown flag: ${arg}`);
    console.error("Usage: bun run src/cli/resynthesize-all.ts [--all] [--system=<id>] [--tier=<tier>]");
    process.exit(1);
  }
}

const scopeAll = flags.all || (!flags.system && !flags.tier);

console.log("[resynthesize] Starting...");
console.log(`  scope:       ${scopeAll ? "all" : "restricted"}`);
if (flags.system) console.log(`  system:      ${flags.system}`);
if (flags.tier) console.log(`  tier:        ${flags.tier}`);

let systemIds: string[];

if (flags.system) {
  const row = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.id, flags.system))
    .limit(1);
  if (!row[0]) {
    console.error(`System not found: ${flags.system}`);
    process.exit(1);
  }
  systemIds = [row[0].id];
} else {
  const rows = await db
    .select({ id: systems.id })
    .from(systems)
    .where(flags.tier
      ? sql`EXISTS (SELECT 1 FROM trail_systems ts
                     INNER JOIN trails t ON t.id = ts.trail_id
                     WHERE ts.system_id = systems.id AND t.tier = ${flags.tier})`
      : undefined);
  systemIds = rows.map((r) => r.id);
}

console.log(`  systems:     ${systemIds.length}`);

let totalTrailsUpdated = 0;
let totalSegmentsEmitted = 0;
let jobsCompleted = 0;
let jobsFailed = 0;

for (const systemId of systemIds) {
  process.stdout.write(`  [${jobsCompleted + 1}/${systemIds.length}] system ${systemId.slice(0, 8)}... `);
  try {
    const [job] = await db
      .insert(synthesisJobs)
      .values({ systemId, scope: "full", status: "running", startedAt: new Date() })
      .returning();
    const jobId = job?.id;
    if (!jobId) throw new Error("failed to insert job");

    const result = await runSynthesis(systemId);

    await db
      .update(synthesisJobs)
      .set({
        status: "complete",
        finishedAt: new Date(),
        trailsUpdated: result.trailsUpdated,
        segmentsEmitted: result.segmentsEmitted,
      })
      .where(eq(synthesisJobs.id, jobId));

    totalTrailsUpdated += result.trailsUpdated;
    totalSegmentsEmitted += result.segmentsEmitted;
    jobsCompleted++;
    console.log(`ok (trails=${result.trailsUpdated}, segments=${result.segmentsEmitted})`);
  } catch (err) {
    jobsFailed++;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAILED: ${message}`);
  }
}

console.log(`\n[resynthesize] Done.`);
console.log(`  completed:   ${jobsCompleted}/${systemIds.length}`);
console.log(`  failed:      ${jobsFailed}`);
console.log(`  trails:      ${totalTrailsUpdated}`);
console.log(`  segments:    ${totalSegmentsEmitted}`);

if (jobsFailed > 0) process.exit(1);

await pool.end();
