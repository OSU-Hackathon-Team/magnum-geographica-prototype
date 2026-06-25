export const MOCK_API_HOST = "localhost:9999";

export const SYSTEMS = [
  {
    id: "sys-1",
    name: "Hocking Hills State Park",
    slug: "hocking-hills-state-park",
    description: "A state park in southeastern Ohio known for its rugged terrain and gorges.",
    external_url: "https://ohiodnr.gov/hocking",
    ownership_source: "ODNR",
    source_date: "2024-01-01",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 39.4301, lon: -82.5404 },
  },
  {
    id: "sys-2",
    name: "Cuyahoga Valley National Park",
    slug: "cuyahoga-valley-national-park",
    description:
      "A national park between Cleveland and Akron with the Ohio & Erie Canal Towpath Trail.",
    external_url: "https://www.nps.gov/cuva/",
    ownership_source: "NPS",
    source_date: "2024-01-01",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 41.2795, lon: -81.5512 },
  },
  {
    id: "sys-3",
    name: "Wayne National Forest",
    slug: "wayne-national-forest",
    description: "Ohio's only national forest, covering parts of southeastern Ohio.",
    external_url: "https://www.fs.usda.gov/wayne",
    ownership_source: "USFS",
    source_date: "2024-01-01",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 39.45, lon: -82.15 },
  },
] as const;

export const TRAILS = [
  {
    id: "trail-1",
    name: "Buckeye Trail",
    slug: "buckeye-trail",
    description: "A 1,444-mile loop that encircles Ohio, passing through diverse landscapes.",
    difficulty: "moderate",
    length_meters: 2324200,
    elevation_gain_meters: 8500,
    verified: true,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 39.4301, lon: -82.5404 },
  },
  {
    id: "trail-2",
    name: "Towpath Trail",
    slug: "towpath-trail",
    description: "Follows the historic Ohio & Erie Canal through Cuyahoga Valley.",
    difficulty: "easy",
    length_meters: 154500,
    elevation_gain_meters: 200,
    verified: true,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 41.2795, lon: -81.5512 },
  },
  {
    id: "trail-3",
    name: "Hocking Hills Indian Run",
    slug: "hocking-hills-indian-run",
    description: "A scenic loop through Ohio's Hocking Hills region.",
    difficulty: "moderate",
    length_meters: 6400,
    elevation_gain_meters: 180,
    verified: false,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 39.4301, lon: -82.5404 },
  },
] as const;

export const SEGMENTS_BY_TRAIL: Record<string, unknown[]> = {
  "trail-1": [
    {
      id: "seg-1",
      trail_id: "trail-1",
      name: "North loop",
      sort_order: 0,
      surface_type: "natural",
      hazards: ["steep", "rocky"],
      is_road_connector: false,
      steep_grade: true,
      one_way: false,
      description: null,
      length_meters: 4200,
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    },
    {
      id: "seg-2",
      trail_id: "trail-1",
      name: "Road connector",
      sort_order: 1,
      surface_type: "road_connector",
      hazards: ["traffic"],
      is_road_connector: true,
      steep_grade: false,
      one_way: false,
      description: "Brief on-road section to connect trail segments.",
      length_meters: 800,
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    },
  ],
  "trail-2": [
    {
      id: "seg-3",
      trail_id: "trail-2",
      name: "Main towpath",
      sort_order: 0,
      surface_type: "gravel",
      hazards: [],
      is_road_connector: false,
      steep_grade: false,
      one_way: false,
      description: "Flat, family-friendly towpath.",
      length_meters: 32000,
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    },
  ],
  "trail-3": [],
};

export const FEATURES_BY_TRAIL: Record<string, unknown[]> = {
  "trail-1": [
    {
      id: "f-1",
      name: "Old Man's Cave",
      type_tag: "scenic_point",
      description: "Recessed gorge with waterfall.",
      trail_id: "trail-1",
      system_id: null,
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
      center: { lat: 39.4342, lon: -82.5412 },
    },
  ],
  "trail-2": [
    {
      id: "f-2",
      name: "Boston Mill Visitor Center",
      type_tag: "trailhead",
      description: "Main trailhead for the Towpath.",
      trail_id: "trail-2",
      system_id: "sys-2",
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
      center: { lat: 41.2627, lon: -81.5618 },
    },
    {
      id: "f-3",
      name: "Blue Hen Falls",
      type_tag: "water_source",
      description: null,
      trail_id: "trail-2",
      system_id: "sys-2",
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
      center: { lat: 41.2854, lon: -81.5761 },
    },
  ],
  "trail-3": [],
};

export const FEATURES: Record<string, unknown> = {
  "f-1": {
    id: "f-1",
    name: "Old Man's Cave",
    type_tag: "scenic_point",
    description: "Recessed gorge with waterfall.",
    trail_id: "trail-1",
    system_id: null,
    created_by_user_id: "user-100",
    contributor_name: "hiker1",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 39.4342, lon: -82.5412 },
  },
  "f-2": {
    id: "f-2",
    name: "Boston Mill Visitor Center",
    type_tag: "trailhead",
    description: "Main trailhead for the Towpath.",
    trail_id: "trail-2",
    system_id: "sys-2",
    created_by_user_id: "user-100",
    contributor_name: "hiker1",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 41.2627, lon: -81.5618 },
  },
  "f-3": {
    id: "f-3",
    name: "Blue Hen Falls",
    type_tag: "water_source",
    description: null,
    trail_id: "trail-2",
    system_id: "sys-2",
    created_by_user_id: "user-100",
    contributor_name: "hiker1",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 41.2854, lon: -81.5761 },
  },
  // Feature with a preset — used to test preset rendering on the
  // detail page (answer badges, preset label) and the vote control
  // against a feature whose author is a known user.
  "f-4": {
    id: "f-4",
    name: "Cedar Falls Overlook",
    type_tag: "viewpoint",
    description: "Panoramic overlook of Cedar Falls.",
    trail_id: "trail-1",
    system_id: "sys-1",
    preset_id: "preset-18",
    preset_key: "viewpoint",
    preset_label: "Viewpoint",
    preset_icon_name: "eye",
    preset_icon_color: "#f59e0b",
    answers: { panoramic: true, covered: false },
    created_by_user_id: "user-100",
    contributor_name: "hiker1",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
    center: { lat: 39.4355, lon: -82.5421 },
  },
};

export const TRAILS_BY_SYSTEM: Record<string, (typeof TRAILS)[number][]> = {
  "sys-1": [TRAILS[0], TRAILS[2]],
  "sys-2": [TRAILS[1]],
  "sys-3": [],
};

/**
 * Pre-seeded users that features reference via `created_by_user_id`.
 * The mock seeds these into MOCK_USERS on `resetApiMock()` so that
 * vote-karma attribution and `/api/votes/users/:id/karma` lookups
 * resolve to a real user record.
 */
export const SEED_USERS = [
  {
    id: "user-100",
    username: "hiker1",
    email: "hiker1@example.com",
    role: "contributor",
    trust_score: 25,
  },
] as const;
