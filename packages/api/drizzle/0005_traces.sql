-- Phase 4 (§21.6): GPS trace ingestion.
-- Adds gps_traces, trace_systems (auto-tag join), gps_trace_segments
-- (server-cut pieces), trace_segment_votes (wiki-style marking), and
-- synthesis_runs (audit history).

-- ========== gps_traces ==========

CREATE TABLE "gps_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"contributor_name" text DEFAULT 'anonymous' NOT NULL,
	"geometry" geometry(MultiLineString, 4326) NOT NULL,
	"source" text NOT NULL,
	"weight" double precision DEFAULT 1.0 NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_gps_traces_geom" ON "gps_traces" USING gist ("geometry");
--> statement-breakpoint
CREATE INDEX "idx_gps_traces_user" ON "gps_traces" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_gps_traces_status" ON "gps_traces" USING btree ("status","created_at");
--> statement-breakpoint

-- ========== trace_systems (auto-tag) ==========

CREATE TABLE "trace_systems" (
	"trace_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	CONSTRAINT "trace_systems_trace_id_system_id_pk" PRIMARY KEY("trace_id","system_id")
);
--> statement-breakpoint
ALTER TABLE "trace_systems" ADD CONSTRAINT "trace_systems_trace_id_gps_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."gps_traces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trace_systems" ADD CONSTRAINT "trace_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ========== gps_trace_segments ==========

CREATE TABLE "gps_trace_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"geometry" geometry(MultiLineString, 4326) NOT NULL,
	"cluster_id" integer,
	"proposed_trail_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gps_trace_segments" ADD CONSTRAINT "gps_trace_segments_trace_id_gps_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."gps_traces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gps_trace_segments" ADD CONSTRAINT "gps_trace_segments_proposed_trail_id_trails_id_fk" FOREIGN KEY ("proposed_trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_segments_trace" ON "gps_trace_segments" USING btree ("trace_id");
--> statement-breakpoint
CREATE INDEX "idx_segments_cluster" ON "gps_trace_segments" USING btree ("cluster_id");
--> statement-breakpoint

-- ========== trace_segment_votes ==========

CREATE TABLE "trace_segment_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"user_id" uuid,
	"trail_id" uuid,
	"vote" integer NOT NULL,
	"contributor_name" text DEFAULT 'anonymous' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trace_segment_votes" ADD CONSTRAINT "trace_segment_votes_segment_id_gps_trace_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."gps_trace_segments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trace_segment_votes" ADD CONSTRAINT "trace_segment_votes_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_segment_votes_user" ON "trace_segment_votes" USING btree ("segment_id","user_id");
--> statement-breakpoint
CREATE INDEX "idx_segment_votes_segment" ON "trace_segment_votes" USING btree ("segment_id");
--> statement-breakpoint

-- ========== synthesis_runs ==========

CREATE TABLE "synthesis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trails_updated" integer DEFAULT 0 NOT NULL,
	"trails_proposed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "synthesis_runs" ADD CONSTRAINT "synthesis_runs_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_synthesis_system" ON "synthesis_runs" USING btree ("system_id","started_at");
--> statement-breakpoint
