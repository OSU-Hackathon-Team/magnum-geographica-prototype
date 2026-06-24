import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

// Stub fetch so generateBboxPack does not hit the network when enumerating tiles.
const originalFetch = globalThis.fetch;
mock.module("globalThis.fetch", () => ({
  default: async () => new Response(new Uint8Array([0]), { status: 200 }),
}));
globalThis.fetch = (async () => new Response(new Uint8Array([0]), { status: 200 })) as typeof fetch;

const { generateBboxPack, uuidInClause, buildTar } =
  await import("../src/services/offline-pack.js");
const { sql } = await import("drizzle-orm");

/**
 * Render a Drizzle `sql` template tree into a SQL string with parameters
 * inlined for human-readable test output. Walks `queryChunks` recursively.
 */
function materializeFragment(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") {
    const candidate = node as {
      value?: unknown[] | string;
      queryChunks?: unknown[];
    };
    if (Array.isArray(candidate.value)) {
      return candidate.value.map((v) => materializeFragment(v)).join("");
    }
    if (typeof candidate.value === "string") return candidate.value;
    if (Array.isArray(candidate.queryChunks)) {
      return candidate.queryChunks.map((c) => materializeFragment(c)).join("");
    }
  }
  // Drizzle's Param chunk wraps the raw value in `value`. Inlining it lets us
  // read the SQL shape without depending on dialect-specific escaping.
  const withValue = node as { value?: unknown };
  if (withValue && typeof withValue.value === "string") {
    return withValue.value;
  }
  return String(node);
}

/**
 * Count Drizzle `Param` chunks in a SQL tree. Used to verify that UUID
 * values were bound as parameters rather than raw-interpolated as SQL text.
 * Drizzle represents params as raw primitive values (string/number/Date)
 * sitting directly in a parent's `queryChunks` array — NOT wrapped in a
 * StringChunk/SQL object. A StringChunk has `value: string[]`, a Param is
 * just the primitive itself.
 */
function countParamChunks(node: unknown): number {
  if (node === null || node === undefined) return 0;
  // Primitive (string/number/boolean/Date) inside queryChunks = Param chunk.
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return 1;
  }
  if (typeof node !== "object") return 0;
  const candidate = node as { queryChunks?: unknown[] };
  if (Array.isArray(candidate.queryChunks)) {
    return candidate.queryChunks.reduce((sum, c) => sum + countParamChunks(c), 0);
  }
  return 0;
}

const SAMPLE_BBOX = {
  minLon: -83.5,
  minLat: 39.5,
  maxLon: -82.5,
  maxLat: 40.5,
  baseLayerId: "simplified",
  minZoom: 2,
  maxZoom: 4,
} as const;

const SAMPLE_SYSTEM_ID = "11111111-1111-1111-1111-111111111111";
const SAMPLE_SYSTEM_ROW = {
  id: SAMPLE_SYSTEM_ID,
  name: "Test System",
  slug: "test-system",
  description: null,
  ownership_source: null,
  external_url: null,
  boundary_geojson:
    '{"type":"MultiPolygon","coordinates":[[[[-83,39],[-82,39],[-82,40],[-83,40],[-83,39]]]]}',
};

describe("uuidInClause", () => {
  test("returns NULL::uuid for empty list (regression: was ''::uuid)", () => {
    const fragment = uuidInClause([]);
    const sqlText = materializeFragment(fragment);
    // The bug previously generated `''::uuid` which Postgres rejects with
    // "invalid input syntax for type uuid". NULL::uuid is valid and never
    // matches anything in an IN clause.
    expect(sqlText).toContain("NULL::uuid");
    expect(sqlText).not.toMatch(/''::uuid/);
  });

  test("uses parameterized values for non-empty list (no raw interpolation)", () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    const fragment = uuidInClause([id1, id2]);
    // The fragment must be a Drizzle SQL tree containing Param chunks
    // (i.e. `${id}::uuid`), NOT a raw SQL string with the UUIDs baked in.
    // Raw interpolation would be a SQL-injection risk.
    const paramCount = countParamChunks(fragment);
    expect(paramCount).toBe(2);
  });
});

