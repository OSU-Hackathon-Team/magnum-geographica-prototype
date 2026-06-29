/**
 * E2E fixture seed (lives in the API package so the workspace's
 * `drizzle-orm` resolution finds it).
 *
 * Inserts the same fixture data the old in-process mock exposed
 * (3 systems, 3 trails, 4 features, 3 segments, 23 presets, 2
 * users, 2 super-systems, 2 sub-systems, 2 traces) into the real
 * test Postgres. The IDs come from `tests/e2e/fixtures/ids.ts` so
 * they are stable across runs.
 *
 * The geometry columns are written as raw WKT — Drizzle passes
 * them through to PostGIS, which parses them.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";
import {
  FIXTURE_IDS,
  FIXTURE_SLUGS,
} from "../../../../tests/e2e/fixtures/ids.js";

// All 23 preset seeds. Mirrors the in-process mock's `seedPresetsFixtures`
// function in `tests/e2e/helpers/api-mock.ts`. Keep these in sync.
const PRESET_SEEDS = [
  { key: "bench", label: "Bench", iconName: "cafe", iconColor: "#8B4513", category: "rest_shelter", osmTags: { amenity: "bench" }, questions: [{ key: "material", type: "select", label: "Material", options: [{ value: "wood", label: "Wood" }, { value: "stone", label: "Stone" }, { value: "metal", label: "Metal" }] }, { key: "backrest", type: "boolean", label: "Has backrest" }], upstreamable: true, sortOrder: 10 },
  { key: "picnic_table", label: "Picnic Table", iconName: "restaurant", iconColor: "#8B4513", category: "rest_shelter", osmTags: { leisure: "picnic_table" }, questions: [{ key: "covered", type: "boolean", label: "Covered" }], upstreamable: true, sortOrder: 20 },
  { key: "shelter", label: "Shelter", iconName: "home", iconColor: "#059669", category: "rest_shelter", osmTags: { amenity: "shelter" }, questions: [{ key: "type", type: "select", label: "Type", options: [{ value: "lean_to", label: "Lean-to" }, { value: "cabin", label: "Cabin" }] }], upstreamable: true, sortOrder: 30 },
  { key: "campsite", label: "Campsite", iconName: "bonfire", iconColor: "#059669", category: "rest_shelter", osmTags: { tourism: "camp_site" }, questions: [], upstreamable: true, sortOrder: 40 },
  { key: "drinking_water", label: "Drinking Water", iconName: "water", iconColor: "#3b82f6", category: "water_sanitation", osmTags: { amenity: "drinking_water" }, questions: [{ key: "potable", type: "select", label: "Potable", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }], upstreamable: true, sortOrder: 50 },
  { key: "spring", label: "Spring", iconName: "water", iconColor: "#3b82f6", category: "water_sanitation", osmTags: { natural: "spring" }, questions: [], upstreamable: false, sortOrder: 60 },
  { key: "restroom", label: "Restroom", iconName: "man", iconColor: "#6366f1", category: "water_sanitation", osmTags: { amenity: "toilets" }, questions: [], upstreamable: true, sortOrder: 70 },
  { key: "waste_basket", label: "Waste Basket", iconName: "trash", iconColor: "#6366f1", category: "water_sanitation", osmTags: { amenity: "waste_basket" }, questions: [], upstreamable: false, sortOrder: 80 },
  { key: "trailhead", label: "Trailhead", iconName: "flag", iconColor: "#22c55e", category: "navigation", osmTags: { highway: "trailhead" }, questions: [], upstreamable: true, sortOrder: 90 },
  { key: "map_board", label: "Map Board", iconName: "map", iconColor: "#22c55e", category: "navigation", osmTags: { information: "map" }, questions: [], upstreamable: true, sortOrder: 100 },
  { key: "guidepost", label: "Guidepost", iconName: "navigate", iconColor: "#22c55e", category: "navigation", osmTags: { information: "guidepost" }, questions: [], upstreamable: true, sortOrder: 110 },
  { key: "sign", label: "Sign", iconName: "information-circle", iconColor: "#dc2626", category: "navigation", osmTags: { information: "sign" }, questions: [], upstreamable: false, sortOrder: 120 },
  { key: "intersection", label: "Intersection", iconName: "git-merge", iconColor: "#f97316", category: "navigation", osmTags: { highway: "crossing" }, questions: [], upstreamable: false, sortOrder: 130 },
  { key: "fallen_tree", label: "Fallen Tree", iconName: "warning", iconColor: "#dc2626", category: "hazards_obstacles", osmTags: { hazard: "fallen_tree" }, questions: [{ key: "passable", type: "select", label: "Passable", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }], upstreamable: true, sortOrder: 140 },
  { key: "washout", label: "Washout", iconName: "warning", iconColor: "#dc2626", category: "hazards_obstacles", osmTags: { hazard: "washout" }, questions: [], upstreamable: true, sortOrder: 150 },
  { key: "steep_section", label: "Steep Section", iconName: "trending-up", iconColor: "#f59e0b", category: "hazards_obstacles", osmTags: { hazard: "steep" }, questions: [], upstreamable: true, sortOrder: 160 },
  { key: "road_connector", label: "Road Connector", iconName: "car-sport", iconColor: "#888888", category: "hazards_obstacles", osmTags: { highway: "residential" }, questions: [], upstreamable: false, sortOrder: 170 },
  { key: "viewpoint", label: "Viewpoint", iconName: "eye", iconColor: "#f59e0b", category: "landmarks", osmTags: { tourism: "viewpoint" }, questions: [{ key: "panoramic", type: "boolean", label: "Panoramic" }, { key: "covered", type: "boolean", label: "Covered" }], upstreamable: true, sortOrder: 180 },
  { key: "notable_tree", label: "Notable Tree", iconName: "leaf", iconColor: "#16a34a", category: "landmarks", osmTags: { natural: "tree" }, questions: [], upstreamable: true, sortOrder: 190 },
  { key: "waterfall", label: "Waterfall", iconName: "rainy", iconColor: "#3b82f6", category: "landmarks", osmTags: { waterway: "waterfall" }, questions: [], upstreamable: true, sortOrder: 200 },
  { key: "cave_entrance", label: "Cave Entrance", iconName: "moon", iconColor: "#475569", category: "landmarks", osmTags: { natural: "cave_entrance" }, questions: [], upstreamable: true, sortOrder: 210 },
  { key: "bridge", label: "Bridge", iconName: "git-network", iconColor: "#7c3aed", category: "landmarks", osmTags: { bridge: "yes" }, questions: [], upstreamable: true, sortOrder: 220 },
  { key: "tunnel", label: "Tunnel", iconName: "subway", iconColor: "#475569", category: "landmarks", osmTags: { tunnel: "yes" }, questions: [], upstreamable: true, sortOrder: 230 },
];

/**
 * Preset seed data. The IDs are looked up from `ids.preset1` …
 * `ids.preset23`; see `tests/e2e/fixtures/ids.ts`.
 *
 * `hashPassword` is injected so this module is portable between
 * Bun (which uses `Bun.password.hash`) and Node (which would
 * need a different implementation). The API server, which always
 * runs under Bun, passes `Bun.password.hash`.
 */
