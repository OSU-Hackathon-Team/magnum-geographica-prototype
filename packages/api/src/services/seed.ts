import { sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  systems,
  superSystems,
  systemSuperSystems,
  trails,
  trailSystems,
  trailSegments,
  features,
  wikiPages,
  gpsTraces,
  traceSystems,
  gpsTraceSegments,
} from "../db/schema.js";

const SUPER_SYSTEM_BOUNDARY =
  "MULTIPOLYGON(((-84.9 38.3, -80.4 38.3, -80.4 42.1, -84.9 42.1, -84.9 38.3)))";

const OHIO_SYSTEMS: ReadonlyArray<{
  name: string;
  slug: string;
  description: string;
  externalUrl: string;
  color: string;
  boundary: string;
  lon: number;
  lat: number;
}> = [
  {
    name: "Hocking Hills State Park",
    slug: "hocking-hills-state-park",
    description: "A state park in southeastern Ohio known for its rugged terrain and gorges.",
    externalUrl: "https://ohiodnr.gov/go-and-do/places-to-go/state-parks/hocking-hills",
    color: "#22c55e",
    boundary:
      "MULTIPOLYGON(((-82.65 39.38, -82.40 39.38, -82.40 39.52, -82.65 39.52, -82.65 39.38)))",
    lon: -82.5318,
    lat: 39.4465,
  },
  {
    name: "Cuyahoga Valley National Park",
    slug: "cuyahoga-valley-national-park",
    description:
      "A national park between Cleveland and Akron with the Ohio & Erie Canal Towpath Trail.",
    externalUrl: "https://www.nps.gov/cuva/",
    color: "#3b82f6",
    boundary:
      "MULTIPOLYGON(((-81.70 41.17, -81.40 41.17, -81.40 41.32, -81.70 41.32, -81.70 41.17)))",
    lon: -81.55,
    lat: 41.24,
  },
  {
    name: "Wayne National Forest",
    slug: "wayne-national-forest",
    description: "Ohio's only national forest, covering parts of southeastern Ohio.",
    externalUrl: "https://www.fs.usda.gov/wayne",
    color: "#f97316",
    boundary:
      "MULTIPOLYGON(((-82.56 39.38, -82.31 39.38, -82.31 39.52, -82.56 39.52, -82.56 39.38)))",
    lon: -82.45,
    lat: 39.45,
  },
];

const OHIO_TRAILS: ReadonlyArray<{
  name: string;
  slug: string;
  description: string;
  difficulty: "easy" | "moderate" | "hard" | "expert";
  lengthMeters: number;
  elevationGainMeters: number;
  geometry: string;
  systemIdx: number;
}> = [
  {
    name: "Buckeye Trail",
    slug: "buckeye-trail",
    description: "A 1,444-mile loop that encircles Ohio, passing through diverse landscapes.",
    difficulty: "moderate",
    lengthMeters: 2_324_200,
    elevationGainMeters: 8500,
    geometry:
      "MULTILINESTRING((-82.54 39.44, -82.52 39.46, -82.49 39.47, -82.46 39.48, -82.43 39.47, -82.40 39.45))",
    systemIdx: 0,
  },
  {
    name: "Ohio Erie Trail",
    slug: "ohio-erie-trail",
    description: "Spans northern Ohio, part of the larger Ohio to Erie Trail network.",
    difficulty: "easy",
    lengthMeters: 532_000,
    elevationGainMeters: 1200,
    geometry:
      "MULTILINESTRING((-81.58 41.22, -81.56 41.24, -81.54 41.25, -81.52 41.26, -81.50 41.25, -81.48 41.23))",
    systemIdx: 1,
  },
  {
    name: "Little Miami Scenic Trail",
    slug: "little-miami-scenic-trail",
    description: "Paved rail-trail along the Little Miami River.",
    difficulty: "easy",
    lengthMeters: 102_000,
    elevationGainMeters: 320,
    geometry:
      "MULTILINESTRING((-82.47 39.45, -82.44 39.46, -82.41 39.47, -82.38 39.48, -82.35 39.49))",
    systemIdx: 2,
  },
  {
    name: "Hocking Hills Indian Run",
    slug: "hocking-hills-indian-run",
    description: "A scenic loop through Ohio's Hocking Hills region.",
    difficulty: "moderate",
    lengthMeters: 6_400,
    elevationGainMeters: 180,
    geometry:
      "MULTILINESTRING((-82.54 39.43, -82.52 39.45, -82.50 39.47, -82.48 39.49, -82.50 39.47, -82.52 39.45, -82.54 39.43))",
    systemIdx: 0,
  },
  {
    name: "Towpath Trail",
    slug: "towpath-trail",
    description: "Follows the historic Ohio & Erie Canal through Cuyahoga Valley.",
    difficulty: "easy",
    lengthMeters: 154_500,
    elevationGainMeters: 200,
    geometry:
      "MULTILINESTRING((-81.60 41.20, -81.58 41.22, -81.56 41.24, -81.54 41.26, -81.52 41.28, -81.49 41.29))",
    systemIdx: 1,
  },
];

