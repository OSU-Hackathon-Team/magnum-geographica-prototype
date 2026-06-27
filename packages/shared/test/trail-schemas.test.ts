import { describe, test, expect } from "bun:test";
import {
  trailSchema,
  updateTrailInputSchema,
  traceSegmentVoteInputSchema,
} from "../src/index.js";

describe("trailSchema (extended)", () => {
  const baseTrail = {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Buckeye Trail",
    slug: "buckeye-trail",
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
  };

  test("accepts a trail with all provenance fields", () => {
    const result = trailSchema.safeParse({
      ...baseTrail,
      tier: "premium",
      source: "NPS",
      source_date: "2024-01-01",
      external_url: "https://example.com/trail",
      last_synthesized_at: "2026-06-21T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  test("accepts a trail without provenance (backward compat)", () => {
    const result = trailSchema.safeParse(baseTrail);
    expect(result.success).toBe(true);
  });

  test("accepts valid tiers", () => {
    for (const tier of ["premium", "elevated", "synthesized"] as const) {
      const result = trailSchema.safeParse({ ...baseTrail, tier });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid tier", () => {
    const result = trailSchema.safeParse({ ...baseTrail, tier: "invalid" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid external_url", () => {
    const result = trailSchema.safeParse({ ...baseTrail, external_url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

describe("updateTrailInputSchema", () => {
  test("accepts name only", () => {
    const result = updateTrailInputSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  test("accepts description nullable", () => {
    const result = updateTrailInputSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
  });

  test("accepts difficulty", () => {
    const result = updateTrailInputSchema.safeParse({ difficulty: "easy" });
    expect(result.success).toBe(true);
  });

  test("accepts provenance fields", () => {
    const result = updateTrailInputSchema.safeParse({
      source: "NPS",
      source_date: "2024-01-01",
      external_url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  test("accepts nullable provenance", () => {
    const result = updateTrailInputSchema.safeParse({
      source: null,
      source_date: null,
      external_url: null,
    });
    expect(result.success).toBe(true);
  });

  test("accepts all fields together", () => {
    const result = updateTrailInputSchema.safeParse({
      name: "New Name",
      description: "Updated description",
      difficulty: "moderate",
      length_meters: 5000,
      elevation_gain_meters: 100,
      verified: true,
      source: "USFS",
      source_date: "2025-01-01",
      external_url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty patch via refine", () => {
    const result = updateTrailInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects unknown fields via strict", () => {
    const result = updateTrailInputSchema.safeParse({ name: "Ok", bogus: true });
    expect(result.success).toBe(false);
  });

  test("rejects invalid difficulty", () => {
    const result = updateTrailInputSchema.safeParse({ difficulty: "extreme" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid external_url", () => {
    const result = updateTrailInputSchema.safeParse({ external_url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

describe("traceSegmentVoteInputSchema", () => {
  test("accepts trail_id=null (propose new)", () => {
    const result = traceSegmentVoteInputSchema.safeParse({ trail_id: null });
    expect(result.success).toBe(true);
  });

  test("accepts trail_id=UUID + vote=1 (agree)", () => {
    const result = traceSegmentVoteInputSchema.safeParse({
      trail_id: "00000000-0000-4000-a000-000000000001",
      vote: 1,
    });
    expect(result.success).toBe(true);
  });

  test("accepts trail_id=UUID + vote=-1 (disagree)", () => {
    const result = traceSegmentVoteInputSchema.safeParse({
      trail_id: "00000000-0000-4000-a000-000000000001",
      vote: -1,
    });
    expect(result.success).toBe(true);
  });

  test("accepts trail_id=null + vote=1 (propose new, explicit)", () => {
    const result = traceSegmentVoteInputSchema.safeParse({ trail_id: null, vote: 1 });
    expect(result.success).toBe(true);
  });

  test("rejects vote=0", () => {
    const result = traceSegmentVoteInputSchema.safeParse({
      trail_id: "00000000-0000-4000-a000-000000000001",
      vote: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects vote=2", () => {
    const result = traceSegmentVoteInputSchema.safeParse({
      trail_id: "00000000-0000-4000-a000-000000000001",
      vote: 2,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid UUID for trail_id", () => {
    const result = traceSegmentVoteInputSchema.safeParse({ trail_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  test("rejects unknown fields via strict", () => {
    const result = traceSegmentVoteInputSchema.safeParse({
      trail_id: null,
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  test("accepts just trail_id with no vote (route defaults to +1)", () => {
    const result = traceSegmentVoteInputSchema.safeParse({
      trail_id: "00000000-0000-4000-a000-000000000001",
    });
    expect(result.success).toBe(true);
  });
});
