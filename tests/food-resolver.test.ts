import { expect, it } from "vitest";
import { foods } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
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

it("seeds stable curated staples in SQLite without duplication", async () => {
  const { seedFoods } = await import("@/db/seed-foods");
  const { db, client } = await createTestDb();
  try {
    await seedFoods(db);
    const first = await db.select().from(foods);
    expect(first.length).toBeGreaterThanOrEqual(85);
    for (const row of first) {
      expect(row.userId).toBeNull();
      expect(row.source).toBe("curated");
      expect(row.aliasesJson.length).toBeGreaterThan(0);
      expect(foodProfileSchema.safeParse({
        name: row.name, aliases: row.aliasesJson, defaultUnit: row.defaultUnit,
        nutrientsPer100: row.nutrientsPer100Json,
      }).success).toBe(true);
    }
    expect(first.find((row) => row.name === "Banana")?.nutrientsPer100Json).toMatchObject({
      potassium: 358, totalSugars: 12.23, vitaminC: 8.7,
    });
    expect(first.find((row) => row.name === "Chia seeds")?.nutrientsPer100Json)
      .not.toHaveProperty("totalSugars");
    expect(first.find((row) => row.aliasesJson.includes("doodh"))).toMatchObject({
      defaultUnit: "ml", nutrientsPer100Json: { calcium: 116.39 },
    });
    await seedFoods(db);
    expect((await db.select().from(foods)).map(({ id }) => id).sort()).toEqual(first.map(({ id }) => id).sort());
  } finally {
    client.close();
  }
});

it("seeds at least 110 real foods including regional aliases and recipe profiles", async () => {
  const { seedFoods } = await import("@/db/seed-foods");
  const { scaleFoodNutrients } = await import("@/lib/nutrients/calculator");
  const { db, client } = await createTestDb();
  try {
    await seedFoods(db);
    const rows = await db.select().from(foods);
    expect(rows.length).toBeGreaterThanOrEqual(110);
    expect(new Set(rows.map((row) => normalizeFoodText(row.name))).size).toBe(rows.length);
    for (const alias of ["roti", "chapati", "idli", "dal", "dahi", "palak", "bhindi masala", "khichri"]) {
      expect(rows.some((row) => row.aliasesJson.includes(alias)), alias).toBe(true);
    }
    const dal = rows.find((row) => row.aliasesJson.includes("dal"))!;
    expect(dal.nutrientsPer100Json.sodium).toBeGreaterThan(150);
    expect(scaleFoodNutrients({
      defaultUnit: dal.defaultUnit, nutrientsPer100: dal.nutrientsPer100Json,
    }, 50, "g").sodium).toBeCloseTo(dal.nutrientsPer100Json.sodium / 2, 10);
    expect(rows.find((row) => row.aliasesJson.includes("sambhar"))?.nutrientsPer100Json)
      .not.toHaveProperty("totalSugars");
    expect(rows.find((row) => row.aliasesJson.includes("chai"))).toMatchObject({
      defaultUnit: "ml", nutrientsPer100Json: { addedSugars: 3.992 },
    });
  } finally {
    client.close();
  }
});
