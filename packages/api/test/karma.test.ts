import { describe, expect, test } from "bun:test";
import {
  tierFromKarma,
  tierLabel,
  tierWeight,
  traceWeight,
  isTraceIgnored,
  isEntityHidden,
  karmaDelta,
  authorColumn,
  contributorNameColumn,
  targetTable,
} from "../src/services/karma.js";
import { TRUST_TIER_THRESHOLDS, TIER_WEIGHTS, TIER_LABELS, ENTITY_HIDE_NET_SCORE_THRESHOLD, TRACE_WEIGHT_FLOOR } from "@magnum/shared/constants";

describe("tierFromKarma", () => {
  test("0 karma is new", () => {
    expect(tierFromKarma(0)).toBe("new");
  });
  test("49 karma is new", () => {
    expect(tierFromKarma(TRUST_TIER_THRESHOLDS.established - 1)).toBe("new");
  });
  test("50 karma is established", () => {
    expect(tierFromKarma(TRUST_TIER_THRESHOLDS.established)).toBe("established");
  });
  test("499 karma is established", () => {
    expect(tierFromKarma(TRUST_TIER_THRESHOLDS.trusted - 1)).toBe("established");
  });
  test("500 karma is trusted", () => {
    expect(tierFromKarma(TRUST_TIER_THRESHOLDS.trusted)).toBe("trusted");
  });
  test("negative karma is new", () => {
    expect(tierFromKarma(-100)).toBe("new");
  });
});

describe("tierLabel and tierWeight", () => {
  test("labels are stable", () => {
    expect(tierLabel("new")).toBe(TIER_LABELS.new);
    expect(tierLabel("established")).toBe(TIER_LABELS.established);
    expect(tierLabel("trusted")).toBe(TIER_LABELS.trusted);
    expect(tierLabel("moderator")).toBe(TIER_LABELS.moderator);
  });
  test("weights are stable", () => {
    expect(tierWeight("new")).toBe(TIER_WEIGHTS.new);
    expect(tierWeight("established")).toBe(TIER_WEIGHTS.established);
    expect(tierWeight("trusted")).toBe(TIER_WEIGHTS.trusted);
    expect(tierWeight("moderator")).toBe(TIER_WEIGHTS.moderator);
  });
  test("trusted and moderator have equal weight (moderator tier doesn't double-dip)", () => {
    expect(tierWeight("trusted")).toBe(tierWeight("moderator"));
  });
});

describe("traceWeight", () => {
  test("Wilson formula: (up+1-down)/(up+down+2)", () => {
    // up=10, down=0: (11)/(12) ≈ 0.917
    expect(traceWeight(10, 0)).toBeCloseTo(11 / 12, 5);
    // up=0, down=10: (-9)/(12) = -0.75
    expect(traceWeight(0, 10)).toBeCloseTo(-9 / 12, 5);
    // up=0, down=0: (1)/(2) = 0.5 (sane default)
    expect(traceWeight(0, 0)).toBeCloseTo(0.5, 5);
  });
  test("floors at 0 — negative counts clamp to 0", () => {
    expect(traceWeight(-1, 0)).toBe(0.5);
  });
  test("isTraceIgnored respects the floor constant (strict less-than)", () => {
    expect(isTraceIgnored(0.29)).toBe(true);
    expect(isTraceIgnored(TRACE_WEIGHT_FLOOR - 0.01)).toBe(true);
    // The floor itself is the boundary; strictly below is ignored, at-or-above is not.
    expect(isTraceIgnored(TRACE_WEIGHT_FLOOR)).toBe(false);
    expect(isTraceIgnored(0.31)).toBe(false);
  });
});

describe("isEntityHidden", () => {
  test("net <= threshold hides", () => {
    expect(isEntityHidden(ENTITY_HIDE_NET_SCORE_THRESHOLD)).toBe(true);
    expect(isEntityHidden(ENTITY_HIDE_NET_SCORE_THRESHOLD - 1)).toBe(true);
  });
  test("net > threshold is visible", () => {
    expect(isEntityHidden(ENTITY_HIDE_NET_SCORE_THRESHOLD + 1)).toBe(false);
  });
});

describe("karmaDelta", () => {
  test("new upvote = +1", () => {
    expect(karmaDelta(1, "new")).toBe(1);
  });
  test("new downvote = -1", () => {
    expect(karmaDelta(-1, "new")).toBe(-1);
  });
  test("trusted upvote = +3 (scaled by tier)", () => {
    expect(karmaDelta(1, "trusted")).toBe(3);
  });
  test("trusted downvote = -3", () => {
    expect(karmaDelta(-1, "trusted")).toBe(-3);
  });
});

describe("target table/column helpers", () => {
  test("targetTable maps known types to table names", () => {
    expect(targetTable("feature")).toBe("features");
    expect(targetTable("system")).toBe("systems");
    expect(targetTable("trail")).toBe("trails");
    expect(targetTable("wiki_page")).toBe("wiki_pages");
  });

  test("authorColumn returns created_by_user_id for known types", () => {
    expect(authorColumn("feature")).toBe("created_by_user_id");
    expect(authorColumn("system")).toBe("created_by_user_id");
    expect(authorColumn("trail")).toBe("created_by_user_id");
    expect(authorColumn("trace")).toBe("user_id");
    expect(authorColumn("preset")).toBe("created_by");
  });

  test("authorColumn returns null for wiki pages (no single author)", () => {
    expect(authorColumn("wiki_page")).toBe(null);
  });

  test("contributorNameColumn returns the right name where set", () => {
    expect(contributorNameColumn("feature")).toBe("contributor_name");
    expect(contributorNameColumn("system")).toBe("contributor_name");
    expect(contributorNameColumn("trace")).toBe("contributor_name");
    expect(contributorNameColumn("trail")).toBe(null);
  });
});
