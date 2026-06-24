import { Hono } from "hono";
import { bboxDownloadRequestSchema } from "@magnum/shared";
import {
  generateBboxPack,
  estimateTileCount,
  buildTar,
  type BboxRequest,
  type TileEntry,
} from "../services/offline-pack.js";

const AVG_TILE_BYTES_SATELLITE = 30000;
const AVG_TILE_BYTES_MVT = 5000;

export const offlineRoute = new Hono();

interface CachedPack {
  entries: TileEntry[];
  dataJson: Buffer;
  tarBuffer: Buffer;
  tileCount: number;
  tileSizeBytes: number;
  geojsonSizeBytes: number;
  wikiSizeBytes: number;
  entityCounts: { systems: number; trails: number; features: number; wikiPages: number };
  createdAt: number;
}

const packs = new Map<string, CachedPack>();
const PACK_EXPIRY_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, pack] of packs) {
    if (now - pack.createdAt > PACK_EXPIRY_MS) {
      packs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

offlineRoute.post("/info", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = bboxDownloadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const bbox = parsed.data as BboxRequest;
  const tileCount = estimateTileCount(bbox);
  const avgBytes =
    bbox.baseLayerId === "satellite" ? AVG_TILE_BYTES_SATELLITE : AVG_TILE_BYTES_MVT;
  const estimatedTileBytes = tileCount * avgBytes;

  return c.json({
    tileCount,
    estimatedTileBytes,
    entityCounts: { systems: 0, trails: 0, features: 0, wikiPages: 0 },
    totalEstimatedBytes: estimatedTileBytes,
  });
});

offlineRoute.post("/generate", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = bboxDownloadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", message: "validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const bbox = parsed.data as BboxRequest;

  try {
    const result = await generateBboxPack(bbox);
    const tarBuffer = buildTar(result.entries);

    packs.set(result.packId, {
      entries: result.entries,
      dataJson: result.dataJson,
      tarBuffer,
      tileCount: result.tileCount,
      tileSizeBytes: result.tileSizeBytes,
      geojsonSizeBytes: result.geojsonSizeBytes,
      wikiSizeBytes: result.wikiSizeBytes,
      entityCounts: result.entityCounts,
      createdAt: Date.now(),
    });

    return c.json({
      packId: result.packId,
      tileCount: result.tileCount,
      tileSizeBytes: result.tileSizeBytes,
      geojsonSizeBytes: result.geojsonSizeBytes,
      wikiSizeBytes: result.wikiSizeBytes,
      totalSizeBytes:
        result.tileSizeBytes + result.geojsonSizeBytes + result.wikiSizeBytes,
      entityCounts: result.entityCounts,
    });
  } catch (e) {
    console.error("generate bbox pack failed:", e);
    return c.json(
      { error: "internal", message: e instanceof Error ? e.message : "failed to generate pack" },
      500,
    );
  }
});

offlineRoute.get("/:packId/download", async (c) => {
  const packId = c.req.param("packId");
  const pack = packs.get(packId);
  if (!pack) {
    return c.json({ error: "not_found", message: "pack not found or expired" }, 404);
  }

  return c.body(new Uint8Array(pack.tarBuffer), 200, {
    "Content-Type": "application/x-tar",
    "Content-Disposition": `attachment; filename="${packId}.tar"`,
  });
});

offlineRoute.get("/:packId/data", async (c) => {
  const packId = c.req.param("packId");
  const pack = packs.get(packId);
  if (!pack) {
    return c.json({ error: "not_found", message: "pack not found or expired" }, 404);
  }

  return c.body(new Uint8Array(pack.dataJson), 200, {
    "Content-Type": "application/json",
  });
});

offlineRoute.get("/:packId/status", async (c) => {
  const packId = c.req.param("packId");
  const pack = packs.get(packId);
  if (!pack) {
    return c.json({ error: "not_found", message: "pack not found or expired" }, 404);
  }

  return c.json({
    packId,
    tileCount: pack.tileCount,
    tileSizeBytes: pack.tileSizeBytes,
    geojsonSizeBytes: pack.geojsonSizeBytes,
    wikiSizeBytes: pack.wikiSizeBytes,
    totalSizeBytes: pack.tileSizeBytes + pack.geojsonSizeBytes + pack.wikiSizeBytes,
    entityCounts: pack.entityCounts,
  });
});
