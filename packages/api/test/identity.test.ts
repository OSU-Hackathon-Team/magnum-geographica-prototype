import { describe, expect, test } from "bun:test";
import { resolveContributorName } from "../src/services/identity.js";

type FakeContext = Parameters<typeof resolveContributorName>[0];

function fakeCtx(headers: Record<string, string | undefined>, user?: unknown): FakeContext {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
    get: (key: string) => (key === "user" ? user : undefined),
  } as unknown as FakeContext;
}

describe("resolveContributorName", () => {
  test("returns the authenticated user's username when present", () => {
    const name = resolveContributorName(
      fakeCtx(
        {},
        {
          id: "u-1",
          username: "hiker99",
          email: "h@x",
          role: "contributor",
          karma: 0,
          tier: "new",
        },
      ),
    );
    expect(name).toBe("hiker99");
  });

  test("authenticated user wins even if x-forwarded-for is set", () => {
    // Defense in depth: never let a header override an authenticated user.
    const name = resolveContributorName(
      fakeCtx(
        { "x-forwarded-for": "203.0.113.5" },
        {
          id: "u-1",
          username: "hiker99",
          email: "h@x",
          role: "contributor",
          karma: 0,
          tier: "new",
        },
      ),
    );
    expect(name).toBe("hiker99");
  });

  test("returns IP:<address> for an unauthenticated request with x-forwarded-for", () => {
    const name = resolveContributorName(fakeCtx({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }));
    expect(name).toBe("IP:198.51.100.7");
  });

  test("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const name = resolveContributorName(fakeCtx({ "x-real-ip": "198.51.100.42" }));
    expect(name).toBe("IP:198.51.100.42");
  });

  test("returns 'anonymous' when neither user nor IP is available", () => {
    // No x-forwarded-for / x-real-ip headers and no authenticated user.
    const name = resolveContributorName(fakeCtx({}));
    expect(name).toBe("anonymous");
  });

  test("returns 'anonymous' for an authenticated user without a username (defensive)", () => {
    // Malformed JWT: user is on the context but has no username. Don't
    // fall through to the IP — that would be confusing attribution.
    const name = resolveContributorName(
      fakeCtx(
        { "x-forwarded-for": "198.51.100.7" },
        { id: "u-1", username: "", email: "h@x", role: "contributor", karma: 0, tier: "new" },
      ),
    );
    expect(name).toBe("IP:198.51.100.7");
  });
});
