import { createMagnumClient, type OfflineRegion } from "@magnum/shared";
import { getOfflineDb } from "../db";
import { useOfflineStore } from "../stores/offlineStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface BboxInfoResponse {
  tileCount: number;
  estimatedTileBytes: number;
  entityCounts: { systems: number; trails: number; features: number; wikiPages: number };
  totalEstimatedBytes: number;
}

export interface GenerateResponse {
  packId: string;
  tileCount: number;
  tileSizeBytes: number;
  geojsonSizeBytes: number;
  wikiSizeBytes: number;
  totalSizeBytes: number;
  entityCounts: { systems: number; trails: number; features: number; wikiPages: number };
}

export interface PackData {
  packId: string;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  baseLayerId: string;
  minZoom: number;
  maxZoom: number;
  systems: Array<Record<string, unknown>>;
  trails: Array<Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  wikiPages: Array<Record<string, unknown>>;
  tileCount: number;
  tileSizeBytes: number;
  tileFormat: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function extractTar(
  tarBuffer: ArrayBuffer,
  outputDir: string,
  onProgress?: (pct: number) => void,
): Promise<number> {
  const FS = await import("expo-file-system");
  const data = new Uint8Array(tarBuffer);
  let offset = 0;
  let filesWritten = 0;

  while (offset + 512 <= data.length) {
    const header = data.slice(offset, offset + 512);

    if (header.every((b) => b === 0)) {
      const nextHeader = data.slice(offset + 512, offset + 1024);
      if (nextHeader.every((b) => b === 0)) break;
    }

    const name = String.fromCharCode(
      ...header.slice(0, 100).filter((b) => b !== 0),
    ).trim();

    const sizeStr = String.fromCharCode(
      ...header.slice(124, 136).filter((b) => b !== 0),
    ).trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    if (name && size > 0 && !name.endsWith("/")) {
      const fileData = data.slice(offset, offset + size);
      const filePath = `${outputDir}/${name}`;
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
      await FS.makeDirectoryAsync(dirPath, { intermediates: true }).catch(() => {});
      await FS.writeAsStringAsync(filePath, Buffer.from(fileData).toString("base64"), {
        encoding: FS.EncodingType.Base64,
      });
      filesWritten++;
    }

    offset += Math.ceil(size / 512) * 512;
  }

  if (onProgress) onProgress(100);
  return filesWritten;
}

export async function estimateRegionSize(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  baseLayerId: string,
  minZoom: number,
  maxZoom: number,
): Promise<BboxInfoResponse> {
  const client = createMagnumClient(API_URL);
  return client.raw.request<BboxInfoResponse>("POST", "/api/offline-bbox/info", {
    minLon,
    minLat,
    maxLon,
    maxLat,
    baseLayerId,
    minZoom,
    maxZoom,
  });
}

export async function downloadRegion(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  baseLayerId: string,
  minZoom: number,
  maxZoom: number,
  regionName: string,
  onProgress?: (message: string, pct: number) => void,
): Promise<OfflineRegion> {
  const client = createMagnumClient(API_URL);
  const FS = await import("expo-file-system");

  onProgress?.("Generating pack on server...", 5);

  const generateResult = await client.raw.request<GenerateResponse>(
    "POST",
    "/api/offline-bbox/generate",
    { minLon, minLat, maxLon, maxLat, baseLayerId, minZoom, maxZoom },
  );

  onProgress?.("Downloading tiles...", 15);

  const tarResponse = await fetch(
    `${API_URL}/api/offline-bbox/${generateResult.packId}/download`,
  );
  if (!tarResponse.ok) {
    throw new Error(`Failed to download tiles: ${tarResponse.status}`);
  }
  const tarBuffer = await tarResponse.arrayBuffer();

  onProgress?.("Extracting tiles...", 50);

  const regionId = generateResult.packId;
  const tilesDir = `${FS.documentDirectory}magnum-offline/${regionId}/`;
  await FS.makeDirectoryAsync(tilesDir, { intermediates: true });

  const filesWritten = await extractTar(tarBuffer, tilesDir, (pct) => {
    onProgress?.("Extracting tiles...", 50 + Math.floor(pct * 0.3));
  });

  onProgress?.("Downloading data...", 85);

  const dataResponse = await fetch(
    `${API_URL}/api/offline-bbox/${generateResult.packId}/data`,
  );
  const packData: PackData = await dataResponse.json();

  const geojsonStr = JSON.stringify({
    systems: packData.systems,
    trails: packData.trails,
    features: packData.features,
  });
  const wikiStr = JSON.stringify(packData.wikiPages);

  onProgress?.("Storing data...", 90);

  const db = await getOfflineDb();
  const now = new Date().toISOString();

  for (const s of packData.systems) {
    await db.execRaw(
      `INSERT INTO systems (id, name, slug, description, min_lon, max_lon, min_lat, max_lat, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, slug=excluded.slug, description=excluded.description,
         min_lon=excluded.min_lon, max_lon=excluded.max_lon,
         min_lat=excluded.min_lat, max_lat=excluded.max_lat,
         updated_at=excluded.updated_at`,
      [s.id, s.name, s.slug, s.description, bbox.minLon, bbox.maxLon, bbox.minLat, bbox.maxLat, now],
    );
  }

  for (const t of packData.trails) {
    const geometryStr =
      typeof t.geometry_geojson === "string" ? t.geometry_geojson : JSON.stringify(t.geometry_geojson);
    let bounds = computeBounds(geometryStr);
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
        t.id, t.name, t.slug, t.description, t.difficulty, t.length_meters,
        t.elevation_gain_meters, null,
        bounds?.minLon ?? bbox.minLon, bounds?.maxLon ?? bbox.maxLon,
        bounds?.minLat ?? bbox.minLat, bounds?.maxLat ?? bbox.maxLat,
        t.verified ? 1 : 0, now,
      ],
    );
  }

  for (const f of packData.features) {
    const pointStr =
      typeof f.point_geojson === "string" ? f.point_geojson : JSON.stringify(f.point_geojson);
    let lon: number | null = null;
    let lat: number | null = null;
    try {
      const p = JSON.parse(pointStr);
      if (p?.coordinates) {
        lon = p.coordinates[0];
        lat = p.coordinates[1];
      }
    } catch { /* ignore */ }
    await db.execRaw(
      `INSERT INTO features (id, name, type_tag, description, trail_id, system_id, lon, lat, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, type_tag=excluded.type_tag, description=excluded.description,
         trail_id=excluded.trail_id, system_id=excluded.system_id,
         lon=excluded.lon, lat=excluded.lat, updated_at=excluded.updated_at`,
      [f.id, f.name, f.type_tag, f.description, f.trail_id, f.system_id, lon, lat, now],
    );
  }

  for (const w of packData.wikiPages) {
    await db.execRaw(
      `INSERT INTO wiki_pages (id, target_type, target_id, title, content_md, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_type, target_id) DO UPDATE SET
         title=excluded.title, content_md=excluded.content_md, updated_at=excluded.updated_at`,
      [w.id, w.target_type, w.target_id, w.title, w.content_md, now],
    );
  }

  const tilesPath = `${FS.documentDirectory}magnum-offline/${regionId}/tiles`;

  await db.execRaw(
    `INSERT INTO offline_regions (id, name, base_layer_id, min_lon, min_lat, max_lon, max_lat, min_zoom, max_zoom, total_tiles, tile_size_bytes, geojson_size_bytes, wiki_size_bytes, tiles_path, generated_at, last_synced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, base_layer_id=excluded.base_layer_id,
       min_lon=excluded.min_lon, min_lat=excluded.min_lat,
       max_lon=excluded.max_lon, max_lat=excluded.max_lat,
       min_zoom=excluded.min_zoom, max_zoom=excluded.max_zoom,
       total_tiles=excluded.total_tiles, tile_size_bytes=excluded.tile_size_bytes,
       geojson_size_bytes=excluded.geojson_size_bytes, wiki_size_bytes=excluded.wiki_size_bytes,
       tiles_path=excluded.tiles_path, generated_at=excluded.generated_at,
       last_synced=excluded.last_synced, created_at=excluded.created_at`,
    [
      regionId, regionName, baseLayerId,
      minLon, minLat, maxLon, maxLat,
      minZoom, maxZoom,
      generateResult.tileCount, generateResult.tileSizeBytes,
      Buffer.byteLength(geojsonStr), Buffer.byteLength(wikiStr),
      tilesPath, now, now, now,
    ],
  );

  const region: OfflineRegion = {
    id: regionId,
    name: regionName,
    baseLayerId,
    minLon, minLat, maxLon, maxLat,
    minZoom, maxZoom,
    totalTiles: generateResult.tileCount,
    tileSizeBytes: generateResult.tileSizeBytes,
    geojsonSizeBytes: Buffer.byteLength(geojsonStr),
    wikiSizeBytes: Buffer.byteLength(wikiStr),
    tilesPath,
    generatedAt: now,
    lastSynced: now,
    createdAt: now,
  };

  useOfflineStore.getState().addOfflineRegion(region);
  onProgress?.("Complete", 100);
  return region;
}

