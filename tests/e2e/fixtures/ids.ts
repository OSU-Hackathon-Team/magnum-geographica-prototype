/**
 * Deterministic UUID mapping for E2E fixture data.
 *
 * The old in-process mock exposed short string ids (`sys-1`,
 * `trail-1`, `f-1`, …) and tests referenced them by those ids
 * (`trail-feature-f-1`, `/wiki/trail/trail-1`, …). The real test
 * database uses Postgres `uuid` columns, so the fixtures here get
 * real UUIDs.
 *
 * The mapping is deterministic and stable across runs. The first
 * 16 hex chars encode the fixture slug (e.g. `01000000-0000-4000-...`
 * for "sys-1") so a human can spot the relationship. The remaining
 * 16 chars are zeros. This is a valid v4 UUID because the
 * version nibble (the `4`) and variant nibble (`8`/`9`/`a`/`b`)
 * match the RFC-4122 pattern.
 */

function id(slot: number): string {
  // 12 hex chars of "slot" + zeros. Slot is a 32-bit integer so
  // we get up to 8 hex digits; pad to 12.
  const slotHex = slot.toString(16).padStart(12, "0");
  // 00000000-0000-4000-a000-xxxxxxxxxxxx
  return `00000000-0000-4000-a000-${slotHex}`;
}

export const FIXTURE_IDS = {
  // Systems (slot 1..10)
  sys1: id(1), // Hocking Hills State Park
  sys2: id(2), // Cuyahoga Valley National Park
  sys3: id(3), // Wayne National Forest
  // Trails (slot 20..29)
  trail1: id(20), // Buckeye Trail
  trail2: id(21), // Towpath Trail
  trail3: id(22), // Hocking Hills Indian Run
  // Segments (slot 30..39)
  seg1: id(30), // Buckeye Trail — North loop
  seg2: id(31), // Buckeye Trail — Road connector
  seg3: id(32), // Towpath Trail — Main towpath
  // Features (slot 40..49)
  f1: id(40), // Old Man's Cave
  f2: id(41), // Boston Mill Visitor Center
  f3: id(42), // Blue Hen Falls
  f4: id(43), // Cedar Falls Overlook
  // Users (slot 100..109)
  user100: id(100), // hiker1 (seed user, contributor trust_score=25)
  userAdmin: id(101), // admin (role=admin, trust_score=999)
  // Super-systems (slot 110..119)
  super1: id(110),
  super2: id(111),
  // Sub-systems (slot 120..129)
  sub1: id(120),
  sub2: id(121),
  // Presets (slot 150..199) — index = presetId(N) where N is 1..23
  preset1: id(150), // bench
  preset2: id(151), // picnic_table
  preset3: id(152), // shelter
  preset4: id(153), // campsite
  preset5: id(154), // drinking_water
  preset6: id(155), // spring
  preset7: id(156), // restroom
  preset8: id(157), // waste_basket
  preset9: id(158), // trailhead
  preset10: id(159), // map_board
  preset11: id(160), // guidepost
  preset12: id(161), // sign
  preset13: id(162), // intersection
  preset14: id(163), // fallen_tree
  preset15: id(164), // washout
  preset16: id(165), // steep_section
  preset17: id(166), // road_connector
  preset18: id(167), // viewpoint
  preset19: id(168), // notable_tree
  preset20: id(169), // waterfall
  preset21: id(170), // cave_entrance
  preset22: id(171), // bridge
  preset23: id(172), // tunnel
  // GPS traces (slot 200..219)
  trace1: id(200),
  trace2: id(201),
  // GPS trace segments (slot 220..239)
  traceSeg1: id(220),
  traceSeg2: id(221),
  traceSeg3: id(222),
} as const;

export const FIXTURE_SLUGS = {
  sys1: "hocking-hills-state-park",
  sys2: "cuyahoga-valley-national-park",
  sys3: "wayne-national-forest",
  trail1: "buckeye-trail",
  trail2: "towpath-trail",
  trail3: "hocking-hills-indian-run",
  super1: "ohio-erie-trail",
  super2: "us-bike-route-50",
  sub1: "old-mans-cave-area",
  sub2: "ash-cave-area",
} as const;

/**
 * Readable name lookup keyed by id. Useful for assertions in tests
 * that want to check that a system shows up in the list with the
 * expected display name.
 */
export const FIXTURE_NAMES = {
  sys1: "Hocking Hills State Park",
  sys2: "Cuyahoga Valley National Park",
  sys3: "Wayne National Forest",
  trail1: "Buckeye Trail",
  trail2: "Towpath Trail",
  trail3: "Hocking Hills Indian Run",
  f1: "Old Man's Cave",
  f2: "Boston Mill Visitor Center",
  f3: "Blue Hen Falls",
  f4: "Cedar Falls Overlook",
} as const;
