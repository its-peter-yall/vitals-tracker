import { beforeEach, expect, it, vi } from "vitest";
import { foods } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import {
  foodProfileSchema, normalizeFoodText, resolveRequestSchema, saveFoodSchema, searchQuerySchema,
} from "@/lib/foods/schemas";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected fetch in test")));
});

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

const offProduct = {
  product_name: "Example cocoa drink",
  product_quantity_unit: "ml",
  nutriments: {
    proteins_100g: 2, sugars_100g: 8, sodium_100g: 0.08, sodium_unit: "mg",
    salt_100g: 0.9, fat_100g: 2.5, fiber_serving: 1,
  },
};
const offSearch = (...products: unknown[]) => Response.json({ products });
const hostOf = (input: Parameters<typeof fetch>[0]) =>
  new URL(input instanceof Request ? input.url : String(input)).hostname;

it("reads OFF basis and standard units, uses a real User-Agent, and memoizes per caller for 24h", async () => {
  const { createOpenFoodFactsLookup } = await import("@/lib/foods/open-api");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://care.example.test/add-food");
  let now = 1_000_000;
  const lookup = createOpenFoodFactsLookup(() => now);
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
    offSearch({ ...offProduct, product_name: "Unrelated lemonade" }, offProduct));
  vi.stubGlobal("fetch", fetchMock);
  const draft = await lookup("user-a", "cocoa drink");
  expect(draft).toEqual({
    provider: "open_food_facts", label: "Open Food Facts", estimated: false,
    name: "Example cocoa drink", aliases: ["cocoa drink"], defaultUnit: "ml",
    nutrientsPer100: { protein: 2, totalSugars: 8, sodium: 80 },
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(new URL(String(url)).searchParams.get("search_terms")).toBe("cocoa drink");
  expect(new Headers(init?.headers).get("user-agent")).toBe("VitalsTracker/1.0 (https://care.example.test)");
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  expect(await lookup("user-a", " Cocoa Drink ")).toEqual(draft);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await lookup("user-b", "cocoa drink");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  now += 86_400_000;
  await lookup("user-a", "cocoa drink");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("caps OFF at 10 searches and 15 barcode reads per rolling minute including retries", async () => {
  const { createOpenFoodFactsLookup } = await import("@/lib/foods/open-api");
  let now = 1_000_000;
  const lookup = createOpenFoodFactsLookup(() => now);
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockImplementation(async (url) => String(url).includes("/product/")
      ? Response.json({ status: 1, product: {
        product_name: "Pantry sauce", nutriments: { salt_100g: 0.3, sodium_100g: -1 },
      } }) : offSearch());
  vi.stubGlobal("fetch", fetchMock);
  for (let i = 0; i < 12; i++) await lookup(i % 2 === 0 ? "a" : "b", `unknown ${i}`);
  expect(fetchMock).toHaveBeenCalledTimes(10);
  expect(String(fetchMock.mock.calls[1][0])).toBe(String(fetchMock.mock.calls[0][0]));
  const product = await lookup("a", "0123456789012");
  expect(product).toMatchObject({
    aliases: ["0123456789012"], defaultUnit: "g", nutrientsPer100: { sodium: 120 },
  });
  for (let i = 0; i < 15; i++) await lookup("a", `11234567890${String(i).padStart(2, "0")}`);
  expect(fetchMock).toHaveBeenCalledTimes(25);
  now += 59_999;
  expect(await lookup("a", "last search")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(25);
  now++;
  await lookup("a", "last search");
  expect(fetchMock).toHaveBeenCalledTimes(26);
});