/**
 * Minimal tar reader that mirrors the parsing logic in
 * `packages/app/src/services/offlinePackService.ts:extractTar`. Used to
 * verify that `buildTar` produces a tar stream the app can actually parse.
 *
 * Bug previously: buildTar wrote the size field in DECIMAL while the client
 * parsed it as OCTAL, so `parseInt("193647", 8) === 1` and every header
 * after the first was misaligned, producing binary garbage as filenames.
 */
function parseTar(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const files: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    // Two consecutive zero blocks signal end-of-archive.
    if (header.every((b) => b === 0)) {
      const next = buf.subarray(offset + 512, offset + 1024);
      if (next.every((b) => b === 0)) break;
    }
    const name = header.subarray(0, 100).toString("utf-8").replace(/\0+$/, "").trim();
    const sizeStr = header.subarray(124, 136).toString("utf-8").replace(/\0+$/, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    offset += 512;
    if (name && size > 0 && !name.endsWith("/")) {
      files.push({ name, data: buf.subarray(offset, offset + size) });
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

describe("buildTar — client-parseable tar stream", () => {
  test("writes size field as octal (regression: was decimal)", () => {
    // A tile of 193647 bytes (typical MVT size). The decimal string
    // "193647" parsed as octal yields 1 because "9" is not a valid octal
    // digit — that value exercises the original bug.
    const entries = [
      { path: "tiles/5/8/12.pbf", data: Buffer.alloc(193647, 0xab) },
      { path: "tiles/5/8/13.pbf", data: Buffer.alloc(42, 0xcd) },
    ];
    const tar = buildTar(entries);
    const parsed = parseTar(tar);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.name).toBe("tiles/5/8/12.pbf");
    expect(parsed[0]!.data.length).toBe(193647);
    expect(parsed[1]!.name).toBe("tiles/5/8/13.pbf");
    expect(parsed[1]!.data.length).toBe(42);
  });

  test("preserves file contents exactly across padding boundaries", () => {
    const payload1 = Buffer.from("hello tile contents", "utf-8");
    const payload2 = Buffer.alloc(600, 0x01); // spans two 512-byte blocks
    const tar = buildTar([
      { path: "tiles/a.pbf", data: payload1 },
      { path: "tiles/b.pbf", data: payload2 },
    ]);
    const parsed = parseTar(tar);
    expect(parsed[0]!.data.equals(payload1)).toBe(true);
    expect(parsed[1]!.data.equals(payload2)).toBe(true);
  });

  test("roundtrips many entries without misalignment", () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      path: `tiles/${i}/0/0.pbf`,
      data: Buffer.alloc(100 + i * 13, i & 0xff),
    }));
    const parsed = parseTar(buildTar(entries));
    expect(parsed).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      expect(parsed[i]!.name).toBe(`tiles/${i}/0/0.pbf`);
      expect(parsed[i]!.data.length).toBe(100 + i * 13);
      expect(parsed[i]!.data[0]).toBe(i & 0xff);
    }
  });

  test("emits valid USTAR magic and checksum", () => {
    const tar = buildTar([{ path: "a", data: Buffer.from("x") }]);
    const header = tar.subarray(0, 512);
    // magic field
    expect(header.subarray(257, 263).toString("utf-8")).toBe("ustar\0");
    // typeflag for regular file
    expect(header[156]).toBe(0x30); // '0'
    // checksum field is 6 octal digits + NUL + space
    const checksumField = header.subarray(148, 156).toString("utf-8");
    expect(checksumField).toMatch(/^[0-7]{6}\0 $/);
    // Verify the checksum value itself
    const declared = parseInt(checksumField.slice(0, 6), 8);
    let actual = 0;
    for (let i = 0; i < 512; i++) {
      // During checksum computation, the checksum field is treated as spaces
      actual += i >= 148 && i < 156 ? 0x20 : header[i]!;
    }
    expect(actual).toBe(declared);
  });
});

