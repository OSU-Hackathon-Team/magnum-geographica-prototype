import { db } from "../db/index.js";
import { sql, type SQL } from "drizzle-orm";

const MARTIN_URL = process.env.MARTIN_URL ?? "http://localhost:3001";

/**
 * Build a parameterized `IN (...)` clause for a list of UUID strings.
 * Returns `NULL::uuid` when the list is empty (NULL never matches anything,
 * so the surrounding `IN (...)` is a no-op). Avoids the previous crash from
 * `''::uuid` ("invalid input syntax for type uuid") and from raw SQL
 * interpolation of UUID strings.
 */
export function uuidInClause(ids: string[]): SQL {
  if (ids.length === 0) return sql`NULL::uuid`;
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}
const EOX_SENTINEL2_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface BboxRequest {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  baseLayerId: string;
  minZoom: number;
  maxZoom: number;
}

interface TileEntry {
  path: string;
  data: Buffer;
}

export type { TileEntry };

interface BboxPackResult {
  packId: string;
  entries: TileEntry[];
  dataJson: Buffer;
  tileCount: number;
  tileSizeBytes: number;
  geojsonSizeBytes: number;
  wikiSizeBytes: number;
  entityCounts: {
    systems: number;
    trails: number;
    features: number;
    wikiPages: number;
  };
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z),
  );
}

export function enumerateTiles(bbox: BboxRequest): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = bbox.minZoom; z <= bbox.maxZoom; z++) {
    const minX = lonToTileX(bbox.minLon, z);
    const maxX = lonToTileX(bbox.maxLon, z);
    const minY = latToTileY(bbox.maxLat, z);
    const maxY = latToTileY(bbox.minLat, z);
    const maxTiles = 1 << z;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (x >= 0 && x < maxTiles && y >= 0 && y < maxTiles) {
          tiles.push({ z, x, y });
        }
      }
    }
  }
  return tiles;
}

export function estimateTileCount(bbox: BboxRequest): number {
  let count = 0;
  for (let z = bbox.minZoom; z <= bbox.maxZoom; z++) {
    const minX = lonToTileX(bbox.minLon, z);
    const maxX = lonToTileX(bbox.maxLon, z);
    const minY = latToTileY(bbox.maxLat, z);
    const maxY = latToTileY(bbox.minLat, z);
    const maxTiles = 1 << z;
    const cxStart = Math.max(minX, 0);
    const cxEnd = Math.min(maxX, maxTiles - 1);
    const cyStart = Math.max(minY, 0);
    const cyEnd = Math.min(maxY, maxTiles - 1);
    if (cxEnd >= cxStart && cyEnd >= cyStart) {
      count += (cxEnd - cxStart + 1) * (cyEnd - cyStart + 1);
    }
  }
  return count;
}

function getTileUrl(baseLayerId: string, z: number, x: number, y: number): string {
  if (baseLayerId === "satellite") {
    return EOX_SENTINEL2_URL.replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
  }
  return `${MARTIN_URL}/basemap/${z}/${x}/${y}`;
}

function tileFileExtension(baseLayerId: string): string {
  return baseLayerId === "satellite" ? "jpg" : "pbf";
}

async function fetchTile(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

/**
 * Pad an octal-formatted tar numeric field to `width` digits and append a
 * NUL terminator. Tar numeric fields are 7/11/6 octal digits followed by a
 * NUL (or NUL+space for the checksum). We pre-zero-pad so readers that
 * parse with `parseInt(field, 8)` see the intended value.
 *
 * Bug previously: `String(size)` wrote DECIMAL into the size field while
 * the client parsed it as OCTAL, so `parseInt("193647", 8)` returned `1`,
 * misaligning every subsequent header and producing binary garbage as the
 * filename on the client.
 */
function octalField(value: number, width: number): string {
  return value.toString(8).padStart(width, "0") + "\0";
}

function buildTar(entries: TileEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const name = entry.path;
    const size = entry.data.length;
    const header = Buffer.alloc(512); // also fills with 0
    // name[0..100)
    header.write(name, 0, 100, "utf-8");
    // mode[100..108): "0000644\0"
    header.write(octalField(0o644, 7), 100, 8, "utf-8");
    // uid[108..116): "0000000\0"
    header.write(octalField(0, 7), 108, 8, "utf-8");
    // gid[116..124): "0000000\0"
    header.write(octalField(0, 7), 116, 8, "utf-8");
    // size[124..136): "00000000000\0" (11 octal digits + NUL)
    header.write(octalField(size, 11), 124, 12, "utf-8");
    // mtime[136..148): "00000000000\0" (zero epoch = 1970-01-01)
    header.write(octalField(0, 11), 136, 12, "utf-8");
    // typeflag[156]: '0' = regular file
    header.write("0", 156, 1, "utf-8");
    // magic[257..263): "ustar\0"
    header.write("ustar\0", 257, 6, "utf-8");
    // version[263..265): "00"
    header.write("00", 263, 2, "utf-8");

    // chksum[148..156): compute after filling every other field. The checksum
    // bytes themselves are treated as 8 ASCII spaces during computation.
    header.write("        ", 148, 8, "utf-8");
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i]!;
    }
    // "%06o\0 " — 6 octal digits, NUL, space.
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8");

    chunks.push(header, entry.data);
    const padding = (512 - (size % 512)) % 512;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
    }
  }
  // Two zero blocks signal end-of-archive.
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

