/**
 * Synthesis routes (§21.6 phase 2).
 *
 *  POST /api/systems/:id/synthesize                — moderator+: run a
 *                                                     synthesis pass
 *                                                     for a system
 *  GET  /api/admin/synthesis-proposals             — moderator+: list
 *                                                     "possible new
 *                                                     trail" proposals
 *                                                     for a system
 *  POST /api/admin/synthesis-proposals/:segId/approve
 *  POST /api/admin/synthesis-proposals/:segId/reject
 *  POST /api/admin/trails/:id/promote              — moderator+:
 *                                                     promote a
 *                                                     synthesized trail
 *                                                     to elevated
 *  POST /api/admin/trails/import                   — moderator+:
 *                                                     import a premium
 *                                                     trail from
 *                                                     GeoJSON
 */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { trails } from "../db/schema.js";
import { moderatorRequired, type AuthUser } from "../middleware/auth.js";
import {
  approveProposal,
  importPremiumTrail,
  listProposals,
  promoteTrail,
  rejectProposal,
  runSynthesis,
} from "../services/synthesis.js";
import { recordRevision } from "../services/revisions.js";

type Variables = { user?: AuthUser };

export const synthesisRoute = new Hono<{ Variables: Variables }>();

synthesisRoute.post("/systems/:id/synthesize", moderatorRequired(), async (c) => {
  const systemId = String(c.req.param("id"));
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  try {
    const result = await runSynthesis(systemId);
    await recordRevision({
      action: "update",
      targetType: "system",
      targetId: systemId,
      actorId: authUser.id,
      contributorName: authUser.username,
      payloadAfter: {
        synthesisRunId: result.run.id,
        assigned: result.assigned,
        proposed: result.proposed,
      },
    });
    return c.json({
      run: {
        id: result.run.id,
        status: result.run.status,
        trails_updated: result.trailsUpdated,
        trails_proposed: result.proposed,
      },
      clusters: result.clusters,
      assigned: result.assigned,
      proposed: result.proposed,
      trails_updated: result.trailsUpdated,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

synthesisRoute.get("/admin/synthesis-proposals", moderatorRequired(), async (c) => {
  const systemId = c.req.query("system_id");
  if (!systemId) return c.json({ error: "system_id is required" }, 400);
  const proposals = await listProposals(systemId);
  return c.json({ proposals });
});

const approveBody = z.object({
  system_id: z.string().min(1),
  name: z.string().min(1).max(200),
});

synthesisRoute.post(
  "/admin/synthesis-proposals/:segmentId/approve",
  moderatorRequired(),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = approveBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
    }
    const segmentId = String(c.req.param("segmentId"));
    const trail = await approveProposal(parsed.data.system_id, segmentId, parsed.data.name);
    return c.json({ id: trail.id, name: trail.name, tier: trail.tier, slug: trail.slug });
  },
);

synthesisRoute.post(
  "/admin/synthesis-proposals/:segmentId/reject",
  moderatorRequired(),
  async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { system_id?: string };
    const systemId = body?.system_id;
    if (!systemId) return c.json({ error: "system_id is required" }, 400);
    const segmentId = String(c.req.param("segmentId"));
    await rejectProposal(systemId, segmentId);
    return c.json({ ok: true });
  },
);

const promoteBody = z.object({ to: z.enum(["elevated", "premium"]) });

synthesisRoute.post("/admin/trails/:id/promote", moderatorRequired(), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = promoteBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const id = String(c.req.param("id"));
  const trail = await promoteTrail(id, parsed.data.to);
  if (!trail) return c.json({ error: "trail not found" }, 404);
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  await recordRevision({
    action: "update",
    targetType: "trail",
    targetId: trail.id,
    actorId: authUser.id,
    contributorName: authUser.username,
    payloadAfter: { promotedTo: trail.tier },
  });
  return c.json({ id: trail.id, tier: trail.tier });
});

const importBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  system_id: z.string().min(1),
  difficulty: z.enum(["easy", "moderate", "hard", "expert"]).optional(),
  external_url: z.string().url().optional(),
  geometry: z.unknown(),
});

synthesisRoute.post("/admin/trails/import", moderatorRequired(), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = importBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const existing = await db.select().from(trails).where(eq(trails.slug, parsed.data.slug)).limit(1);
  if (existing[0]) return c.json({ error: "trail with that slug already exists" }, 409);
  const trail = await importPremiumTrail({
    name: parsed.data.name,
    slug: parsed.data.slug,
    systemId: parsed.data.system_id,
    geometry: parsed.data.geometry,
    difficulty: parsed.data.difficulty,
    externalUrl: parsed.data.external_url,
  });
  const authUser = c.get("user");
  if (!authUser) return c.json({ error: "unauthorized" }, 401);
  await recordRevision({
    action: "update",
    targetType: "trail",
    targetId: trail.id,
    actorId: authUser.id,
    contributorName: authUser.username,
    payloadAfter: { imported: true, tier: trail.tier, source: "premium" },
  });
  return c.json({ id: trail.id, name: trail.name, tier: trail.tier, slug: trail.slug });
});