const OHIO_FEATURES: ReadonlyArray<{
  name: string;
  typeTag: string;
  systemIdx: number;
  description?: string;
  lon: number;
  lat: number;
}> = [
  {
    name: "Old Man's Cave",
    typeTag: "scenic_point",
    systemIdx: 0,
    description: "Recessed gorge with waterfall.",
    lon: -82.541,
    lat: 39.44,
  },
  { name: "Ash Cave Trailhead", typeTag: "trailhead", systemIdx: 0, lon: -82.545, lat: 39.448 },
  {
    name: "Cedar Falls Overlook",
    typeTag: "scenic_point",
    systemIdx: 0,
    lon: -82.535,
    lat: 39.455,
  },
  { name: "Ledges Overlook", typeTag: "scenic_point", systemIdx: 1, lon: -81.56, lat: 41.245 },
  {
    name: "Boston Mill Visitor Center",
    typeTag: "trailhead",
    systemIdx: 1,
    lon: -81.555,
    lat: 41.25,
  },
  { name: "Blue Hen Falls", typeTag: "water_source", systemIdx: 1, lon: -81.54, lat: 41.23 },
  { name: "Pine Hollow Parking", typeTag: "parking", systemIdx: 2, lon: -82.46, lat: 39.445 },
  { name: "Covered Bridge Trailhead", typeTag: "trailhead", systemIdx: 2, lon: -82.44, lat: 39.46 },
];

export interface SeedResult {
  super_systems: number;
  systems: number;
  trails: number;
  segments: number;
  features: number;
  wiki_pages: number;
  traces: number;
  trace_segments: number;
}

