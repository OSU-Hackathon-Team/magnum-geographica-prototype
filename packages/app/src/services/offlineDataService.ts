import { getOfflineDb } from "../db";

export interface StoredTrail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  difficulty: string | null;
  length_meters: number | null;
  elevation_gain_meters: number | null;
  verified: number;
}

export async function getDownloadedSystems() {
  const db = await getOfflineDb();
  return db.exec(
    "SELECT system_id, system_name, tile_size_bytes, geojson_size_bytes, wiki_size_bytes, generated_at, last_synced FROM downloaded_packs",
  );
}

export async function isSystemDownloaded(systemId: string): Promise<boolean> {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT 1 FROM downloaded_packs WHERE system_id = ?", [systemId]);
  return rows.length > 0;
}

export async function getSystemTrails(systemId: string): Promise<StoredTrail[]> {
  const db = await getOfflineDb();
  return db.exec(
    `SELECT t.id, t.name, t.slug, t.description, t.difficulty, t.length_meters, t.elevation_gain_meters, t.verified
     FROM trails t
     INNER JOIN trail_systems ts ON ts.trail_id = t.id
     WHERE ts.system_id = ?`,
    [systemId],
  ) as unknown as Promise<StoredTrail[]>;
}

export async function getAllDownloadedSystems() {
  const db = await getOfflineDb();
  return db.exec("SELECT id, name, slug, description FROM systems");
}

