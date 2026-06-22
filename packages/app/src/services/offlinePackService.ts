import { createMagnumClient, type Feature, type Trail } from "@magnum/shared";
import { getOfflineDb } from "../db";
import { useOfflineStore } from "../stores/offlineStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface OfflinePackInfo {
  system_id: string;
  tile_size_bytes: number;
  geojson_size_bytes: number;
  wiki_size_bytes: number;
  total_size_bytes: number;
  generated_at: string | null;
}

export interface PackDownloadData {
  geojson: {
    trails: Array<Trail & { geometry: string | object }>;
    features: Array<Feature & { point: string | object }>;
  } | null;
  wiki: Array<{
    id: string;
    target_type: string;
    target_id: string;
    title: string;
    content_md: string;
  }> | null;
  generated_at: string | null;
}

function computeBounds(geometryJson: string | object | null): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null {
  if (!geometryJson) return null;
  try {
    const g = typeof geometryJson === "string" ? JSON.parse(geometryJson) : geometryJson;
    if (g.type === "MultiLineString" || g.type === "LineString") {
      const coords = g.type === "MultiLineString" ? g.coordinates.flat(1) : g.coordinates;
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const c of coords) {
        if (c[0] < minLon) minLon = c[0];
        if (c[0] > maxLon) maxLon = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
      }
      return { minLon, maxLon, minLat, maxLat };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchPackInfo(systemId: string): Promise<OfflinePackInfo> {
  const client = createMagnumClient(API_URL);
  return client.raw.request<OfflinePackInfo>(
    "GET",
    `/api/offline-packs/${systemId}/info`,
  );
}

export async function downloadSystemPack(systemId: string, systemName: string): Promise<{
  tileSizeBytes: number;
  geojsonSizeBytes: number;
  wikiSizeBytes: number;
  totalSizeBytes: number;
}> {
  const client = createMagnumClient(API_URL);

  await client.raw.request("POST", `/api/offline-packs/generate/${systemId}`);

  const data = await client.raw.request<PackDownloadData>(
    "GET",
    `/api/offline-packs/${systemId}/download`,
  );

  const geojsonStr = JSON.stringify(data.geojson);
  const wikiStr = JSON.stringify(data.wiki);
  const geojsonSizeBytes = geojsonStr.length;
  const wikiSizeBytes = wikiStr.length;

  const db = await getOfflineDb();

  await db.execRaw("DELETE FROM trail_systems WHERE system_id = ?", [systemId]);
  await db.execRaw("DELETE FROM trail_segments WHERE trail_id IN (SELECT id FROM trails)", []);
  await db.execRaw("DELETE FROM trails WHERE id IN (SELECT trail_id FROM trail_systems WHERE system_id = ?)", [systemId]);
  await db.execRaw("DELETE FROM features WHERE system_id = ?", [systemId]);
  await db.execRaw("DELETE FROM wiki_pages WHERE target_type = 'system' AND target_id = ?", [systemId]);
  await db.execRaw("DELETE FROM systems WHERE id = ?", [systemId]);
  await db.execRaw("DELETE FROM downloaded_packs WHERE system_id = ?", [systemId]);

  await db.execRaw(
    `INSERT INTO systems (id, name, slug, description, external_url, min_lon, max_lon, min_lat, max_lat, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, slug=excluded.slug, description=excluded.description,
       external_url=excluded.external_url, min_lon=excluded.min_lon, max_lon=excluded.max_lon,
       min_lat=excluded.min_lat, max_lat=excluded.max_lat, updated_at=excluded.updated_at`,
    [
      systemId,
      systemName,
      systemName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      null,
      null,
      -180, 180, -90, 90,
      new Date().toISOString(),
    ],
  );

  const trails = data.geojson?.trails ?? [];
  for (const trail of trails) {
    const bounds = computeBounds(trail.geometry);
    await db.execRaw(
      `INSERT INTO trails (id, name, slug, description, difficulty, length_meters, elevation_gain_meters, geometry_wkb, min_lon, max_lon, min_lat, max_lat, verified, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, slug=excluded.slug, description=excluded.description,
         difficulty=excluded.difficulty, length_meters=excluded.length_meters,
         elevation_gain_meters=excluded.elevation_gain_meters,
         min_lon=excluded.min_lon, max_lon=excluded.max_lon,
         min_lat=excluded.min_lat, max_lat=excluded.max_lat,
         verified=excluded.verified, updated_at=excluded.updated_at`,
      [
        trail.id,
        trail.name,
        trail.slug,
        trail.description,
        trail.difficulty,
        trail.length_meters,
        trail.elevation_gain_meters,
        null,
        bounds?.minLon ?? -180,
        bounds?.maxLon ?? 180,
        bounds?.minLat ?? -90,
        bounds?.maxLat ?? 90,
        trail.verified ? 1 : 0,
        new Date().toISOString(),
      ],
    );

    await db.execRaw(
      `INSERT OR IGNORE INTO trail_systems (trail_id, system_id) VALUES (?, ?)`,
      [trail.id, systemId],
    );
  }

  const features = data.geojson?.features ?? [];
  for (const feature of features) {
    let lon: number | null = null;
    let lat: number | null = null;
    if (feature.point) {
      try {
        const p = typeof feature.point === "string" ? JSON.parse(feature.point) : feature.point;
        if (p?.coordinates) {
          lon = p.coordinates[0];
          lat = p.coordinates[1];
        }
      } catch {
        // ignore parse error
      }
    }
    await db.execRaw(
      `INSERT INTO features (id, name, type_tag, description, trail_id, system_id, lon, lat, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, type_tag=excluded.type_tag, description=excluded.description,
         trail_id=excluded.trail_id, system_id=excluded.system_id,
         lon=excluded.lon, lat=excluded.lat, updated_at=excluded.updated_at`,
      [
        feature.id,
        feature.name,
        feature.type_tag,
        feature.description,
        feature.trail_id,
        feature.system_id,
        lon,
        lat,
        new Date().toISOString(),
      ],
    );
  }

  const wikiPages = data.wiki ?? [];
  for (const w of wikiPages) {
    await db.execRaw(
      `INSERT INTO wiki_pages (id, target_type, target_id, title, content_md, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_type, target_id) DO UPDATE SET
         title=excluded.title, content_md=excluded.content_md, updated_at=excluded.updated_at`,
      [
        w.id,
        w.target_type,
        w.target_id,
        w.title,
        w.content_md,
        new Date().toISOString(),
      ],
    );
  }

  await db.execRaw(
    `INSERT INTO downloaded_packs (system_id, system_name, tile_size_bytes, geojson_size_bytes, wiki_size_bytes, geojson_data, wiki_data, generated_at, last_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(system_id) DO UPDATE SET
       system_name=excluded.system_name,
       tile_size_bytes=excluded.tile_size_bytes,
       geojson_size_bytes=excluded.geojson_size_bytes,
       wiki_size_bytes=excluded.wiki_size_bytes,
       geojson_data=excluded.geojson_data,
       wiki_data=excluded.wiki_data,
       generated_at=excluded.generated_at,
       last_synced=excluded.last_synced`,
    [
      systemId,
      systemName,
      0,
      geojsonSizeBytes,
      wikiSizeBytes,
      geojsonStr,
      wikiStr,
      data.generated_at,
      new Date().toISOString(),
    ],
  );

  const totalSizeBytes = geojsonSizeBytes + wikiSizeBytes;

  useOfflineStore.getState().addDownloadedPack({
    systemId,
    systemName,
    tileSizeBytes: 0,
    geojsonSizeBytes,
    wikiSizeBytes,
    generatedAt: data.generated_at,
    lastSynced: new Date().toISOString(),
  });

  return {
    tileSizeBytes: 0,
    geojsonSizeBytes,
    wikiSizeBytes,
    totalSizeBytes,
  };
}

export async function loadDownloadedPacksIntoStore() {
  const db = await getOfflineDb();
  const rows = await db.exec(
    "SELECT system_id, system_name, tile_size_bytes, geojson_size_bytes, wiki_size_bytes, generated_at, last_synced FROM downloaded_packs",
  );
  useOfflineStore.getState().setDownloadedPacks(
    rows.map((r) => ({
      systemId: String(r.system_id),
      systemName: String(r.system_name),
      tileSizeBytes: Number(r.tile_size_bytes ?? 0),
      geojsonSizeBytes: Number(r.geojson_size_bytes ?? 0),
      wikiSizeBytes: Number(r.wiki_size_bytes ?? 0),
      generatedAt: r.generated_at ? String(r.generated_at) : null,
      lastSynced: r.last_synced ? String(r.last_synced) : null,
    })),
  );
}
