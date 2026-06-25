import { describe, expect, test } from "bun:test";
import {
  effectiveProtection,
  isModerator,
  minTierForProtection,
  canWrite,
  canDelete,
} from "../src/services/protection.js";
import {
  PROTECTION_SEMI_UPVOTE_THRESHOLD,
  PROTECTION_SEMI_CHILDREN_THRESHOLD,
  PROTECTION_FULL_UPVOTE_THRESHOLD,
} from "@magnum/shared/constants";

describe("effectiveProtection", () => {
  test("normal by default", () => {
    expect(
      effectiveProtection({ targetType: "system", targetId: "x", upvotes: 0, children: 0 }),
    ).toBe("normal");
  });

  test("auto-promotes to semi at upvote threshold", () => {
    expect(
      effectiveProtection({
        targetType: "system",
        targetId: "x",
        upvotes: PROTECTION_SEMI_UPVOTE_THRESHOLD,
        children: 0,
      }),
    ).toBe("semi");
  });

  test("auto-promotes to semi at children threshold", () => {
    expect(
      effectiveProtection({
        targetType: "system",
        targetId: "x",
        upvotes: 0,
        children: PROTECTION_SEMI_CHILDREN_THRESHOLD,
      }),
    ).toBe("semi");
  });

  test("auto-promotes to full at full upvote threshold", () => {
    expect(
      effectiveProtection({
        targetType: "system",
        targetId: "x",
        upvotes: PROTECTION_FULL_UPVOTE_THRESHOLD,
        children: 0,
      }),
    ).toBe("full");
  });

  test("moderator-pinned 'full' sticks even with low stats", () => {
    expect(
      effectiveProtection({
        targetType: "system",
        targetId: "x",
        upvotes: 0,
        children: 0,
        storedLevel: "full",
      }),
    ).toBe("full");
  });

  test("moderator-pinned 'semi' sticks even with low stats", () => {
    expect(
      effectiveProtection({
        targetType: "system",
        targetId: "x",
        upvotes: 0,
        children: 0,
        storedLevel: "semi",
      }),
    ).toBe("semi");
  });

  test("full upvote threshold beats stored 'semi'", () => {
    expect(
      effectiveProtection({
        targetType: "system",
        targetId: "x",
        upvotes: PROTECTION_FULL_UPVOTE_THRESHOLD,
        children: 0,
        storedLevel: "semi",
      }),
    ).toBe("full");
  });
});

describe("isModerator", () => {
  test("admin and moderator roles count", () => {
    expect(isModerator("admin")).toBe(true);
    expect(isModerator("moderator")).toBe(true);
  });
  test("contributor and null do not", () => {
    expect(isModerator("contributor")).toBe(false);
    expect(isModerator(null)).toBe(false);
    expect(isModerator(undefined)).toBe(false);
  });
});

describe("minTierForProtection", () => {
  test("full requires moderator", () => {
    expect(minTierForProtection("full")).toBe("moderator");
  });
  test("semi requires established", () => {
    expect(minTierForProtection("semi")).toBe("established");
  });
  test("normal requires nothing", () => {
    expect(minTierForProtection("normal")).toBe("new");
  });
});

describe("canWrite", () => {
  test("logged-out never can write", () => {
    expect(canWrite("normal", { loggedIn: false })).toBe(false);
  });

  test("any logged-in can write to normal", () => {
    expect(canWrite("normal", { loggedIn: true, karma: 0 })).toBe(true);
  });

  test("New tier cannot write to semi", () => {
    expect(canWrite("semi", { loggedIn: true, karma: 10 })).toBe(false);
  });

  test("Established (50 karma) can write to semi", () => {
    expect(canWrite("semi", { loggedIn: true, karma: 50 })).toBe(true);
  });

  test("Trusted (500 karma) can write to semi", () => {
    expect(canWrite("semi", { loggedIn: true, karma: 500 })).toBe(true);
  });

  test("Established cannot write to full", () => {
    expect(canWrite("full", { loggedIn: true, karma: 100, role: "contributor" })).toBe(false);
  });

  test("Moderator can write to anything", () => {
    expect(canWrite("full", { loggedIn: true, karma: 0, role: "admin" })).toBe(true);
    expect(canWrite("full", { loggedIn: true, karma: 0, role: "moderator" })).toBe(true);
  });
});

describe("canDelete", () => {
  test("hard rule: cannot delete system with >=2 children you did not create (non-mod)", () => {
    const result = canDelete(
      "normal",
      { loggedIn: true, karma: 0, role: "contributor", isCreator: false },
      2,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("multiple trails");
  });

  test("creator can always delete (even with children)", () => {
    const result = canDelete(
      "normal",
      { loggedIn: true, karma: 0, role: "contributor", isCreator: true },
      100,
    );
    expect(result.ok).toBe(true);
  });

  test("moderator can delete with children they did not create", () => {
    const result = canDelete(
      "full",
      { loggedIn: true, karma: 0, role: "admin", isCreator: false },
      100,
    );
    expect(result.ok).toBe(true);
  });

  test("New user can delete their own empty system", () => {
    const result = canDelete(
      "normal",
      { loggedIn: true, karma: 0, role: "contributor", isCreator: true },
      0,
    );
    expect(result.ok).toBe(true);
  });
});