export async function getTrailById(id: string) {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT * FROM trails WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function getTrailBySlug(slug: string) {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT * FROM trails WHERE slug = ?", [slug]);
  return rows[0] ?? null;
}

export async function getAllDownloadedTrails(): Promise<StoredTrail[]> {
  const db = await getOfflineDb();
  return db.exec(
    "SELECT id, name, slug, description, difficulty, length_meters, elevation_gain_meters, verified FROM trails",
  ) as unknown as Promise<StoredTrail[]>;
}

export async function getFeatureById(id: string) {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT * FROM features WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function getTrailSegments(trailId: string) {
  const db = await getOfflineDb();
  return db.exec("SELECT * FROM trail_segments WHERE trail_id = ? ORDER BY sort_order", [trailId]);
}

export async function updateLocalSegment(
  segmentId: string,
  fields: {
    name?: string | null;
    surface_type?: string | null;
    hazards?: string[];
    is_road_connector?: boolean;
    steep_grade?: boolean;
    one_way?: boolean;
    description?: string | null;
    sort_order?: number;
  },
) {
  const db = await getOfflineDb();
  const sets: string[] = [];
  const params: (string | number)[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k === "hazards") {
      sets.push("hazards = ?");
      params.push(JSON.stringify(v));
    } else {
      sets.push(`${k} = ?`);
      params.push(typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number));
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(segmentId);
  await db.execRaw(`UPDATE trail_segments SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteLocalSegment(segmentId: string) {
  const db = await getOfflineDb();
  await db.execRaw("DELETE FROM trail_segments WHERE id = ?", [segmentId]);
}

export async function insertLocalSegment(segment: {
  id: string;
  trail_id: string;
  name?: string | null;
  sort_order: number;
  surface_type?: string | null;
  hazards?: string[];
  is_road_connector?: boolean;
  steep_grade?: boolean;
  one_way?: boolean;
  description?: string | null;
  length_meters?: number | null;
}) {
  const db = await getOfflineDb();
  await db.execRaw(
    `INSERT INTO trail_segments (id, trail_id, name, sort_order, surface_type, hazards, is_road_connector, steep_grade, one_way, description, length_meters, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       sort_order = excluded.sort_order,
       surface_type = excluded.surface_type,
       hazards = excluded.hazards,
       is_road_connector = excluded.is_road_connector,
       steep_grade = excluded.steep_grade,
       one_way = excluded.one_way,
       description = excluded.description,
       length_meters = excluded.length_meters,
       updated_at = excluded.updated_at`,
    [
      segment.id,
      segment.trail_id,
      segment.name ?? null,
      segment.sort_order,
      segment.surface_type ?? null,
      JSON.stringify(segment.hazards ?? []),
      segment.is_road_connector ? 1 : 0,
      segment.steep_grade ? 1 : 0,
      segment.one_way ? 1 : 0,
      segment.description ?? null,
      segment.length_meters ?? null,
      new Date().toISOString(),
    ],
  );
}

export async function reorderLocalSegments(trailId: string, orderedIds: string[]) {
  const db = await getOfflineDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execRaw(
      "UPDATE trail_segments SET sort_order = ?, updated_at = ? WHERE id = ? AND trail_id = ?",
      [i, new Date().toISOString(), orderedIds[i], trailId],
    );
  }
}

export async function getTrailFeatures(trailId: string) {
  const db = await getOfflineDb();
  return db.exec("SELECT * FROM features WHERE trail_id = ?", [trailId]);
}

export async function getSystemFeatures(systemId: string) {
  const db = await getOfflineDb();
  return db.exec("SELECT * FROM features WHERE system_id = ?", [systemId]);
}

export async function getWikiPage(targetType: string, targetId: string) {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT * FROM wiki_pages WHERE target_type = ? AND target_id = ?", [
    targetType,
    targetId,
  ]);
  return rows[0] ?? null;
}

export async function getWikiRevisions(wikiPageId: string) {
  const db = await getOfflineDb();
  return db.exec("SELECT * FROM revisions WHERE wiki_page_id = ? ORDER BY created_at DESC", [
    wikiPageId,
  ]);
}

export async function searchOffline(query: string) {
  const db = await getOfflineDb();
  const pattern = `%${query}%`;
  const systems = await db.exec(
    "SELECT id, name, slug, 'system' as type FROM systems WHERE name LIKE ? LIMIT 10",
    [pattern],
  );
  const trails = await db.exec(
    "SELECT id, name, slug, 'trail' as type FROM trails WHERE name LIKE ? LIMIT 10",
    [pattern],
  );
  const features = await db.exec(
    "SELECT id, name, 'feature' as type FROM features WHERE name LIKE ? LIMIT 10",
    [pattern],
  );
  return { systems, trails, features };
}

export async function removeDownloadedPack(systemId: string) {
  const db = await getOfflineDb();
  await db.execRaw("DELETE FROM trail_systems WHERE system_id = ?", [systemId]);
  await db.execRaw(
    "DELETE FROM trail_segments WHERE trail_id IN (SELECT id FROM trails WHERE id IN (SELECT trail_id FROM trail_systems))",
  );
  await db.execRaw(
    "DELETE FROM trails WHERE id IN (SELECT trail_id FROM trail_systems WHERE system_id = ?)",
    [systemId],
  );
  await db.execRaw("DELETE FROM features WHERE system_id = ?", [systemId]);
  await db.execRaw("DELETE FROM wiki_pages WHERE target_type = 'system' AND target_id = ?", [
    systemId,
  ]);
  await db.execRaw("DELETE FROM systems WHERE id = ?", [systemId]);
  await db.execRaw("DELETE FROM downloaded_packs WHERE system_id = ?", [systemId]);
}

export async function getTotalDownloadedSize(): Promise<number> {
  const db = await getOfflineDb();
  const rows = await db.exec(
    "SELECT COALESCE(SUM(tile_size_bytes + geojson_size_bytes + wiki_size_bytes), 0) as total FROM downloaded_packs",
  );
  return Number(rows[0]?.total ?? 0);
}

export async function addPendingContribution(
  entityType: string,
  action: string,
  payload: unknown,
  contributorName: string,
  entityId?: string,
): Promise<number> {
  const db = await getOfflineDb();
  const result = (await db.execRaw(
    `INSERT INTO pending_contributions (entity_type, entity_id, action, payload, contributor_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entityType,
      entityId ?? null,
      action,
      JSON.stringify(payload),
      contributorName,
      new Date().toISOString(),
    ],
  )) as unknown as { insertId?: number; rowsAffected?: number } | Array<Record<string, unknown>>;
  // op-sqlite returns either an object with `insertId` or an empty
  // row array depending on platform. Fall back to lastInsertRowid
  // when the descriptor doesn't carry it.
  if (result && typeof result === "object" && !Array.isArray(result)) {
    if (typeof (result as { insertId?: number }).insertId === "number") {
      return (result as { insertId: number }).insertId;
    }
  }
  const lastIdRows = (await db.exec("SELECT last_insert_rowid() AS id")) as unknown as Array<{
    id: number;
  }>;
  return Number(lastIdRows[0]?.id ?? 0);
}

export interface PendingContributionRow {
  id: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: unknown;
  contributor_name: string;
  created_at: string;
  sync_status: string;
  server_id?: string | null;
  conflict_revision_id?: string | null;
}

export async function getPendingContributions(): Promise<PendingContributionRow[]> {
  const db = await getOfflineDb();
  const rows = await db.exec(
    "SELECT * FROM pending_contributions WHERE sync_status = 'pending' ORDER BY created_at",
  );
  return rows.map(
    (r): PendingContributionRow => ({
      id: Number(r.id),
      entity_type: String(r.entity_type ?? ""),
      entity_id: r.entity_id ? String(r.entity_id) : null,
      action: String(r.action ?? ""),
      payload: JSON.parse(String(r.payload)),
      contributor_name: String(r.contributor_name ?? "anonymous"),
      created_at: String(r.created_at ?? ""),
      sync_status: String(r.sync_status ?? "pending"),
    }),
  );
}

export async function markContributionSynced(localId: number, serverId: string) {
  const db = await getOfflineDb();
  await db.execRaw(
    "UPDATE pending_contributions SET sync_status = 'synced', server_id = ? WHERE id = ?",
    [serverId, localId],
  );
}

export async function markContributionConflict(localId: number, conflictRevisionId: string) {
  const db = await getOfflineDb();
  await db.execRaw(
    "UPDATE pending_contributions SET sync_status = 'conflict', conflict_revision_id = ? WHERE id = ?",
    [conflictRevisionId, localId],
  );
}

export async function deletePendingContribution(localId: number) {
  const db = await getOfflineDb();
  await db.execRaw("DELETE FROM pending_contributions WHERE id = ?", [localId]);
}

export async function getPendingCount(): Promise<number> {
  const db = await getOfflineDb();
  const rows = await db.exec(
    "SELECT COUNT(*) as cnt FROM pending_contributions WHERE sync_status = 'pending'",
  );
  return Number(rows[0]?.cnt ?? 0);
}

export interface OfflineMapData {
  trails: unknown;
  systems: unknown;
  features: unknown;
}

export async function loadOfflineMapData(_systemId?: string): Promise<OfflineMapData | null> {
  const db = await getOfflineDb();
  const trails = await db.exec(
    "SELECT id, name, slug, description, difficulty, length_meters, elevation_gain_meters, verified FROM trails",
  );
  const features = await db.exec(
    "SELECT id, name, type_tag, description, trail_id, system_id, lon, lat FROM features",
  );
  const systems = await db.exec(
    "SELECT id, name, slug, description, min_lon, max_lon, min_lat, max_lat FROM systems",
  );

  if (trails.length === 0 && features.length === 0 && systems.length === 0) return null;

  const trailFeatures = trails.map((t: Record<string, unknown>) => ({
    type: "Feature",
    id: t.id,
    geometry: null,
    properties: {
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      difficulty: t.difficulty,
      surface_type: undefined,
      is_road_connector: false,
      is_verified: Boolean(t.verified),
    },
  }));

  const featurePoints = features.map((f: Record<string, unknown>) => {
    let geometry = null;
    if (f.lon != null && f.lat != null) {
      geometry = { type: "Point", coordinates: [Number(f.lon), Number(f.lat)] };
    }
    return {
      type: "Feature",
      id: f.id,
      geometry,
      properties: {
        id: f.id,
        name: f.name,
        type_tag: f.type_tag,
        description: f.description,
        system_id: f.system_id,
        trail_id: f.trail_id,
      },
    };
  });

  const systemFeatures = systems.map((s: Record<string, unknown>) => ({
    type: "Feature",
    id: s.id,
    geometry: null,
    properties: {
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
    },
  }));

  return {
    trails: { type: "FeatureCollection", features: trailFeatures },
    systems: { type: "FeatureCollection", features: systemFeatures },
    features: { type: "FeatureCollection", features: featurePoints },
  };
}

export async function getDownloadedRegionIds(): Promise<string[]> {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT id FROM offline_regions");
  return rows.map((r) => String(r.id));
}

export async function getOfflineRegions() {
  const db = await getOfflineDb();
  return db.exec("SELECT * FROM offline_regions");
}

export async function deleteAllOfflineRegions() {
  const db = await getOfflineDb();
  await db.execRaw("DELETE FROM offline_regions");
  await db.execRaw("DELETE FROM systems");
  await db.execRaw("DELETE FROM trails");
  await db.execRaw("DELETE FROM trail_systems");
  await db.execRaw("DELETE FROM trail_segments");
  await db.execRaw("DELETE FROM features");
  await db.execRaw(
    "DELETE FROM wiki_pages WHERE target_type != 'trail' AND target_type != 'system' AND target_type != 'feature'",
  );
}

export async function deleteOfflineRegion(regionId: string) {
  const db = await getOfflineDb();
  await db.exec("DELETE FROM offline_regions WHERE id = ?", [regionId]);
  const usages = await db.exec("SELECT id FROM offline_regions WHERE id = ?", [regionId]);
  if (usages.length > 0) return;
  await db.execRaw("DELETE FROM systems");
  await db.execRaw("DELETE FROM trails");
  await db.execRaw("DELETE FROM trail_systems");
  await db.execRaw("DELETE FROM trail_segments");
  await db.execRaw("DELETE FROM features");
  await db.execRaw(
    "DELETE FROM wiki_pages WHERE target_type != 'trail' AND target_type != 'system' AND target_type != 'feature'",
  );
}

// ========== Trace recording sessions (live background tracking) ==========
//
// A `trace_sessions` row is the durable record of an in-progress recording
// and is the recovery source if the app is killed mid-hike. The streaming
// GPS samples live in `trace_points`. See `db/schema.ts` for the full
// table contracts.

export interface TraceSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "recording" | "paused" | "submitted" | "discarded";
  source: "recorded";
  total_points: number;
  total_meters: number;
  server_trace_id: string | null;
  pending_contribution_id: number | null;
  updated_at: string;
}

export interface TracePoint {
  id: number;
  session_id: string;
  seq: number;
  lon: number;
  lat: number;
  elevation: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
  received_at: string;
}

/**
 * Create a fresh recording session. Returns the new session row. The
 * `id` is generated client-side (uuid v4) so subsequent writes to
 * `trace_points` from background tasks can run before the JS state is
 * rehydrated.
 */
export async function createTraceSession(
  id: string,
  startedAt: string,
): Promise<TraceSession> {
  const db = await getOfflineDb();
  const now = new Date().toISOString();
  await db.execRaw(
    `INSERT INTO trace_sessions (id, started_at, status, source, total_points, total_meters, updated_at)
     VALUES (?, ?, 'recording', 'recorded', 0, 0, ?)`,
    [id, startedAt, now],
  );
  return {
    id,
    started_at: startedAt,
    ended_at: null,
    status: "recording",
    source: "recorded",
    total_points: 0,
    total_meters: 0,
    server_trace_id: null,
    pending_contribution_id: null,
    updated_at: now,
  };
}

/**
 * Append a single GPS sample to a session. The `seq` is assigned at
 * write time as `total_points + 1` to keep the in-session ordering
 * stable regardless of clock skew between background events. Returns
 * the assigned seq.
 */
export async function appendTracePoint(
  sessionId: string,
  point: {
    lon: number;
    lat: number;
    elevation?: number | null;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
    recorded_at: string;
  },
): Promise<number> {
  const db = await getOfflineDb();
  const head = (await db.exec(
    "SELECT total_points, total_meters FROM trace_sessions WHERE id = ?",
    [sessionId],
  )) as unknown as Array<{ total_points: number; total_meters: number }>;
  const prev = head[0]?.total_points ?? 0;
  const seq = prev + 1;
  const receivedAt = new Date().toISOString();
  await db.execRaw(
    `INSERT INTO trace_points
       (session_id, seq, lon, lat, elevation, accuracy, speed, heading, recorded_at, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      seq,
      point.lon,
      point.lat,
      point.elevation ?? null,
      point.accuracy ?? null,
      point.speed ?? null,
      point.heading ?? null,
      point.recorded_at,
      receivedAt,
    ],
  );
  // `total_meters` is recomputed cheaply by re-reading the previous
  // segment length off the last point. For very long sessions we'd
  // cache this on the session row; for now we recompute on submit.
  await db.execRaw(
    "UPDATE trace_sessions SET total_points = ?, updated_at = ? WHERE id = ?",
    [seq, receivedAt, sessionId],
  );
  return seq;
}

/**
 * Bulk-append a list of points, used by the recovery flow when we
 * backfill points from the on-disk background-geolocation database
 * after a kill. The `seq` is computed from the current session
 * `total_points` so a recovery never collides with previously-written
 * points.
 */
export async function appendTracePointsBulk(
  sessionId: string,
  points: Array<{
    lon: number;
    lat: number;
    elevation?: number | null;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
    recorded_at: string;
  }>,
): Promise<number> {
  if (points.length === 0) return 0;
  const db = await getOfflineDb();
  const head = (await db.exec(
    "SELECT total_points FROM trace_sessions WHERE id = ?",
    [sessionId],
  )) as unknown as Array<{ total_points: number }>;
  let seq = head[0]?.total_points ?? 0;
  const receivedAt = new Date().toISOString();
  await db.exec("BEGIN TRANSACTION");
  try {
    for (const p of points) {
      seq += 1;
      await db.execRaw(
        `INSERT INTO trace_points
           (session_id, seq, lon, lat, elevation, accuracy, speed, heading, recorded_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          seq,
          p.lon,
          p.lat,
          p.elevation ?? null,
          p.accuracy ?? null,
          p.speed ?? null,
          p.heading ?? null,
          p.recorded_at,
          receivedAt,
        ],
      );
    }
    await db.execRaw(
      "UPDATE trace_sessions SET total_points = ?, updated_at = ? WHERE id = ?",
      [seq, receivedAt, sessionId],
    );
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
  return seq;
}