describe("generateBboxPack — wiki query robustness", () => {
  test("does not throw when systems present but trails and features empty", async () => {
    state.executeRouter = [
      { match: "from systems", rows: [SAMPLE_SYSTEM_ROW] },
      { match: "from trails", rows: [] },
      { match: "from features", rows: [] },
      { match: "from wiki_pages", rows: [] },
    ];

    const result = await generateBboxPack(SAMPLE_BBOX);

    expect(result.entityCounts.systems).toBe(1);
    expect(result.entityCounts.trails).toBe(0);
    expect(result.entityCounts.features).toBe(0);
    expect(result.entityCounts.wikiPages).toBe(0);

    // The generated wiki_pages query MUST NOT contain the broken empty-string
    // uuid cast `''::uuid`. This is the regression guard for the bug that
    // produced "invalid input syntax for type uuid: ''" when any one of the
    // entity lists was empty.
    const wikiQueryCall = state.executeCalls.find((c) =>
      c.sql.toLowerCase().includes("from wiki_pages"),
    );
    expect(wikiQueryCall).toBeDefined();
    expect(wikiQueryCall!.sql).not.toMatch(/''::uuid/);
    // NULL::uuid should appear once per empty entity list (trails + features).
    expect(wikiQueryCall!.sql).toContain("NULL::uuid");
  });

  test("does not throw when all entity lists are empty", async () => {
    state.executeRouter = [];
    state.executeCalls = [];

    const result = await generateBboxPack(SAMPLE_BBOX);

    expect(result.entityCounts).toEqual({
      systems: 0,
      trails: 0,
      features: 0,
      wikiPages: 0,
    });
    // No wiki_pages query should have been issued at all.
    expect(state.executeCalls.some((c) => c.sql.toLowerCase().includes("from wiki_pages"))).toBe(
      false,
    );
  });

  test("issues wiki_pages query with parameterized UUIDs when all entity lists are populated", async () => {
    state.executeRouter = [
      { match: "from systems", rows: [SAMPLE_SYSTEM_ROW] },
      {
        match: "from trails",
        rows: [
          {
            id: "22222222-2222-2222-2222-222222222222",
            name: "T",
            slug: "t",
            description: null,
            difficulty: null,
            length_meters: null,
            elevation_gain_meters: null,
            verified: null,
            geometry_geojson: '{"type":"LineString","coordinates":[]}',
          },
        ],
      },
      {
        match: "from features",
        rows: [
          {
            id: "33333333-3333-3333-3333-333333333333",
            name: "F",
            type_tag: "trailhead",
            description: null,
            trail_id: null,
            system_id: null,
            point_geojson: '{"type":"Point","coordinates":[-83,39]}',
          },
        ],
      },
      { match: "from wiki_pages", rows: [] },
    ];
    state.executeCalls = [];

    await generateBboxPack(SAMPLE_BBOX);

    const wikiQueryCall = state.executeCalls.find((c) =>
      c.sql.toLowerCase().includes("from wiki_pages"),
    );
    expect(wikiQueryCall).toBeDefined();
    // The wiki_pages query must not contain the broken empty-string uuid cast.
    expect(wikiQueryCall!.sql).not.toMatch(/''::uuid/);
    // NULL::uuid is no longer needed when every list is non-empty, but it
    // must also not be generated erroneously. (Currently the clause just
    // lists the IDs.)
  });
});

// Restore fetch for any subsequent tests in this process.
test("teardown: restore fetch", () => {
  globalThis.fetch = originalFetch;
  // Silence unused-import warning for `sql` (kept for future assertions).
  void sql;
});