export async function seedOhioData(database: Database): Promise<SeedResult> {
  const result: SeedResult = {
    super_systems: 0,
    systems: 0,
    trails: 0,
    segments: 0,
    features: 0,
    wiki_pages: 0,
    traces: 0,
    trace_segments: 0,
  };

  const [ohioErie] = await database
    .insert(superSystems)
    .values({
      name: "Ohio to Erie Trail",
      slug: "ohio-to-erie-trail",
      official: true,
      description: "A planned cross-state trail from Cincinnati to Cleveland.",
      externalUrl: "https://www.ohioanderietrail.org/",
    })
    .onConflictDoNothing()
    .returning();
  if (ohioErie) {
    await database.execute(
      sql`UPDATE super_systems SET boundary = ST_Multi(ST_GeomFromText('${sql.raw(SUPER_SYSTEM_BOUNDARY)}', 4326))::geometry(MultiPolygon,4326)
          WHERE id = ${ohioErie.id}`,
    );
    result.super_systems = 1;
  }

  await database.execute(
    sql`INSERT INTO systems (name, slug, description, external_url, ownership_source, source_date, color, boundary)
        VALUES ${sql.join(
          OHIO_SYSTEMS.map(
            (s) =>
              sql`(${s.name}, ${s.slug}, ${s.description}, ${s.externalUrl}, 'ODNR / NPS / USFS', DATE '2024-01-01', ${s.color}, ST_Multi(ST_GeomFromText('${sql.raw(s.boundary)}', 4326))::geometry(MultiPolygon,4326))`,
          ),
          sql.raw(", "),
        )}
        ON CONFLICT (slug) DO NOTHING`,
  );

  const allSystems = await database.select().from(systems);
  result.systems = allSystems.length;

  if (ohioErie && allSystems.length > 0) {
    await database
      .insert(systemSuperSystems)
      .values(allSystems.map((s) => ({ systemId: s.id, superSystemId: ohioErie.id })))
      .onConflictDoNothing();
  }

  await database.execute(
    sql`INSERT INTO trails (name, slug, description, difficulty, length_meters, elevation_gain_meters, verified, geometry)
        VALUES ${sql.join(
          OHIO_TRAILS.map(
            (t) =>
              sql`(${t.name}, ${t.slug}, ${t.description}, ${t.difficulty}, ${t.lengthMeters}, ${t.elevationGainMeters}, TRUE, ST_Multi(ST_GeomFromText('${sql.raw(t.geometry)}', 4326))::geometry(MultiLineString,4326))`,
          ),
          sql.raw(", "),
        )}
        ON CONFLICT (slug) DO NOTHING`,
  );

  const allTrails = await database.select().from(trails);
  result.trails = allTrails.length;

  for (const t of OHIO_TRAILS) {
    if (allSystems.length > 0 && allTrails.length > 0) {
      const sys = allSystems[Math.min(t.systemIdx, allSystems.length - 1)];
      const trail = allTrails.find((tr) => tr.slug === t.slug);
      if (trail && sys) {
        await database
          .insert(trailSystems)
          .values({ trailId: trail.id, systemId: sys.id })
          .onConflictDoNothing();
      }
    }
  }

  for (const trail of allTrails) {
    const t = OHIO_TRAILS.find((ot) => ot.slug === trail.slug);
    const geom = t ? t.geometry : "MULTILINESTRING((-82.5 39.45, -82.48 39.46))";
    const surface =
      trail.slug === "little-miami-scenic-trail"
        ? "paved"
        : trail.slug === "towpath-trail"
          ? "gravel"
          : "natural";
    await database.execute(
      sql`INSERT INTO trail_segments (trail_id, name, sort_order, surface_type, geometry)
          VALUES (${trail.id}, 'Main segment', 0, ${surface},
                  ST_Multi(ST_GeomFromText('${sql.raw(geom)}', 4326))::geometry(MultiLineString,4326))
          ON CONFLICT DO NOTHING`,
    );
    result.segments += 1;
  }

  for (const f of OHIO_FEATURES) {
    const sys = allSystems[Math.min(f.systemIdx, allSystems.length - 1)];
    if (!sys) continue;
    await database.execute(
      sql`INSERT INTO features (name, type_tag, system_id, description, point)
          VALUES (${f.name}, ${f.typeTag}, ${sys.id}, ${f.description ?? null},
                  ST_SetSRID(ST_MakePoint(${f.lon}, ${f.lat}), 4326)::geometry(Point,4326))
          ON CONFLICT DO NOTHING`,
    );
    result.features += 1;
  }

  for (const trail of allTrails.slice(0, 3)) {
    const [page] = await database
      .insert(wikiPages)
      .values({
        targetType: "trail",
        targetId: trail.id,
        title: trail.name,
        contentMd: `# ${trail.name}\n\nA seeded wiki page. Replace with real content.`,
        renderedHtml: `<h1>${trail.name}</h1><p>A seeded wiki page. Replace with real content.</p>`,
      })
      .onConflictDoNothing()
      .returning();
    if (page) result.wiki_pages += 1;
  }

  const hockingSystem = allSystems.find((s) => s.slug === "hocking-hills-state-park");
  const cuyahogaSystem = allSystems.find((s) => s.slug === "cuyahoga-valley-national-park");
  const wayneSystem = allSystems.find((s) => s.slug === "wayne-national-forest");

  const seedTraces: Array<{
    geometry: string;
    source: string;
    weight: number;
    upvotes: number;
    downvotes: number;
    status: string;
    contributor: string;
    systemIdIdx: number;
    recordedAt: string;
  }> = [
    {
      geometry: "MULTILINESTRING((-82.538 39.438, -82.520 39.455, -82.492 39.468, -82.462 39.478, -82.432 39.470, -82.402 39.452))",
      source: "recorded", weight: 1.0, upvotes: 3, downvotes: 0, status: "active",
      contributor: "trail_blazer", systemIdIdx: 0, recordedAt: "2026-05-15",
    },
    {
      geometry: "MULTILINESTRING((-82.542 39.441, -82.518 39.462, -82.488 39.469, -82.458 39.479, -82.428 39.468, -82.398 39.449))",
      source: "recorded", weight: 0.9, upvotes: 2, downvotes: 0, status: "active",
      contributor: "hiker_jane", systemIdIdx: 0, recordedAt: "2026-06-01",
    },
    {
      geometry: "MULTILINESTRING((-82.536 39.439, -82.524 39.457, -82.494 39.466, -82.460 39.481, -82.434 39.472))",
      source: "import", weight: 0.7, upvotes: 1, downvotes: 0, status: "active",
      contributor: "gps_uploads", systemIdIdx: 0, recordedAt: "2026-04-20",
    },
    {
      geometry: "MULTILINESTRING((-81.582 41.218, -81.558 41.238, -81.538 41.248, -81.518 41.262, -81.502 41.252, -81.482 41.232))",
      source: "recorded", weight: 1.0, upvotes: 5, downvotes: 0, status: "active",
      contributor: "cleveland_hiker", systemIdIdx: 1, recordedAt: "2026-05-10",
    },
    {
      geometry: "MULTILINESTRING((-81.578 41.222, -81.562 41.243, -81.542 41.251, -81.522 41.258, -81.498 41.248))",
      source: "recorded", weight: 0.85, upvotes: 2, downvotes: 1, status: "active",
      contributor: "akron_walker", systemIdIdx: 1, recordedAt: "2026-06-10",
    },
    {
      geometry: "MULTILINESTRING((-82.468 39.448, -82.438 39.458, -82.412 39.470, -82.382 39.482, -82.352 39.488))",
      source: "import", weight: 0.6, upvotes: 1, downvotes: 0, status: "active",
      contributor: "trail_data", systemIdIdx: 2, recordedAt: "2026-03-15",
    },
    {
      geometry: "MULTILINESTRING((-82.472 39.452, -82.442 39.462, -82.408 39.468, -82.378 39.478))",
      source: "recorded", weight: 1.0, upvotes: 4, downvotes: 0, status: "active",
      contributor: "bike_scout", systemIdIdx: 2, recordedAt: "2026-06-15",
    },
    {
      geometry: "MULTILINESTRING((-82.538 39.432, -82.522 39.448, -82.498 39.472, -82.482 39.488, -82.504 39.472, -82.522 39.450, -82.537 39.431))",
      source: "recorded", weight: 1.0, upvotes: 7, downvotes: 0, status: "active",
      contributor: "gorge_explorer", systemIdIdx: 0, recordedAt: "2026-05-20",
    },
    {
      geometry: "MULTILINESTRING((-82.547 39.429, -82.525 39.447, -82.505 39.468, -82.485 39.491, -82.498 39.473, -82.519 39.448, -82.542 39.429))",
      source: "recorded", weight: 0.95, upvotes: 2, downvotes: 0, status: "active",
      contributor: "weekend_hiker", systemIdIdx: 0, recordedAt: "2026-06-05",
    },
    {
      geometry: "MULTILINESTRING((-81.598 41.202, -81.578 41.218, -81.558 41.235, -81.538 41.258, -81.518 41.282, -81.492 41.288))",
      source: "import", weight: 0.4, upvotes: 0, downvotes: 3, status: "active",
      contributor: "old_data", systemIdIdx: 1, recordedAt: "2026-01-01",
    },
    {
      geometry: "MULTILINESTRING((-81.605 41.198, -81.583 41.224, -81.560 41.242, -81.542 41.262, -81.524 41.278, -81.495 41.290))",
      source: "recorded", weight: 1.0, upvotes: 8, downvotes: 0, status: "active",
      contributor: "towpath_runner", systemIdIdx: 1, recordedAt: "2026-06-20",
    },
    {
      geometry: "MULTILINESTRING((-81.592 41.210, -81.572 41.228, -81.552 41.248, -81.532 41.265, -81.512 41.276))",
      source: "recorded", weight: 0.75, upvotes: 1, downvotes: 0, status: "active",
      contributor: "canal_rider", systemIdIdx: 1, recordedAt: "2026-04-10",
    },
    {
      geometry: "MULTILINESTRING((-82.538 39.438, -82.520 39.455, -82.492 39.468, -82.462 39.478))",
      source: "recorded", weight: 0.25, upvotes: 0, downvotes: 6, status: "ignored",
      contributor: "unknown_walker", systemIdIdx: 0, recordedAt: "2026-02-01",
    },
    {
      geometry: "MULTILINESTRING((-82.470 39.446, -82.440 39.456, -82.414 39.469, -82.384 39.480, -82.354 39.492))",
      source: "recorded", weight: 1.0, upvotes: 6, downvotes: 0, status: "active",
      contributor: "wayne_ranger", systemIdIdx: 2, recordedAt: "2026-05-25",
    },
  ];

  const sysByIndex = [hockingSystem, cuyahogaSystem, wayneSystem];

  for (const t of seedTraces) {
    const sys = sysByIndex[t.systemIdIdx];
    if (!sys) continue;
    const geom = t.geometry;
    const [trace] = await database
      .insert(gpsTraces)
      .values({
        contributorName: t.contributor,
        geometry: sql.raw(
          `ST_Multi(ST_GeomFromText('${geom}', 4326))::geometry(MultiLineString,4326)`,
        ) as unknown as string,
        source: t.source,
        weight: t.weight,
        upvotes: t.upvotes,
        downvotes: t.downvotes,
        status: t.status,
        recordedAt: new Date(t.recordedAt),
      })
      .returning({ id: gpsTraces.id });
    if (!trace) continue;
    result.traces += 1;
    await database
      .insert(traceSystems)
      .values({ traceId: trace.id, systemId: sys.id })
      .onConflictDoNothing();
  }

  const firstTrace = await database.select({ id: gpsTraces.id }).from(gpsTraces).limit(1);
  if (firstTrace[0]) {
    await database.insert(gpsTraceSegments).values([
      {
        traceId: firstTrace[0].id,
        geometry: sql.raw(
          `ST_Multi(ST_GeomFromText('MULTILINESTRING((-82.538 39.438, -82.520 39.455))', 4326))::geometry(MultiLineString,4326)`,
        ) as unknown as string,
      },
    ]);
    result.trace_segments += 1;
  }

  return result;
}