/**
 * Recompute `total_meters` on a session by walking its points in seq
 * order. The library writes a fresh `total_meters` on submit; this is
 * what recovery flows call when a session's distance was lost to a
 * crash.
 */
export async function recomputeTraceDistance(sessionId: string): Promise<number> {
  const db = await getOfflineDb();
  const points = (await db.exec(
    "SELECT lon, lat FROM trace_points WHERE session_id = ? ORDER BY seq",
    [sessionId],
  )) as unknown as Array<{ lon: number; lat: number }>;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const cosLat = Math.cos((a.lat * Math.PI) / 180);
    const dx = (b.lon - a.lon) * cosLat;
    const dy = b.lat - a.lat;
    total += Math.hypot(dx, dy) * 111_320;
  }
  await db.execRaw("UPDATE trace_sessions SET total_meters = ?, updated_at = ? WHERE id = ?", [
    total,
    new Date().toISOString(),
    sessionId,
  ]);
  return total;
}

/**
 * Read every point for a session in `seq` order. Used both for the
 * live map preview and for the final submit payload.
 */
export async function listTracePoints(sessionId: string): Promise<TracePoint[]> {
  const db = await getOfflineDb();
  const rows = (await db.exec(
    "SELECT * FROM trace_points WHERE session_id = ? ORDER BY seq",
    [sessionId],
  )) as unknown as TracePoint[];
  return rows;
}