export async function loadOfflineRegionsIntoStore() {
  const db = await getOfflineDb();
  const rows = await db.exec(
    "SELECT id, name, base_layer_id, min_lon, min_lat, max_lon, max_lat, min_zoom, max_zoom, total_tiles, tile_size_bytes, geojson_size_bytes, wiki_size_bytes, tiles_path, generated_at, last_synced, created_at FROM offline_regions",
  );
  const regions: OfflineRegion[] = rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    baseLayerId: String(r.base_layer_id),
    minLon: Number(r.min_lon),
    minLat: Number(r.min_lat),
    maxLon: Number(r.max_lon),
    maxLat: Number(r.max_lat),
    minZoom: Number(r.min_zoom),
    maxZoom: Number(r.max_zoom),
    totalTiles: Number(r.total_tiles ?? 0),
    tileSizeBytes: Number(r.tile_size_bytes ?? 0),
    geojsonSizeBytes: Number(r.geojson_size_bytes ?? 0),
    wikiSizeBytes: Number(r.wiki_size_bytes ?? 0),
    tilesPath: r.tiles_path ? String(r.tiles_path) : null,
    generatedAt: r.generated_at ? String(r.generated_at) : null,
    lastSynced: r.last_synced ? String(r.last_synced) : null,
    createdAt: String(r.created_at ?? ""),
  }));
  useOfflineStore.getState().setOfflineRegions(regions);
}

