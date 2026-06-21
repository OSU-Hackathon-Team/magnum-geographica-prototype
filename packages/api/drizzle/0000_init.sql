CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wiki_page_id" uuid NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"image_data" "bytea",
	"image_mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type_tag" text NOT NULL,
	"point" geometry(Point, 4326) NOT NULL,
	"trail_id" uuid,
	"system_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid,
	"trail_id" uuid,
	"system_id" uuid,
	"data" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"caption" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" uuid NOT NULL,
	"mbtiles_data" "bytea",
	"geojson_data" "bytea",
	"wiki_data" text,
	"tile_size_bytes" integer,
	"geojson_size_bytes" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wiki_page_id" uuid NOT NULL,
	"content_md" text NOT NULL,
	"contributor_name" text DEFAULT 'anonymous' NOT NULL,
	"author_id" uuid,
	"edit_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"system_id" uuid NOT NULL,
	"geometry" geometry(Geometry, 4326),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_systems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "super_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"official" boolean DEFAULT true NOT NULL,
	"description" text,
	"external_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "super_systems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "system_super_systems" (
	"system_id" uuid NOT NULL,
	"super_system_id" uuid NOT NULL,
	CONSTRAINT "system_super_systems_system_id_super_system_id_pk" PRIMARY KEY("system_id","super_system_id")
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"boundary" geometry(MultiPolygon, 4326),
	"ownership_source" text,
	"source_date" date,
	"description" text,
	"external_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "systems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "trail_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trail_id" uuid NOT NULL,
	"name" text,
	"geometry" geometry(MultiLineString, 4326) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"surface_type" text,
	"hazards" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_road_connector" boolean DEFAULT false NOT NULL,
	"steep_grade" boolean DEFAULT false NOT NULL,
	"one_way" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trail_sub_systems" (
	"trail_id" uuid NOT NULL,
	"sub_system_id" uuid NOT NULL,
	CONSTRAINT "trail_sub_systems_trail_id_sub_system_id_pk" PRIMARY KEY("trail_id","sub_system_id")
);
--> statement-breakpoint
CREATE TABLE "trail_systems" (
	"trail_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	CONSTRAINT "trail_systems_trail_id_system_id_pk" PRIMARY KEY("trail_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "trails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"geometry" geometry(MultiLineString, 4326),
	"description" text,
	"difficulty" text,
	"length_meters" double precision,
	"elevation_gain_meters" double precision,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trails_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"rendered_html" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_wiki_page_id_wiki_pages_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_packs" ADD CONSTRAINT "offline_packs_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_wiki_page_id_wiki_pages_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_systems" ADD CONSTRAINT "sub_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_super_systems" ADD CONSTRAINT "system_super_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_super_systems" ADD CONSTRAINT "system_super_systems_super_system_id_super_systems_id_fk" FOREIGN KEY ("super_system_id") REFERENCES "public"."super_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_segments" ADD CONSTRAINT "trail_segments_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_sub_systems" ADD CONSTRAINT "trail_sub_systems_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_sub_systems" ADD CONSTRAINT "trail_sub_systems_sub_system_id_sub_systems_id_fk" FOREIGN KEY ("sub_system_id") REFERENCES "public"."sub_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_systems" ADD CONSTRAINT "trail_systems_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_systems" ADD CONSTRAINT "trail_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_features_point" ON "features" USING gist ("point");--> statement-breakpoint
CREATE INDEX "idx_features_trail" ON "features" USING btree ("trail_id");--> statement-breakpoint
CREATE INDEX "idx_features_system" ON "features" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "idx_media_feature" ON "media" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_media_trail" ON "media" USING btree ("trail_id");--> statement-breakpoint
CREATE INDEX "idx_media_system" ON "media" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "idx_revisions_page" ON "revisions" USING btree ("wiki_page_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_systems_boundary" ON "systems" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "idx_segments_geometry" ON "trail_segments" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "idx_segments_trail" ON "trail_segments" USING btree ("trail_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_trails_geometry" ON "trails" USING gist ("geometry");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_wiki_pages_target" ON "wiki_pages" USING btree ("target_type","target_id");