export async function getTraceSession(id: string): Promise<TraceSession | null> {
  const db = await getOfflineDb();
  const rows = (await db.exec("SELECT * FROM trace_sessions WHERE id = ?", [id])) as unknown as
    | TraceSession[]
    | undefined;
  return rows?.[0] ?? null;
}

/**
 * The single "active" session if any. Active = status in
 * (`recording`, `paused`). On app launch we use this to decide
 * whether to show the recovery modal.
 */
export async function getActiveTraceSession(): Promise<TraceSession | null> {
  const db = await getOfflineDb();
  const rows = (await db.exec(
    "SELECT * FROM trace_sessions WHERE status IN ('recording', 'paused') ORDER BY started_at DESC LIMIT 1",
  )) as unknown as TraceSession[] | undefined;
  return rows?.[0] ?? null;
}

export async function listRecentTraceSessions(limit = 10): Promise<TraceSession[]> {
  const db = await getOfflineDb();
  const rows = (await db.exec(
    "SELECT * FROM trace_sessions ORDER BY started_at DESC LIMIT ?",
    [limit],
  )) as unknown as TraceSession[];
  return rows;
}

export async function updateTraceSessionStatus(
  id: string,
  status: TraceSession["status"],
  fields: Partial<Pick<TraceSession, "ended_at" | "total_meters" | "server_trace_id" | "pending_contribution_id">> = {},
): Promise<void> {
  const db = await getOfflineDb();
  const sets: string[] = ["status = ?", "updated_at = ?"];
  const params: (string | number | null)[] = [status, new Date().toISOString()];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    params.push(v as string | number | null);
  }
  params.push(id);
  await db.execRaw(`UPDATE trace_sessions SET ${sets.join(", ")} WHERE id = ?`, params);
}

/**
 * Discard a session — soft-delete. The `discarded` status keeps the
 * row out of the "active" query and out of the recent list (the
 * recent list filters by status in (`submitted`)), but preserves
 * audit history.
 */
export async function discardTraceSession(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.execRaw(
    "UPDATE trace_sessions SET status = 'discarded', ended_at = ?, updated_at = ? WHERE id = ?",
    [new Date().toISOString(), new Date().toISOString(), id],
  );
}