export async function seedFixtures(
  db: NodePgDatabase<typeof schema>,
  ids: typeof FIXTURE_IDS,
  hashPassword: (password: string) => Promise<string>,
): Promise<void> {
  // --- Users ----------------------------------------------------------
  await db.insert(schema.users).values([
    {
      id: ids.user100,
      username: "hiker1",
      email: "hiker1@example.com",
      passwordHash: await hashPassword("password123"),
      role: "contributor",
      trustScore: 25,
    },
    {
      id: ids.userAdmin,
      username: "admin",
      email: "admin@example.com",
      passwordHash: await hashPassword("adminpass"),
      role: "admin",
      trustScore: 999,
    },
  ]);

  // --- Super-systems -------------------------------------------------
  await db.insert(schema.superSystems).values([
    {
      id: ids.super1,
      name: "Ohio Erie Trail",
      slug: FIXTURE_SLUGS.super1,
      official: true,
      description: "A long-distance trail concept linking Ohio's Lake Erie shore.",
      externalUrl: null,
    },
    {
      id: ids.super2,
      name: "US Bike Route 50",
      slug: FIXTURE_SLUGS.super2,
      official: false,
      description: "Unofficial US Bike Route 50 alignment through Ohio.",
      externalUrl: null,
    },
  ]);

  // --- Systems -------------------------------------------------------
  await db.insert(schema.systems).values([
    {
      id: ids.sys1,
      name: "Hocking Hills State Park",
      slug: FIXTURE_SLUGS.sys1,
      ownershipSource: "ODNR",
      sourceDate: "2024-01-01",
      description: "A state park in southeastern Ohio known for its rugged terrain and gorges.",
      externalUrl: "https://ohiodnr.gov/hocking",
      boundary: sql.raw(`ST_Multi(ST_GeomFromText('POLYGON((-83.6 39.3, -82.4 39.3, -82.4 39.6, -83.6 39.6, -83.6 39.3))', 4326))`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
    {
      id: ids.sys2,
      name: "Cuyahoga Valley National Park",
      slug: FIXTURE_SLUGS.sys2,
      ownershipSource: "NPS",
      sourceDate: "2024-01-01",
      description:
        "A national park between Cleveland and Akron with the Ohio & Erie Canal Towpath Trail.",
      externalUrl: "https://www.nps.gov/cuva/",
      boundary: sql.raw(`ST_Multi(ST_GeomFromText('POLYGON((-81.7 41.2, -81.4 41.2, -81.4 41.4, -81.7 41.4, -81.7 41.2))', 4326))`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
    {
      id: ids.sys3,
      name: "Wayne National Forest",
      slug: FIXTURE_SLUGS.sys3,
      ownershipSource: "USFS",
      sourceDate: "2024-01-01",
      description: "Ohio's only national forest, covering parts of southeastern Ohio.",
      externalUrl: "https://www.fs.usda.gov/wayne",
      boundary: sql.raw(`ST_Multi(ST_GeomFromText('POLYGON((-82.4 39.2, -81.9 39.2, -81.9 39.7, -82.4 39.7, -82.4 39.2))', 4326))`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
  ]);

  // sys1 and sys2 belong to super1.
  await db.insert(schema.systemSuperSystems).values([
    { systemId: ids.sys1, superSystemId: ids.super1 },
    { systemId: ids.sys2, superSystemId: ids.super1 },
  ]);

  // --- Sub-systems ---------------------------------------------------
  await db.insert(schema.subSystems).values([
    {
      id: ids.sub1,
      name: "Old Man's Cave Area",
      slug: "old-mans-cave-area",
      systemId: ids.sys1,
      geometry: sql.raw(`ST_GeomFromText('POLYGON((-82.6 39.4, -82.4 39.4, -82.4 39.5, -82.6 39.5, -82.6 39.4))', 4326)`),
      description: "Sub-region around Old Man's Cave.",
    },
    {
      id: ids.sub2,
      name: "Ash Cave Area",
      slug: "ash-cave-area",
      systemId: ids.sys1,
      geometry: sql.raw(`ST_GeomFromText('POLYGON((-82.5 39.4, -82.3 39.4, -82.3 39.5, -82.5 39.5, -82.5 39.4))', 4326)`),
      description: "Sub-region around Ash Cave.",
    },
  ]);

  // --- Trails --------------------------------------------------------
  await db.insert(schema.trails).values([
    {
      id: ids.trail1,
      name: "Buckeye Trail",
      slug: FIXTURE_SLUGS.trail1,
      description: "A 1,444-mile loop that encircles Ohio, passing through diverse landscapes.",
      difficulty: "moderate",
      lengthMeters: 2324200,
      elevationGainMeters: 8500,
      verified: true,
      tier: "synthesized",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-82.54 39.43, -82.55 39.45, -82.56 39.47)', 4326))`),
      createdByUserId: ids.user100,
    },
    {
      id: ids.trail2,
      name: "Towpath Trail",
      slug: FIXTURE_SLUGS.trail2,
      description: "Follows the historic Ohio & Erie Canal through Cuyahoga Valley.",
      difficulty: "easy",
      lengthMeters: 154500,
      elevationGainMeters: 200,
      verified: true,
      tier: "frozen",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-81.56 41.28, -81.57 41.27, -81.58 41.26)', 4326))`),
      createdByUserId: ids.user100,
    },
    {
      id: ids.trail3,
      name: "Hocking Hills Indian Run",
      slug: FIXTURE_SLUGS.trail3,
      description: "A scenic loop through Ohio's Hocking Hills region.",
      difficulty: "moderate",
      lengthMeters: 6400,
      elevationGainMeters: 180,
      verified: false,
      tier: "premium",
      source: "NPS",
      sourceDate: "2024-01-01",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-82.54 39.43, -82.55 39.44, -82.56 39.45)', 4326))`),
      createdByUserId: ids.user100,
    },
  ]);

  await db.insert(schema.trailSystems).values([
    { trailId: ids.trail1, systemId: ids.sys1 },
    { trailId: ids.trail2, systemId: ids.sys2 },
    { trailId: ids.trail3, systemId: ids.sys1 },
  ]);

  // --- Segments ------------------------------------------------------
  await db.insert(schema.trailSegments).values([
    {
      id: ids.seg1,
      trailId: ids.trail1,
      name: "North loop",
      sortOrder: 0,
      surfaceType: "natural",
      hazards: ["steep", "rocky"],
      isRoadConnector: false,
      steepGrade: true,
      oneWay: false,
      description: null,
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-82.54 39.43, -82.55 39.45)', 4326))`),
    },
    {
      id: ids.seg2,
      trailId: ids.trail1,
      name: "Road connector",
      sortOrder: 1,
      surfaceType: "road_connector",
      hazards: ["traffic"],
      isRoadConnector: true,
      steepGrade: false,
      oneWay: false,
      description: "Brief on-road section to connect trail segments.",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-82.55 39.45, -82.56 39.47)', 4326))`),
    },
    {
      id: ids.seg3,
      trailId: ids.trail2,
      name: "Main towpath",
      sortOrder: 0,
      surfaceType: "gravel",
      hazards: [],
      isRoadConnector: false,
      steepGrade: false,
      oneWay: false,
      description: "Flat, family-friendly towpath.",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-81.56 41.28, -81.58 41.26)', 4326))`),
    },
  ]);

  // --- Presets (all 23) ---------------------------------------------
  const presetIds = [
    ids.preset1, ids.preset2, ids.preset3, ids.preset4, ids.preset5,
    ids.preset6, ids.preset7, ids.preset8, ids.preset9, ids.preset10,
    ids.preset11, ids.preset12, ids.preset13, ids.preset14, ids.preset15,
    ids.preset16, ids.preset17, ids.preset18, ids.preset19, ids.preset20,
    ids.preset21, ids.preset22, ids.preset23,
  ];
  await db.insert(schema.presets).values(
    PRESET_SEEDS.map((p, i) => ({
      id: presetIds[i],
      key: p.key,
      label: p.label,
      iconName: p.iconName,
      iconColor: p.iconColor,
      category: p.category,
      osmTags: p.osmTags,
      questions: p.questions,
      upstreamable: p.upstreamable,
      sortOrder: p.sortOrder,
    })),
  );

  // --- Features ------------------------------------------------------
  await db.insert(schema.features).values([
    {
      id: ids.f1,
      name: "Old Man's Cave",
      typeTag: "scenic_point",
      description: "Recessed gorge with waterfall.",
      trailId: ids.trail1,
      systemId: null,
      point: sql.raw(`ST_SetSRID(ST_MakePoint(-82.5412, 39.4342), 4326)`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
    {
      id: ids.f2,
      name: "Boston Mill Visitor Center",
      typeTag: "trailhead",
      description: "Main trailhead for the Towpath.",
      trailId: ids.trail2,
      systemId: ids.sys2,
      point: sql.raw(`ST_SetSRID(ST_MakePoint(-81.5618, 41.2627), 4326)`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
    {
      id: ids.f3,
      name: "Blue Hen Falls",
      typeTag: "water_source",
      description: null,
      trailId: ids.trail2,
      systemId: ids.sys2,
      point: sql.raw(`ST_SetSRID(ST_MakePoint(-81.5761, 41.2854), 4326)`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
    {
      id: ids.f4,
      name: "Cedar Falls Overlook",
      typeTag: "viewpoint",
      description: "Panoramic overlook of Cedar Falls.",
      trailId: ids.trail1,
      systemId: ids.sys1,
      presetId: ids.preset18, // viewpoint
      answers: { panoramic: true, covered: false },
      point: sql.raw(`ST_SetSRID(ST_MakePoint(-82.5421, 39.4355), 4326)`),
      createdByUserId: ids.user100,
      contributorName: "hiker1",
    },
  ]);

  // --- GPS traces (mock seeded 2 in sys-1) --------------------------
  await db.insert(schema.gpsTraces).values([
    {
      id: ids.trace1,
      userId: ids.user100,
      contributorName: "hiker1",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-82.5412 39.4342, -82.5405 39.4355, -82.5398 39.4368)', 4326))`),
      source: "recorded",
      weight: 1.0,
      upvotes: 3,
      downvotes: 0,
      status: "active",
      recordedAt: new Date("2026-06-21T00:00:00.000Z"),
    },
    {
      id: ids.trace2,
      userId: ids.user100,
      contributorName: "hiker1",
      geometry: sql.raw(`ST_Multi(ST_GeomFromText('LINESTRING(-82.5412 39.4342, -82.5420 39.4350, -82.5428 39.4358)', 4326))`),
      source: "import",
      weight: 0.8,
      upvotes: 1,
      downvotes: 0,
      status: "active",
      recordedAt: new Date("2026-06-21T00:00:00.000Z"),
    },
  ]);
  await db
    .insert(schema.traceSystems)
    .values([
      { traceId: ids.trace1, systemId: ids.sys1 },
      { traceId: ids.trace2, systemId: ids.sys1 },
    ]);

  // --- Trace segments (server-cut for trace1) ---------------------
  await db.insert(schema.gpsTraceSegments).values([
    {
      id: ids.traceSeg1,
      traceId: ids.trace1,
      geometry: sql.raw(
        `ST_Multi(ST_GeomFromText('LINESTRING(-82.5412 39.4342, -82.5408 39.4348)', 4326))`,
      ),
      clusterId: 1,
      proposedTrailId: ids.trail1,
    },
    {
      id: ids.traceSeg2,
      traceId: ids.trace1,
      geometry: sql.raw(
        `ST_Multi(ST_GeomFromText('LINESTRING(-82.5408 39.4348, -82.5405 39.4355)', 4326))`,
      ),
      clusterId: 1,
      proposedTrailId: ids.trail1,
    },
    {
      id: ids.traceSeg3,
      traceId: ids.trace1,
      geometry: sql.raw(
        `ST_Multi(ST_GeomFromText('LINESTRING(-82.5405 39.4355, -82.5398 39.4368)', 4326))`,
      ),
      clusterId: 2,
      proposedTrailId: null,
    },
  ]);
}
