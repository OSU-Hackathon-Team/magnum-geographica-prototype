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
    description: "A national park between Cleveland and Akron with the Ohio & Erie Canal Towpath Trail.",
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
  { name: "Old Man's Cave", typeTag: "scenic_point", systemIdx: 0, description: "Recessed gorge with waterfall.", lon: -82.5410, lat: 39.4400 },
  { name: "Ash Cave Trailhead", typeTag: "trailhead", systemIdx: 0, lon: -82.5450, lat: 39.4480 },
  { name: "Cedar Falls Overlook", typeTag: "scenic_point", systemIdx: 0, lon: -82.5350, lat: 39.4550 },
  { name: "Ledges Overlook", typeTag: "scenic_point", systemIdx: 1, lon: -81.5600, lat: 41.2450 },
  { name: "Boston Mill Visitor Center", typeTag: "trailhead", systemIdx: 1, lon: -81.5550, lat: 41.2500 },
  { name: "Blue Hen Falls", typeTag: "water_source", systemIdx: 1, lon: -81.5400, lat: 41.2300 },
  { name: "Pine Hollow Parking", typeTag: "parking", systemIdx: 2, lon: -82.4600, lat: 39.4450 },
  { name: "Covered Bridge Trailhead", typeTag: "trailhead", systemIdx: 2, lon: -82.4400, lat: 39.4600 },
];

export interface SeedResult {
  super_systems: number;
  systems: number;
  trails: number;
  segments: number;
  features: number;
  wiki_pages: number;
}

export async function seedOhioData(database: Database): Promise<SeedResult> {
  const result: SeedResult = {
    super_systems: 0,
    systems: 0,
    trails: 0,
    segments: 0,
    features: 0,
    wiki_pages: 0,
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
    const surface = trail.slug === "little-miami-scenic-trail" ? "paved"
      : trail.slug === "towpath-trail" ? "gravel"
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

  return result;
}
