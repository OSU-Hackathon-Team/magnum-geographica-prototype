/**
 * Heatmap regeneration service.
 *
 * The `trace_heatmap` table stores tile-level trace density at zoom 14.
 * Lower zoom levels (5-13) aggregate up from the zoom-14 base.
 *
 * Regeneration strategy:
 *   1. Truncate the table.
 *   2. Populate zoom 14 by mapping each trace's bounding box to tiles
 *      and inserting one row per tile. Uses PostGIS ST_Envelope for
 *      fast bbox → tile coordinate mapping.
 *   3. Populate zooms 5-13 by aggregating from zoom 14 (divide tile
 *      coordinates by 2 at each step).
 *
 * Steps 2 and 3 run sequentially because step 3 depends on step 2.
 * Within step 3 the individual zoom levels could run in parallel,
 * but each is a simple GROUP BY on the previous level so they are
 * trivially fast.
 */
import { sql } from "drizzle-orm";
import type { Database } from "../db/index.js";

const BASE_ZOOM = 14;
const MIN_ZOOM = 5;

export interface RegenerateResult {
  cellsInserted: number;
  durationMs: number;
}

export async function regenerateHeatmap(database: Database): Promise<RegenerateResult> {
  const startedAt = Date.now();

  try {
    // 1. Clear existing heatmap data.
    await database.execute(sql`TRUNCATE TABLE trace_heatmap`);

    // 2. Populate zoom 14 from active traces.
    //    For each trace we project its geometry to Web Mercator (EPSG:3857),
    //    compute the bounding box in projected coordinates, then convert
    //    each corner of the bbox to tile coordinates at zoom 14 using the
    //    standard web mercator formula. This ensures the tile coordinates
    //    match what the Martin tile function returns via ST_TileEnvelope.
    await database.execute(sql`
      INSERT INTO trace_heatmap (zoom, tile_x, tile_y, trace_count, updated_at)
      WITH trace_proj AS (
        SELECT
          t.id,
          ST_XMin(ST_Transform(t.geometry, 3857)) AS px_min,
          ST_XMax(ST_Transform(t.geometry, 3857)) AS px_max,
          ST_YMin(ST_Transform(t.geometry, 3857)) AS py_min,
          ST_YMax(ST_Transform(t.geometry, 3857)) AS py_max
        FROM gps_traces t
        WHERE t.status != 'removed' AND t.geometry IS NOT NULL
      ),
      trace_tiles AS (
        SELECT
          id,
          -- Web mercator tile x: floor((px + 20037508.34) / 40075016.68 * 2^z)
          FLOOR((px_min + 20037508.342789244) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS tx_min,
          FLOOR((px_max + 20037508.342789244) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS tx_max,
          -- Web mercator tile y: floor((20037508.34 - py) / 40075016.68 * 2^z)
          FLOOR((20037508.342789244 - py_max) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS ty_min,
          FLOOR((20037508.342789244 - py_min) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS ty_max
        FROM trace_proj
      ),
      expanded AS (
        SELECT DISTINCT
          ${sql.raw(String(BASE_ZOOM))}::integer AS zoom,
          tx::integer AS tile_x,
          ty::integer AS tile_y
        FROM trace_tiles,
          generate_series(tx_min, tx_max) AS tx,
          generate_series(ty_min, ty_max) AS ty
      )
      SELECT zoom, tile_x, tile_y, COUNT(*)::integer, now()
      FROM expanded
      GROUP BY zoom, tile_x, tile_y
    `);

    // 3. Aggregate up to lower zooms.
    for (let z = BASE_ZOOM - 1; z >= MIN_ZOOM; z--) {
      await database.execute(sql`
        INSERT INTO trace_heatmap (zoom, tile_x, tile_y, trace_count, updated_at)
        SELECT
          ${sql.raw(String(z))}::integer,
          FLOOR(tile_x / 2.0)::integer,
          FLOOR(tile_y / 2.0)::integer,
          SUM(trace_count)::integer,
          now()
        FROM trace_heatmap
        WHERE zoom = ${sql.raw(String(z + 1))}
        GROUP BY 1, 2, 3
      `);
    }

    const countRows = await database.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM trace_heatmap`,
    );
    const count = countRows.rows[0]?.count ?? "0";

    return {
      cellsInserted: parseInt(count, 10),
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    throw err;
  }
}

export async function incrementHeatmapTile(
  database: Database,
  traceId: string,
  delta: number,
): Promise<void> {
  // Incrementally update the heatmap for a single trace at zoom 14.
  // Called on trace create (+1) and trace status change (e.g., -1 on remove).
  await database.execute(sql`
    INSERT INTO trace_heatmap (zoom, tile_x, tile_y, trace_count, updated_at)
    WITH tiles AS (
      SELECT
        ${sql.raw(String(BASE_ZOOM))}::integer AS zoom,
        tx::integer AS tile_x,
        ty::integer AS tile_y
      FROM (
        SELECT
          FLOOR((ST_XMin(ST_Transform(t.geometry, 3857)) + 20037508.342789244) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS tx_min,
          FLOOR((ST_XMax(ST_Transform(t.geometry, 3857)) + 20037508.342789244) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS tx_max,
          FLOOR((20037508.342789244 - ST_YMax(ST_Transform(t.geometry, 3857))) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS ty_min,
          FLOOR((20037508.342789244 - ST_YMin(ST_Transform(t.geometry, 3857))) / 40075016.685578488 * ${sql.raw(String(2 ** BASE_ZOOM))})::integer AS ty_max
        FROM gps_traces t
        WHERE t.id = ${sql.raw(String(traceId))} AND t.geometry IS NOT NULL
      ) bounds,
      generate_series(tx_min, tx_max) AS tx,
      generate_series(ty_min, ty_max) AS ty
    )
    SELECT zoom, tile_x, tile_y, ${sql.raw(String(delta))}::integer, now()
    FROM tiles
    ON CONFLICT (zoom, tile_x, tile_y)
    DO UPDATE SET
      trace_count = GREATEST(trace_heatmap.trace_count + ${sql.raw(String(delta))}, 0),
      updated_at = now()
  `);
}
