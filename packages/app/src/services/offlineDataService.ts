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
  return db.exec("SELECT system_id, system_name, tile_size_bytes, geojson_size_bytes, wiki_size_bytes, generated_at, last_synced FROM downloaded_packs");
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
  const rows = await db.exec(
    "SELECT * FROM wiki_pages WHERE target_type = ? AND target_id = ?",
    [targetType, targetId],
  );
  return rows[0] ?? null;
}

export async function getWikiRevisions(wikiPageId: string) {
  const db = await getOfflineDb();
  return db.exec(
    "SELECT * FROM revisions WHERE wiki_page_id = ? ORDER BY created_at DESC",
    [wikiPageId],
  );
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
  await db.execRaw("DELETE FROM trail_segments WHERE trail_id IN (SELECT id FROM trails WHERE id IN (SELECT trail_id FROM trail_systems))");
  await db.execRaw("DELETE FROM trails WHERE id IN (SELECT trail_id FROM trail_systems WHERE system_id = ?)", [systemId]);
  await db.execRaw("DELETE FROM features WHERE system_id = ?", [systemId]);
  await db.execRaw("DELETE FROM wiki_pages WHERE target_type = 'system' AND target_id = ?", [systemId]);
  await db.execRaw("DELETE FROM systems WHERE id = ?", [systemId]);
  await db.execRaw("DELETE FROM downloaded_packs WHERE system_id = ?", [systemId]);
}

export async function getTotalDownloadedSize(): Promise<number> {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT COALESCE(SUM(tile_size_bytes + geojson_size_bytes + wiki_size_bytes), 0) as total FROM downloaded_packs");
  return Number(rows[0]?.total ?? 0);
}

export async function addPendingContribution(
  entityType: string,
  action: string,
  payload: unknown,
  contributorName: string,
  entityId?: string,
) {
  const db = await getOfflineDb();
  await db.execRaw(
    `INSERT INTO pending_contributions (entity_type, entity_id, action, payload, contributor_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entityType, entityId ?? null, action, JSON.stringify(payload), contributorName, new Date().toISOString()],
  );
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
  return rows.map((r): PendingContributionRow => ({
    id: Number(r.id),
    entity_type: String(r.entity_type ?? ""),
    entity_id: r.entity_id ? String(r.entity_id) : null,
    action: String(r.action ?? ""),
    payload: JSON.parse(String(r.payload)),
    contributor_name: String(r.contributor_name ?? "anonymous"),
    created_at: String(r.created_at ?? ""),
    sync_status: String(r.sync_status ?? "pending"),
  }));
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
  const rows = await db.exec("SELECT COUNT(*) as cnt FROM pending_contributions WHERE sync_status = 'pending'");
  return Number(rows[0]?.cnt ?? 0);
}

export interface OfflineMapData {
  trails: unknown;
  systems: unknown;
  features: unknown;
}

export async function loadOfflineMapData(systemId: string): Promise<OfflineMapData | null> {
  const db = await getOfflineDb();
  const packs = await db.exec(
    "SELECT geojson_data, wiki_data FROM downloaded_packs WHERE system_id = ?",
    [systemId],
  );
  if (packs.length === 0) return null;

  const raw = packs[0]?.geojson_data;
  if (!raw) return null;

  let parsed: { trails?: unknown[]; features?: unknown[] };
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }

  const trails = parsed.trails ?? [];
  const features = parsed.features ?? [];

  const trailFeatures = trails.map((t: Record<string, unknown>) => {
    let geometry = t.geometry;
    try {
      if (typeof geometry === "string") geometry = JSON.parse(geometry as string);
    } catch { geometry = null; }
    return {
      type: "Feature",
      id: t.id,
      geometry,
      properties: {
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        difficulty: t.difficulty,
        surface_type: t.surface_type,
        is_road_connector: t.is_road_connector,
        is_verified: t.is_verified,
      },
    };
  });

  const featurePoints = features.map((f: Record<string, unknown>) => {
    let point = f.point;
    try {
      if (typeof point === "string") point = JSON.parse(point as string);
    } catch { point = null; }
    return {
      type: "Feature",
      id: f.id,
      geometry: point,
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

  return {
    trails: { type: "FeatureCollection", features: trailFeatures },
    systems: { type: "FeatureCollection", features: [] },
    features: { type: "FeatureCollection", features: featurePoints },
  };
}

export async function getDownloadedSystemIds(): Promise<string[]> {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT system_id FROM downloaded_packs");
  return rows.map((r) => String(r.system_id));
}
