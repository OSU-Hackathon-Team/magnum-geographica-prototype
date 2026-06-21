import { describe, expect, test } from "bun:test";
import {
  systemSchema,
  trailSchema,
  searchQuerySchema,
  createSystemInputSchema,
} from "@magnum/shared";

const baseSystem = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Hocking Hills",
  slug: "hocking-hills",
  created_at: "2026-06-21T00:00:00.000Z",
  updated_at: "2026-06-21T00:00:00.000Z",
};

describe("zod schemas", () => {
  test("systemSchema accepts a valid system", () => {
    expect(systemSchema.safeParse(baseSystem).success).toBe(true);
  });

  test("systemSchema rejects missing required name", () => {
    const result = systemSchema.safeParse({ ...baseSystem, name: "" });
    expect(result.success).toBe(false);
  });

  test("trailSchema accepts a trail without optional fields", () => {
    const trail = {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Buckeye",
      slug: "buckeye",
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    };
    expect(trailSchema.safeParse(trail).success).toBe(true);
  });

  test("searchQuerySchema requires q and defaults type to 'all'", () => {
    const parsed = searchQuerySchema.parse({ q: "hocking" });
    expect(parsed.q).toBe("hocking");
    expect(parsed.type).toBe("all");
    expect(parsed.limit).toBe(20);
  });

  test("createSystemInputSchema allows description to be omitted", () => {
    const input = { name: "Test", slug: "test" };
    const parsed = createSystemInputSchema.parse(input);
    expect(parsed.name).toBe("Test");
    expect(parsed.slug).toBe("test");
  });
});
