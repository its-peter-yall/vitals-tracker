import { expect, it } from "vitest";
import {
  foodProfileSchema, normalizeFoodText, resolveRequestSchema, saveFoodSchema, searchQuerySchema,
} from "@/lib/foods/schemas";

it("validates sparse canonical food profiles and strict requests", () => {
  const profile = {
    name: " Drink ", defaultUnit: "ml", nutrientsPer100: { protein: 0, sodium: 42, vitaminB9: 5 },
  };
  expect(foodProfileSchema.parse(profile)).toEqual({ ...profile, name: "Drink", aliases: [] });
  for (const nutrientsPer100 of [
    {}, { salt: 1 }, { sodium: "42" }, { sodium: -1 }, { sodium: Infinity }, { water: 1000 },
    { addedSugars: 3, totalSugars: 2 }, JSON.parse('{"__proto__":1,"protein":2}'),
  ]) {
    expect(foodProfileSchema.safeParse({ ...profile, nutrientsPer100 }).success).toBe(false);
  }
  expect(saveFoodSchema.safeParse({ ...profile, source: "manual", confirmed: true }).success).toBe(true);
  for (const extra of [
    { userId: "other" }, { source: "curated" }, { confirmed: false }, { id: "target" },
  ]) {
    expect(saveFoodSchema.safeParse({ ...profile, confirmed: true, source: "manual", ...extra }).success)
      .toBe(false);
  }
  expect(searchQuerySchema.parse("  ")).toBe("");
  expect(resolveRequestSchema.safeParse({ query: "!!!" }).success).toBe(false);
  expect(resolveRequestSchema.safeParse({ query: "a".repeat(101) }).success).toBe(false);
  expect(normalizeFoodText("  Crème–Brûlée!  ")).toBe("creme brulee");
  expect(normalizeFoodText("दही")).toBe("दही".normalize("NFKD"));
});
