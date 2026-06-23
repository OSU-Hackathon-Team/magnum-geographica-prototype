ALTER TABLE "super_systems" ADD COLUMN "boundary" geometry(MultiPolygon, 4326);--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "color" text DEFAULT '#22c55e' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_super_systems_boundary" ON "super_systems" USING gist ("boundary");
