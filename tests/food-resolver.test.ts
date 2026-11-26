import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { foods, intakeLogs, sessions, trackers, users } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { makeSession, SESSION_COOKIE } from "@/lib/auth/session";
import {
  foodProfileSchema, normalizeFoodText, resolveRequestSchema, saveFoodSchema, searchQuerySchema,
} from "@/lib/foods/schemas";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected fetch in test")));
});

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: vi.fn() };
});

let token: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => name === SESSION_COOKIE && token ? { name, value: token } : undefined,
  }),
}));

let routeFixture: Awaited<ReturnType<typeof createTestDb>> | undefined;
let lookupClock = 0;
const fixtureTime = "2026-11-26T08:00:00.000Z";

afterEach(() => {
  token = undefined;
  routeFixture?.client.close();
  routeFixture = undefined;
  vi.mocked(getDb).mockReset();
});

async function setupFoodRoutes() {
  // Stub only Date, not timers. Separate OFF module budgets/memos by >24h between route tests.
  vi.setSystemTime(new Date(Date.parse(fixtureTime) + lookupClock++ * 2 * 86_400_000));
  const { db, client } = await createTestDb();
  routeFixture = { db, client };
  vi.mocked(getDb).mockResolvedValue(db);
  const [alice, bob] = await db.insert(users).values([
    { email: "alice@example.test", name: "Alice", passwordHash: "unused", createdAt: fixtureTime },
    { email: "bob@example.test", name: "Bob", passwordHash: "unused", createdAt: fixtureTime },
  ]).returning();
  const a = makeSession(alice.id);
  const b = makeSession(bob.id);
  await db.insert(sessions).values([a.row, b.row]);
  token = a.token;
  return { db, alice, bob, a, b };
}

