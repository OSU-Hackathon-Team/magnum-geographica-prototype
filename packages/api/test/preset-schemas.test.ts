import { describe, expect, test } from "bun:test";
import {
  createPresetInputSchema,
  updatePresetInputSchema,
  validateAnswers,
} from "@magnum/shared/schemas";

const benchQuestions = [
  { key: "material", type: "select" as const, label: "Material", options: [
    { value: "wood", label: "Wood" },
    { value: "metal", label: "Metal" },
  ] },
  { key: "backrest", type: "boolean" as const, label: "Has backrest" },
];

describe("createPresetInputSchema", () => {
  test("accepts a minimal preset", () => {
    const parsed = createPresetInputSchema.safeParse({
      key: "bench",
      label: "Bench",
      icon_name: "cafe",
      icon_color: "#8B4513",
      category: "rest_shelter",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects more than 5 questions", () => {
    const parsed = createPresetInputSchema.safeParse({
      key: "x",
      label: "X",
      icon_name: "ellipse",
      icon_color: "#000",
      category: "landmarks",
      questions: Array.from({ length: 6 }, (_, i) => ({
        key: `q${i}`,
        type: "boolean",
        label: `Q${i}`,
      })),
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects a select question with more than 5 options", () => {
    const parsed = createPresetInputSchema.safeParse({
      key: "x",
      label: "X",
      icon_name: "ellipse",
      icon_color: "#000",
      category: "landmarks",
      questions: [
        {
          key: "many",
          type: "select",
          label: "Many",
          options: Array.from({ length: 6 }, (_, i) => ({ value: `o${i}`, label: `O${i}` })),
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects non-snake_case preset key", () => {
    const parsed = createPresetInputSchema.safeParse({
      key: "Not-Snake",
      label: "X",
      icon_name: "ellipse",
      icon_color: "#000",
      category: "landmarks",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("updatePresetInputSchema", () => {
  test("accepts a partial update", () => {
    const parsed = updatePresetInputSchema.safeParse({ label: "Renamed" });
    expect(parsed.success).toBe(true);
  });
});

describe("validateAnswers", () => {
  test("returns ok for empty answers", () => {
    const v = validateAnswers(benchQuestions, {});
    expect(v.ok).toBe(true);
  });

  test("returns ok for valid answers", () => {
    const v = validateAnswers(benchQuestions, { material: "wood", backrest: true });
    expect(v.ok).toBe(true);
  });

  test("rejects a non-boolean for a boolean question", () => {
    const v = validateAnswers(benchQuestions, { backrest: "yes" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors[0]).toContain("backrest");
    }
  });

  test("rejects a value not in the select options", () => {
    const v = validateAnswers(benchQuestions, { material: "plastic" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors[0]).toContain("material");
      expect(v.errors[0]).toContain("wood");
    }
  });

  test("rejects a non-string for a select question", () => {
    const v = validateAnswers(benchQuestions, { material: 5 });
    expect(v.ok).toBe(false);
  });

  test("treats missing answers as optional", () => {
    const v = validateAnswers(benchQuestions, { backrest: false });
    expect(v.ok).toBe(true);
  });
});
