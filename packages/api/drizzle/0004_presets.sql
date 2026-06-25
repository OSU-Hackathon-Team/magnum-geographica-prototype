-- Phase 2 (§21.4): Presets.
-- Adds the `presets` table and migrates `features` from the hardcoded
-- `type_tag` enum to a `preset_id` reference + `answers` JSONB.
--
-- The migration is non-destructive on existing data: `type_tag` becomes
-- nullable, and a follow-up UPDATE (best-effort) backfills `preset_id` for
-- rows whose `type_tag` matches a default preset's `key`.

-- ========== Presets table ==========

CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"icon_name" text NOT NULL,
	"icon_color" text DEFAULT '#22c55e' NOT NULL,
	"category" text NOT NULL,
	"osm_tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"upstreamable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "idx_presets_category" ON "presets" USING btree ("category","sort_order");
--> statement-breakpoint

-- ========== Features: add preset_id, answers; relax type_tag ==========

ALTER TABLE "features" ALTER COLUMN "type_tag" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "preset_id" uuid;
--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "answers" jsonb;
--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_preset_id_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."presets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_features_preset" ON "features" USING btree ("preset_id");
--> statement-breakpoint

-- ========== Seed default presets (~21, §21.4) ==========
-- Keys are chosen to match the existing `FEATURE_TYPES` enum where
-- possible so the backfill below can resolve cleanly.