export async function deleteOfflineRegion(regionId: string) {
  const db = await getOfflineDb();
  const rows = await db.exec("SELECT tiles_path FROM offline_regions WHERE id = ?", [regionId]);
  const tilesPath = rows[0]?.tiles_path;

  if (tilesPath && typeof tilesPath === "string") {
    try {
      const FS = await import("expo-file-system");
      await FS.deleteAsync(tilesPath, { idempotent: true });
      const parentDir = tilesPath.substring(0, tilesPath.lastIndexOf("/"));
      await FS.deleteAsync(parentDir, { idempotent: true });
    } catch { /* ignore */ }
  }

  await db.execRaw("DELETE FROM offline_regions WHERE id = ?", [regionId]);
  useOfflineStore.getState().removeOfflineRegion(regionId);
}

function computeBounds(geometryJson: string | object | null): {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} | null {
  if (!geometryJson) return null;
  try {
    const g = typeof geometryJson === "string" ? JSON.parse(geometryJson) : geometryJson;
    if (g.type === "MultiLineString" || g.type === "LineString") {
      const coords =
        g.type === "MultiLineString" ? g.coordinates.flat(1) : g.coordinates;
      let minLon = Infinity,
        maxLon = -Infinity,
        minLat = Infinity,
        maxLat = -Infinity;
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

export { formatBytes };
