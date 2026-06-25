-- Phase 1 (§21.7/§21.8): Karma, votes, trust tiers, protection, patrol, generalized revisions.
-- Non-destructive: only adds nullable columns and new tables.

-- ========== Generalize revisions ==========

-- Make wiki_page_id nullable so we can store revisions for non-wiki entities.
ALTER TABLE "revisions" ALTER COLUMN "wiki_page_id" DROP NOT NULL;
--> statement-breakpoint

-- Make content_md nullable (entity revisions store payload_after instead).
ALTER TABLE "revisions" ALTER COLUMN "content_md" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "revisions" ADD COLUMN "target_type" text;
--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "target_id" uuid;
--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "action" text DEFAULT 'update' NOT NULL;
--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "payload_before" jsonb;
--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "payload_after" jsonb;
--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "reverted_from_id" uuid;
--> statement-breakpoint

CREATE INDEX "idx_revisions_target" ON "revisions" USING btree ("target_type","target_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_revisions_author" ON "revisions" USING btree ("author_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_revisions_action" ON "revisions" USING btree ("action","created_at");
--> statement-breakpoint

-- ========== Votes ==========

CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid,
	"value" integer NOT NULL,
	"voter_karma" double precision DEFAULT 0 NOT NULL,
	"voter_tier" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "idx_votes_user_target" ON "votes" USING btree ("target_type","target_id","user_id");
--> statement-breakpoint
CREATE INDEX "idx_votes_target" ON "votes" USING btree ("target_type","target_id");
--> statement-breakpoint

-- ========== Entity stats (cached tallies) ==========

CREATE TABLE "entity_stats" (
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"net" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_stats_target_type_target_id_pk" PRIMARY KEY("target_type","target_id")
);
--> statement-breakpoint

-- ========== Entity protection ==========

CREATE TABLE "entity_protection" (
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"level" text DEFAULT 'normal' NOT NULL,
	"upvotes_at" integer DEFAULT 0 NOT NULL,
	"children_at" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_protection_target_type_target_id_pk" PRIMARY KEY("target_type","target_id")
);
--> statement-breakpoint

-- ========== Patrol flags ==========

CREATE TABLE "patrol_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_patrol_resolved" ON "patrol_flags" USING btree ("resolved","created_at");
--> statement-breakpoint
CREATE INDEX "idx_patrol_revision" ON "patrol_flags" USING btree ("revision_id");
--> statement-breakpoint

-- ========== Trails: tier + author ==========

ALTER TABLE "trails" ADD COLUMN "tier" text DEFAULT 'synthesized' NOT NULL;
--> statement-breakpoint
ALTER TABLE "trails" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint

-- ========== Features: author + hidden ==========

ALTER TABLE "features" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "contributor_name" text DEFAULT 'anonymous' NOT NULL;
--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- ========== Systems: author + hidden ==========

ALTER TABLE "systems" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "contributor_name" text DEFAULT 'anonymous' NOT NULL;
--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