INSERT INTO "presets" ("key", "label", "icon_name", "icon_color", "category", "osm_tags", "questions", "upstreamable", "sort_order") VALUES
	-- Rest & Shelter
	('bench', 'Bench', 'cafe', '#8B4513', 'rest_shelter', '{"amenity":"bench"}', '[{"key":"material","type":"select","label":"Material","options":[{"value":"wood","label":"Wood"},{"value":"stone","label":"Stone"},{"value":"metal","label":"Metal"},{"value":"plastic","label":"Plastic"}]},{"key":"backrest","type":"boolean","label":"Has backrest"},{"key":"seats","type":"select","label":"Seats","options":[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3+"}]}]', true, 10),
	('picnic_table', 'Picnic Table', 'restaurant', '#8B4513', 'rest_shelter', '{"leisure":"picnic_table"}', '[{"key":"covered","type":"boolean","label":"Covered"}]', true, 20),
	('shelter', 'Shelter', 'home', '#059669', 'rest_shelter', '{"amenity":"shelter"}', '[{"key":"type","type":"select","label":"Type","options":[{"value":"lean_to","label":"Lean-to"},{"value":"cabin","label":"Cabin"},{"value":"ruin","label":"Ruin"}]},{"key":"sleeps","type":"select","label":"Sleeps","options":[{"value":"1_2","label":"1-2"},{"value":"3_4","label":"3-4"},{"value":"5+","label":"5+"}]}]', true, 30),
	('campsite', 'Campsite', 'bonfire', '#059669', 'rest_shelter', '{"tourism":"camp_site"}', '[{"key":"designated","type":"boolean","label":"Designated site"}]', true, 40),
	-- Water & Sanitation
	('drinking_water', 'Drinking Water', 'water', '#3b82f6', 'water_sanitation', '{"amenity":"drinking_water"}', '[{"key":"potable","type":"select","label":"Potable","options":[{"value":"yes","label":"Yes"},{"value":"no","label":"No"},{"value":"seasonal","label":"Seasonal"}]},{"key":"covered","type":"boolean","label":"Covered"}]', true, 50),
	('spring', 'Spring', 'water', '#3b82f6', 'water_sanitation', '{"natural":"spring"}', '[{"key":"reliable","type":"boolean","label":"Reliable year-round"}]', false, 60),
	('restroom', 'Restroom', 'man', '#6366f1', 'water_sanitation', '{"amenity":"toilets"}', '[{"key":"accessible","type":"boolean","label":"ADA accessible"}]', true, 70),
	('waste_basket', 'Waste Basket', 'trash', '#6366f1', 'water_sanitation', '{"amenity":"waste_basket"}', '[]', false, 80),
	-- Navigation
	('trailhead', 'Trailhead', 'flag', '#22c55e', 'navigation', '{"highway":"trailhead"}', '[]', true, 90),
	('map_board', 'Map Board', 'map', '#22c55e', 'navigation', '{"information":"map"}', '[]', true, 100),
	('guidepost', 'Guidepost', 'navigate', '#22c55e', 'navigation', '{"information":"guidepost"}', '[]', true, 110),
	('sign', 'Sign', 'information-circle', '#dc2626', 'navigation', '{"information":"sign"}', '[]', false, 120),
	('intersection', 'Intersection', 'git-merge', '#f97316', 'navigation', '{"highway":"crossing"}', '[]', false, 130),
	-- Hazards & Obstacles
	('fallen_tree', 'Fallen Tree', 'warning', '#dc2626', 'hazards_obstacles', '{"hazard":"fallen_tree"}', '[{"key":"passable","type":"select","label":"Passable","options":[{"value":"yes","label":"Yes"},{"value":"duck_under","label":"Duck under"},{"value":"climb","label":"Climb over"},{"value":"no","label":"No"}]}]', true, 140),
	('washout', 'Washout', 'warning', '#dc2626', 'hazards_obstacles', '{"hazard":"washout"}', '[{"key":"passable","type":"boolean","label":"Passable on foot"}]', true, 150),
	('steep_section', 'Steep Section', 'trending-up', '#f59e0b', 'hazards_obstacles', '{"hazard":"steep"}', '[{"key":"handline","type":"boolean","label":"Handline/cable"}]', true, 160),
	('road_connector', 'Road Connector', 'car-sport', '#888888', 'hazards_obstacles', '{"highway":"residential"}', '[{"key":"traffic","type":"select","label":"Traffic","options":[{"value":"light","label":"Light"},{"value":"moderate","label":"Moderate"},{"value":"heavy","label":"Heavy"}]},{"key":"sidewalk","type":"boolean","label":"Sidewalk present"}]', false, 170),
	-- Landmarks
	('viewpoint', 'Viewpoint', 'eye', '#f59e0b', 'landmarks', '{"tourism":"viewpoint"}', '[{"key":"panoramic","type":"boolean","label":"Panoramic"},{"key":"covered","type":"boolean","label":"Covered overlook"}]', true, 180),
	('notable_tree', 'Notable Tree', 'leaf', '#16a34a', 'landmarks', '{"natural":"tree","notable":"yes"}', '[]', true, 190),
	('waterfall', 'Waterfall', 'rainy', '#3b82f6', 'landmarks', '{"waterway":"waterfall"}', '[{"key":"flow","type":"select","label":"Flow","options":[{"value":"trickle","label":"Trickle"},{"value":"moderate","label":"Moderate"},{"value":"heavy","label":"Heavy"},{"value":"seasonal","label":"Seasonal"}]}]', true, 200),
	('cave_entrance', 'Cave Entrance', 'moon', '#475569', 'landmarks', '{"natural":"cave_entrance"}', '[]', true, 210),
	('bridge', 'Bridge', 'git-network', '#7c3aed', 'landmarks', '{"bridge":"yes"}', '[{"key":"material","type":"select","label":"Material","options":[{"value":"wood","label":"Wood"},{"value":"steel","label":"Steel"},{"value":"concrete","label":"Concrete"},{"value":"stone","label":"Stone"}]}]', true, 220),
	('tunnel', 'Tunnel', 'subway', '#475569', 'landmarks', '{"tunnel":"yes"}', '[{"key":"lighted","type":"boolean","label":"Lit"}]', true, 230);
--> statement-breakpoint

-- Backfill: link legacy features.type_tag to the matching preset by key.
-- Safe no-op when there are no legacy rows or no matching preset.
UPDATE "features" f
SET "preset_id" = p.id
FROM "presets" p
WHERE f.type_tag = p.key
  AND f.preset_id IS NULL;