const site = "https://vitals.example.test";
const searchRequest = (q = "") => new Request(`${site}/api/foods/search?${new URLSearchParams({ q })}`);
const postFoodRequest = (path: string, body: unknown) => new Request(`${site}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
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

const fdcFood = {
  fdcId: 42, dataType: "Foundation", description: "Purple yam, boiled",
  foodNutrients: [
    { nutrientId: 1003, nutrientNumber: "203", value: 1.5, unitName: "G" },
    { nutrientId: 1093, nutrientNumber: "307", value: 15, unitName: "MG" },
    { nutrientNumber: "435", value: 22, unitName: "UG" },
    { nutrientId: 1177, nutrientNumber: "417", value: 72, unitName: "UG" },
    { nutrientId: 1110, value: 80, unitName: "IU" },
    { nutrientId: 1167, value: 2, unitName: "MG" },
    { nutrientId: 1004, value: 4, unitName: "G" },
    { nutrientId: 2000, value: 2, unitName: "G" },
    { nutrientId: 1235, value: 0, unitName: "G" },
    { nutrientId: 1178, value: 4, unitName: "MG" }, // wrong unit, do not guess
  ],
};
const fdcSearch = (...results: unknown[]) => Response.json({ foods: results });

it("skips USDA when the key is unset and maps matching USDA search results by ID and unit", async () => {
  const { lookupUsdaFood } = await import("@/lib/foods/open-api");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(fdcSearch(
      { ...fdcFood, dataType: "Branded" },
      { ...fdcFood, description: "Unrelated boiled potato" },
      fdcFood,
    ))
    .mockResolvedValueOnce(Response.json({}, { status: 429 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("USDA_FDC_API_KEY", " ");
  expect(await lookupUsdaFood("purple yam")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv("USDA_FDC_API_KEY", "fdc-test-key");
  expect(await lookupUsdaFood("purple yam")).toEqual({
    provider: "usda", label: "USDA FoodData Central", estimated: false,
    name: "Purple yam, boiled", aliases: ["purple yam"], defaultUnit: "g",
    nutrientsPer100: { protein: 1.5, sodium: 15, vitaminB9: 22, totalSugars: 2, addedSugars: 0 },
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(new URL(String(url)).searchParams.get("api_key")).toBe("fdc-test-key");
  expect(new URL(String(url)).searchParams.get("dataType")).toBe("Foundation,SR Legacy");
  expect(new URL(String(url)).searchParams.get("query")).toBe("purple yam");
  expect(init?.redirect).toBe("error");
  expect(await lookupUsdaFood("another query")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("authenticates local search and ranks aliases, recents and saves without cross-user rows", async () => {
  const { GET } = await import("@/app/api/foods/search/route");
  const { seedFoods } = await import("@/db/seed-foods");
  expect((await GET(searchRequest("dahi"))).status).toBe(401);
  expect(getDb).not.toHaveBeenCalled();
  const { db, alice, bob, b } = await setupFoodRoutes();
  await seedFoods(db);
  const [aliceFood, bobFood] = await db.insert(foods).values([
    { userId: alice.id, name: "Alice family yogurt", aliasesJson: ["dahi"], defaultUnit: "g",
      nutrientsPer100Json: { calcium: 40 }, source: "manual", createdAt: fixtureTime },
    { userId: bob.id, name: "Bob family yogurt", aliasesJson: ["dahi"], defaultUnit: "g",
      nutrientsPer100Json: { calcium: 80 }, source: "manual", createdAt: fixtureTime },
  ]).returning();
  const chapati = (await db.select().from(foods)).find(({ aliasesJson }) => aliasesJson.includes("roti"))!;
  const [tracker] = await db.insert(trackers).values({
    userId: alice.id, name: "Daily", healthFlagsJson: [], createdAt: fixtureTime, updatedAt: fixtureTime,
  }).returning();
  const log = {
    trackerId: tracker.id, userId: alice.id, logDate: "2026-11-26", loggedAt: fixtureTime,
    entryType: "food" as const, displayName: "Test", quantity: 100, unit: "g" as const,
    computedNutrientsJson: { sodium: 1 },
  };
  await db.insert(intakeLogs).values([
    { ...log, foodId: chapati.id }, { ...log, foodId: chapati.id },
    { ...log, foodId: bobFood.id }, // malicious legacy FK must not expose the foreign food
  ]);

  const recent = await GET(searchRequest());
  expect(recent.headers.get("Cache-Control")).toBe("no-store");
  expect((await recent.json()).foods.map((food: { id: string }) => food.id)).toEqual([chapati.id, aliceFood.id]);
  expect(await (await GET(searchRequest("  DAHI "))).json()).toEqual({
    foods: [
      { id: aliceFood.id, name: "Alice family yogurt", aliases: ["dahi"], defaultUnit: "g",
        nutrientsPer100: { calcium: 40 }, source: "manual", estimated: false },
      expect.objectContaining({ name: "Plain whole-milk yogurt", source: "curated" }),
      expect.objectContaining({ name: "Curd rice", source: "curated" }),
    ],
  });
  expect((await (await GET(searchRequest("CHApa"))).json()).foods).toContainEqual(expect.objectContaining({ id: chapati.id }));
  expect((await GET(searchRequest("x".repeat(101)))).status).toBe(400);
  token = b.token;
  expect((await (await GET(searchRequest())).json()).foods.map((food: { id: string }) => food.id)).toEqual([bobFood.id]);
  expect(await (await GET(searchRequest("Alice family yogurt"))).json()).toEqual({ foods: [] });
  expect(fetch).not.toHaveBeenCalled();
});

const resolvePath = "/api/foods/resolve";
const offHost = "world.openfoodfacts.org";
const fdcHost = "api.nal.usda.gov";
const aiHost = "openrouter.ai";
const aiEnvelope = (content: unknown) => Response.json({
  choices: [{ message: { content: JSON.stringify(content) } }],
});
const aiOutput = { name: "Grandma's savory pudding", defaultUnit: "g", nutrients: [
  { key: "protein", amount: 4 }, { key: "sodium", amount: 190 },
] };

it("authenticates resolve before validation and prefers saved exact aliases, then curated", async () => {
  const { POST } = await import("@/app/api/foods/resolve/route");
  const { seedFoods } = await import("@/db/seed-foods");
  const resolve = (body: unknown) => POST(postFoodRequest(resolvePath, body));
  expect((await resolve({})).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  const { db, alice, b } = await setupFoodRoutes();
  await seedFoods(db);
  const [saved] = await db.insert(foods).values({
    userId: alice.id, name: "Family flatbread", aliasesJson: ["rôti"], defaultUnit: "g",
    nutrientsPer100Json: { sodium: 11 }, source: "manual", createdAt: fixtureTime,
  }).returning();
  expect((await resolve({ query: " " })).status).toBe(400);
  expect((await resolve({ query: "roti", userId: alice.id })).status).toBe(400);
  expect(await (await resolve({ query: " ROTI! " })).json()).toMatchObject({
    kind: "saved", food: { id: saved.id, nutrientsPer100: { sodium: 11 } },
  });
  token = b.token;
  expect(await (await resolve({ query: "roti" })).json()).toMatchObject({
    kind: "curated", food: { name: "Whole-wheat chapati", source: "curated", estimated: false },
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("resolves OFF before USDA before OpenRouter, returns drafts and never persists a lookup", async () => {
  const { POST } = await import("@/app/api/foods/resolve/route");
  const { db } = await setupFoodRoutes();
  vi.stubEnv("USDA_FDC_API_KEY", "fdc-test-key");
  vi.stubEnv("OPENROUTER_API_KEY", "ai-test-key");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(offSearch(offProduct))
    .mockResolvedValueOnce(new Response("not json", { status: 200 }))
    .mockResolvedValueOnce(fdcSearch(fdcFood))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(fdcSearch())
    .mockResolvedValueOnce(aiEnvelope(aiOutput));
  vi.stubGlobal("fetch", fetchMock);
  const resolve = (query: string) => POST(postFoodRequest(resolvePath, { query }));
  expect(await (await resolve("cocoa drink")).json()).toMatchObject({
    kind: "draft", draft: { provider: "open_food_facts", estimated: false },
  });
  expect(fetchMock.mock.calls.map(([url]) => hostOf(url))).toEqual([offHost]);
  expect(await (await resolve("purple yam")).json()).toMatchObject({
    kind: "draft", draft: { provider: "usda", estimated: false },
  });
  expect(fetchMock.mock.calls.map(([url]) => hostOf(url))).toEqual([offHost, offHost, fdcHost]);
  const response = await resolve("savory pudding");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    kind: "draft", draft: {
      name: aiOutput.name, aliases: ["savory pudding"], defaultUnit: "g",
      nutrientsPer100: { protein: 4, sodium: 190 },
      provider: "openrouter", label: "Estimated", estimated: true,
    },
  });
  expect(fetchMock.mock.calls.map(([url]) => hostOf(url))).toEqual([
    offHost, offHost, fdcHost, offHost, fdcHost, aiHost,
  ]);
  const completion = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
  expect(completion.messages.at(-1)).toEqual({ role: "user", content: '{"food":"savory pudding"}' });
  expect(completion.response_format).toMatchObject({ type: "json_schema" });
  expect(await db.select().from(foods)).toEqual([]);
  expect(await db.select().from(intakeLogs)).toEqual([]);
});

it("skips missing AI and USDA keys, and rejects malformed AI nutrient drafts", async () => {
  const { POST } = await import("@/app/api/foods/resolve/route");
  const { db } = await setupFoodRoutes();
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (hostOf(url) === offHost) return offSearch();
    throw new Error("Unexpected provider");
  });
  vi.stubGlobal("fetch", fetchMock);
  const resolve = () => POST(postFoodRequest(resolvePath, { query: "winter grain pudding" }));
  const noKeys = await resolve();
  expect(noKeys.status).toBe(404);
  expect(await noKeys.json()).toEqual({ error: "No match found. You can enter the food manually." });
  expect(fetchMock.mock.calls.map(([url]) => hostOf(url))).toEqual([offHost]);

  vi.stubEnv("OPENROUTER_API_KEY", "ai-test-key");
  for (const nutrients of [
    [{ key: "salt", amount: 50 }], [{ key: "sodium", amount: -1 }],
    [{ key: "sodium", amount: "50" }], [{ key: "sodium", amount: 1 }, { key: "sodium", amount: 2 }],
    [{ key: "totalSugars", amount: 1 }, { key: "addedSugars", amount: 2 }], [],
  ]) {
    fetchMock.mockImplementationOnce(async () => offSearch())
      .mockImplementationOnce(async () => aiEnvelope({ ...aiOutput, nutrients }));
    const invalid = await resolve();
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({ error: "Could not estimate this food. You can enter it manually." });
  }
  fetchMock.mockImplementationOnce(async () => offSearch())
    .mockResolvedValueOnce(Response.json({ error: { message: "private provider details" } }, { status: 429 }));
  const unavailable = await resolve();
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({
    error: "Food estimates are unavailable right now. Try again or enter the food manually.",
  });
  expect(fetchMock.mock.calls.map(([url]) => hostOf(url))).not.toContain(fdcHost);
  expect(await db.select().from(foods)).toEqual([]);
  expect(await db.select().from(intakeLogs)).toEqual([]);
});

it("caches confirmed profiles idempotently per user, without writing intake logs", async () => {
  const { POST: save } = await import("@/app/api/foods/route");
  const { POST: resolve } = await import("@/app/api/foods/resolve/route");
  const { GET: search } = await import("@/app/api/foods/search/route");
  const request = (body: unknown) => postFoodRequest("/api/foods", body);
  const input = {
    name: " Savory–Pudding ", aliases: ["family pudding"], defaultUnit: "g",
    nutrientsPer100: { protein: 4, sodium: 190 }, source: "ai_confirmed", confirmed: true,
  };
  expect((await save(request({}))).status).toBe(401);
  const { db, alice, bob, b } = await setupFoodRoutes();
  for (const body of [
    { ...input, userId: bob.id }, { ...input, source: "curated" }, { ...input, confirmed: false },
    { ...input, nutrientsPer100: { salt: 1 } },
  ]) expect((await save(request(body))).status).toBe(400);
  expect((await save(new Request(`${site}/api/foods`, {
    method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(input),
  }))).status).toBe(400);
  expect(await db.select().from(foods)).toEqual([]);

  const result = await save(request(input));
  expect(result.status).toBe(201);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  const { food } = await result.json();
  expect(food).toEqual({
    id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/),
    name: "Savory–Pudding", defaultUnit: "g", aliases: ["family pudding"],
    nutrientsPer100: { protein: 4, sodium: 190 }, source: "ai_confirmed", estimated: true,
  });
  const replay = await save(request({ ...input, name: "savory pudding", nutrientsPer100: { protein: 99 } }));
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual({ food });
  expect(await (await resolve(postFoodRequest(resolvePath, { query: "family pudding" }))).json())
    .toEqual({ kind: "saved", food });
  expect(fetch).not.toHaveBeenCalled();
  expect(await (await search(searchRequest("savory pudding"))).json()).toEqual({ foods: [food] });

  token = b.token;
  expect(await (await search(searchRequest("family pudding"))).json()).toEqual({ foods: [] });
  expect((await resolve(postFoodRequest(resolvePath, { query: "family pudding" }))).status).toBe(404);
  const other = await save(request({ ...input, name: "Savory pudding", source: "manual" }));
  expect(other.status).toBe(201);
  const otherFood = (await other.json()).food;
  expect(otherFood).toMatchObject({ estimated: false, source: "manual" });
  expect(otherFood.id).not.toBe(food.id);
  expect(await db.select({ id: foods.id, owner: foods.userId }).from(foods)).toEqual(expect.arrayContaining([
    { id: food.id, owner: alice.id }, { id: otherFood.id, owner: bob.id },
  ]));
  expect(await db.select().from(foods)).toHaveLength(2);
  expect(await db.select().from(intakeLogs)).toEqual([]);
});
