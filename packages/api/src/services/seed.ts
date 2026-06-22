import { sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  systems,
  superSystems,
  systemSuperSystems,
  trails,
  trailSystems,
  wikiPages,
} from "../db/schema.js";

const OHIO_BBOX =
  "POLYGON((-84.8203 38.4032, -80.5183 38.4032, -80.5183 41.9775, -84.8203 41.9775, -84.8203 38.4032))";

const OHIO_SYSTEMS: ReadonlyArray<{
  name: string;
  slug: string;
  description: string;
  externalUrl: string;
  lon: number;
  lat: number;
}> = [
  {
    name: "Hocking Hills State Park",
    slug: "hocking-hills-state-park",
    description: "A state park in southeastern Ohio known for its rugged terrain and gorges.",
    externalUrl: "https://ohiodnr.gov/go-and-do/places-to-go/state-parks/hocking-hills",
    lon: -82.5318,
    lat: 39.4465,
  },
  {
    name: "Cuyahoga Valley National Park",
    slug: "cuyahoga-valley-national-park",
    description: "A national park between Cleveland and Akron with the Ohio & Erie Canal Towpath Trail.",
    externalUrl: "https://www.nps.gov/cuva/",
    lon: -81.55,
    lat: 41.24,
  },
  {
    name: "Wayne National Forest",
    slug: "wayne-national-forest",
    description: "Ohio's only national forest, covering parts of southeastern Ohio.",
    externalUrl: "https://www.fs.usda.gov/wayne",
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
}> = [
  {
    name: "Buckeye Trail",
    slug: "buckeye-trail",
    description: "A 1,444-mile loop that encircles Ohio, passing through diverse landscapes.",
    difficulty: "moderate",
    lengthMeters: 2_324_200,
    elevationGainMeters: 8500,
  },
  {
    name: "Ohio Erie Trail",
    slug: "ohio-erie-trail",
    description: "Spans northern Ohio, part of the larger Ohio to Erie Trail network.",
    difficulty: "easy",
    lengthMeters: 532_000,
    elevationGainMeters: 1200,
  },
  {
    name: "Little Miami Scenic Trail",
    slug: "little-miami-scenic-trail",
    description: "Paved rail-trail along the Little Miami River.",
    difficulty: "easy",
    lengthMeters: 102_000,
    elevationGainMeters: 320,
  },
  {
    name: "Hocking Hills Indian Run",
    slug: "hocking-hills-indian-run",
    description: "A scenic loop through Ohio's Hocking Hills region.",
    difficulty: "moderate",
    lengthMeters: 6_400,
    elevationGainMeters: 180,
  },
  {
    name: "Towpath Trail",
    slug: "towpath-trail",
    description: "Follows the historic Ohio & Erie Canal through Cuyahoga Valley.",
    difficulty: "easy",
    lengthMeters: 154_500,
    elevationGainMeters: 200,
  },
];

const OHIO_FEATURES: ReadonlyArray<{
  name: string;
  typeTag: string;
  systemIdx: number;
  description?: string;
}> = [
  { name: "Old Man's Cave", typeTag: "scenic_point", systemIdx: 0, description: "Recessed gorge with waterfall." },
  { name: "Ash Cave Trailhead", typeTag: "trailhead", systemIdx: 0 },
  { name: "Ledges Overlook", typeTag: "scenic_point", systemIdx: 0 },
  { name: "Blue Hen Falls", typeTag: "water_source", systemIdx: 1 },
  { name: "Boston Mill Visitor Center", typeTag: "trailhead", systemIdx: 1 },
  { name: "Pine Hollow Parking", typeTag: "parking", systemIdx: 2 },
  { name: "Covered Bridge Trailhead", typeTag: "trailhead", systemIdx: 2 },
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
  if (ohioErie) result.super_systems = 1;

  await database.execute(
    sql`INSERT INTO systems (name, slug, description, external_url, ownership_source, source_date, boundary)
        VALUES ${sql.join(
          OHIO_SYSTEMS.map(
            (s) =>
              sql`(${s.name}, ${s.slug}, ${s.description}, ${s.externalUrl}, 'ODNR / NPS / USFS', DATE '2024-01-01', ST_Multi(ST_GeomFromText('${sql.raw(OHIO_BBOX)}', 4326))::geometry(MultiPolygon,4326))`,
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
              sql`(${t.name}, ${t.slug}, ${t.description}, ${t.difficulty}, ${t.lengthMeters}, ${t.elevationGainMeters}, TRUE, ST_Multi(ST_GeomFromText('${sql.raw(`MULTILINESTRING((${-82.9} ${39.96}, ${-82.91} ${39.97}))`)}', 4326))::geometry(MultiLineString,4326))`,
          ),
          sql.raw(", "),
        )}
        ON CONFLICT (slug) DO NOTHING`,
  );

  const allTrails = await database.select().from(trails);
  result.trails = allTrails.length;

  if (allSystems.length > 0) {
    await database
      .insert(trailSystems)
      .values(
        allTrails.map((t) => ({ trailId: t.id, systemId: allSystems[0]!.id })),
      )
      .onConflictDoNothing();
  }

  for (const trail of allTrails) {
    await database.execute(
      sql`INSERT INTO trail_segments (trail_id, name, sort_order, surface_type, geometry)
          SELECT ${trail.id}, 'Main segment', 0, 'natural',
                  ST_Multi(ST_GeomFromText('${sql.raw(`MULTILINESTRING((${-82.9} ${39.96}, ${-82.91} ${39.97}))`)}', 4326))::geometry(MultiLineString,4326)
          WHERE NOT EXISTS (SELECT 1 FROM trail_segments WHERE trail_id = ${trail.id} AND sort_order = 0)`,
    );
    result.segments += 1;
  }

  if (allSystems.length > 0) {
    for (const f of OHIO_FEATURES) {
      const sys = allSystems[Math.min(f.systemIdx, allSystems.length - 1)]!;
      const coords = OHIO_SYSTEMS[Math.min(f.systemIdx, OHIO_SYSTEMS.length - 1)]!;
      await database.execute(
        sql`INSERT INTO features (name, type_tag, system_id, description, point)
            SELECT ${f.name}, ${f.typeTag}, ${sys.id}, ${f.description ?? null},
                   ST_SetSRID(ST_MakePoint(${coords.lon}, ${coords.lat}), 4326)::geometry(Point,4326)
            WHERE NOT EXISTS (SELECT 1 FROM features WHERE name = ${f.name} AND system_id = ${sys.id})`,
      );
      result.features += 1;
    }
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