export async function generateBboxPack(bbox: BboxRequest): Promise<BboxPackResult> {
  const packId = crypto.randomUUID();
  const tiles = enumerateTiles(bbox);
  const ext = tileFileExtension(bbox.baseLayerId);

  const entries: TileEntry[] = [];
  let tileSizeBytes = 0;
  let downloadedCount = 0;
  const maxConcurrent = 8;

  for (let i = 0; i < tiles.length; i += maxConcurrent) {
    const batch = tiles.slice(i, i + maxConcurrent);
    const results = await Promise.all(
      batch.map(async (tile) => {
        const url = getTileUrl(bbox.baseLayerId, tile.z, tile.x, tile.y);
        const data = await fetchTile(url);
        return { tile, data };
      }),
    );
    for (const { tile, data } of results) {
      if (data && data.length > 0) {
        const path = `tiles/${tile.z}/${tile.x}/${tile.y}.${ext}`;
        entries.push({ path, data });
        tileSizeBytes += data.length;
        downloadedCount++;
      }
    }
  }

  const tarBuffer = buildTar(entries);

  const envelopeWkt = `ST_MakeEnvelope(${bbox.minLon}, ${bbox.minLat}, ${bbox.maxLon}, ${bbox.maxLat}, 4326)`;

  const systemRows = await db.execute(
    sql`SELECT id, name, slug, description, ownership_source, external_url,
               ST_AsGeoJSON(boundary) as boundary_geojson
        FROM systems
        WHERE boundary IS NOT NULL
          AND boundary && ${sql.raw(envelopeWkt)}
          AND ST_Intersects(boundary, ${sql.raw(envelopeWkt)})`,
  );

  const systems = systemRows.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    ownership_source: r.ownership_source,
    external_url: r.external_url,
    boundary_geojson: r.boundary_geojson,
  }));

  const trailRows = await db.execute(
    sql`SELECT id, name, slug, description, difficulty, length_meters, elevation_gain_meters, verified,
               ST_AsGeoJSON(geometry) as geometry_geojson
        FROM trails
        WHERE geometry IS NOT NULL
          AND geometry && ${sql.raw(envelopeWkt)}
          AND ST_Intersects(geometry, ${sql.raw(envelopeWkt)})`,
  );

  const trails = trailRows.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    difficulty: r.difficulty,
    length_meters: r.length_meters,
    elevation_gain_meters: r.elevation_gain_meters,
    verified: r.verified,
    geometry_geojson: r.geometry_geojson,
  }));

  const featureRows = await db.execute(
    sql`SELECT id, name, type_tag, description, trail_id, system_id,
               ST_AsGeoJSON(point) as point_geojson
        FROM features
        WHERE point && ${sql.raw(envelopeWkt)}
          AND ST_Within(point, ${sql.raw(envelopeWkt)})`,
  );

  const features = featureRows.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    type_tag: r.type_tag,
    description: r.description,
    trail_id: r.trail_id,
    system_id: r.system_id,
    point_geojson: r.point_geojson,
  }));

  // Build a parameterized `IN (...)` clause for a list of UUIDs.
  // Returns `IN (NULL::uuid)` when the list is empty — NULL never matches
  // anything, so the OR branch becomes a no-op. (Using `''::uuid` here
  // previously crashed with `invalid input syntax for type uuid: ""`.)
  const systemIdList = uuidInClause(systems.map((s) => String(s.id)));
  const trailIdList = uuidInClause(trails.map((t) => String(t.id)));
  const featureIdList = uuidInClause(features.map((f) => String(f.id)));

  let wikiRows: { rows: Record<string, unknown>[] } = { rows: [] };
  if (systems.length > 0 || trails.length > 0 || features.length > 0) {
    wikiRows = await db.execute(
      sql`SELECT id, target_type, target_id, title, content_md
          FROM wiki_pages
          WHERE (target_type = 'system' AND target_id IN (${systemIdList}))
             OR (target_type = 'trail' AND target_id IN (${trailIdList}))
             OR (target_type = 'feature' AND target_id IN (${featureIdList}))`,
    );
  }
  const wikiPages = wikiRows.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    target_type: r.target_type,
    target_id: r.target_id,
    title: r.title,
    content_md: r.content_md,
  }));

  const dataJsonObj = {
    packId,
    bbox: { minLon: bbox.minLon, minLat: bbox.minLat, maxLon: bbox.maxLon, maxLat: bbox.maxLat },
    baseLayerId: bbox.baseLayerId,
    minZoom: bbox.minZoom,
    maxZoom: bbox.maxZoom,
    systems,
    trails,
    features,
    wikiPages,
    tileCount: downloadedCount,
    tileSizeBytes,
    tileFormat: ext,
  };

  const dataJson = Buffer.from(JSON.stringify(dataJsonObj));
  const geojsonSizeBytes = Buffer.byteLength(JSON.stringify({ systems, trails, features }));
  const wikiSizeBytes = Buffer.byteLength(JSON.stringify(wikiPages));

  return {
    packId,
    entries,
    dataJson,
    tileCount: downloadedCount,
    tileSizeBytes,
    geojsonSizeBytes,
    wikiSizeBytes,
    entityCounts: {
      systems: systems.length,
      trails: trails.length,
      features: features.length,
      wikiPages: wikiPages.length,
    },
  };
}

export { buildTar };
