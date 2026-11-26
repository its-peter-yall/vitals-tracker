import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, getDb } from "@/db";
import * as schema from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { SESSION_COOKIE } from "@/lib/auth/session";

vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDb: vi.fn(),
}));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) cookieJar.delete(name);
      else cookieJar.set(name, value);
    },
  }),
}));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Task 1: unified idempotent seed runner (SQLite + Turso + Node 24 CLI)", () => {
  it("seeds 129 curated foods and 6 curated medicines idempotently without touching user rows", async () => {
    const { seedDatabase } = await import("@/db/seed");
    const { db, client } = await createTestDb();
    try {
      const [user] = await db.insert(schema.users).values({
        email: "owner@example.test",
        name: "Owner",
        passwordHash: "fixture",
        createdAt: "2026-11-26T00:00:00.000Z",
      }).returning();
      await db.insert(schema.foods).values({
        userId: user.id,
        name: "Family Khichdi",
        aliasesJson: ["home khichdi"],
        defaultUnit: "g",
        nutrientsPer100Json: { protein: 4.5, sodium: 120 },
        source: "manual",
        createdAt: "2026-11-26T00:00:00.000Z",
      });
      await db.insert(schema.medicines).values({
        userId: user.id,
        brandName: "My Morning D3",
        genericName: "Cholecalciferol",
        category: "supplement",
        defaultDoseLabel: "1 softgel",
        nutrientsPerDoseJson: { vitaminD: 25 },
        notes: "After breakfast",
        scheduleHint: "Morning",
        source: "manual",
        createdAt: "2026-11-26T00:00:00.000Z",
      });

      const first = await seedDatabase(db);
      const second = await seedDatabase(db);

      expect(first).toEqual({ curatedFoods: 129, curatedMedicines: 6 });
      expect(second).toEqual({ curatedFoods: 129, curatedMedicines: 6 });

      const allFoods = await db.select().from(schema.foods);
      const allMeds = await db.select().from(schema.medicines);
      expect(allFoods).toHaveLength(130);
      expect(allMeds).toHaveLength(7);

      const curatedFoods = allFoods.filter((row) => row.userId === null && row.source === "curated");
      expect(curatedFoods).toHaveLength(129);
      for (const alias of ["roti", "dahi", "dal", "idli", "palak", "bhindi masala", "doodh"]) {
        expect(curatedFoods.some((row) => row.aliasesJson.includes(alias)), alias).toBe(true);
      }

      const curatedMeds = allMeds.filter((row) => row.userId === null && row.source === "curated");
      expect(curatedMeds.map((row) => row.brandName)).toEqual(
        expect.arrayContaining(["Vitamin D3 25 mcg", "Metformin", "Levothyroxine"]),
      );
      expect(allFoods.some((row) => row.userId === user.id && row.name === "Family Khichdi")).toBe(true);
      expect(allMeds.some((row) => row.userId === user.id && row.brandName === "My Morning D3")).toBe(true);
    } finally {
      client.close();
    }
  });

  it("validates Turso libsql:// credentials, forwards them to createDb, and always closes the client", async () => {
    const { seedFromEnv } = await import("@/db/seed");

    await expect(
      seedFromEnv({ DATABASE_URL: "libsql://vitals-prod-org.turso.io" }),
    ).rejects.toThrow("DATABASE_AUTH_TOKEN");

    const fixture = await createTestDb();
    const closeSpy = vi.spyOn(fixture.client, "close");
    const createDbSpy = vi.fn(async () => fixture);

    const result = await seedFromEnv(
      {
        DATABASE_URL: "libsql://vitals-prod-org.turso.io",
        DATABASE_AUTH_TOKEN: "turso-fixture-token",
      },
      { createDb: createDbSpy },
    );

    expect(createDbSpy).toHaveBeenCalledExactlyOnceWith(
      "libsql://vitals-prod-org.turso.io",
      "turso-fixture-token",
    );
    expect(result).toEqual({ curatedFoods: 129, curatedMedicines: 6 });
    expect(closeSpy).toHaveBeenCalledOnce();

    // Ensure client.close() still runs when seeding throws (e.g. unmigrated DB)
    const emptyConn = await createDb(":memory:");
    const emptyCloseSpy = vi.spyOn(emptyConn.client, "close");
    await expect(
      seedFromEnv(
        { DATABASE_URL: "file:local.db" },
        { createDb: async () => emptyConn },
      ),
    ).rejects.toThrow();
    expect(emptyCloseSpy).toHaveBeenCalledOnce();
  });

  it("executes src/db/seed.ts via real Node 24 CLI twice against a temp local SQLite file", async () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["db:seed"]).toBe(
      "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local src/db/seed.ts",
    );

    const dir = mkdtempSync(path.join(tmpdir(), "vt-seed-cli-"));
    const dbPath = path.join(dir, "local-seed.db");
    const dbUrl = pathToFileURL(dbPath).href;

    try {
      // Provision schema on the temporary SQLite file
      const setup = await createDb(dbUrl);
      try {
        const empty = await generateSQLiteDrizzleJson({});
        const statements = await generateSQLiteMigration(
          empty,
          await generateSQLiteDrizzleJson(schema, empty.id),
        );
        for (const statement of statements) {
          await setup.client.execute(statement);
        }
      } finally {
        setup.client.close();
      }

      const cliEnv: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: dbUrl,
        DATABASE_AUTH_TOKEN: "",
      };
      delete cliEnv.VITEST;

      const seedEntry = path.join(repoRoot, "src", "db", "seed.ts");
      for (const runNumber of [1, 2]) {
        const run = spawnSync(
          process.execPath,
          ["--conditions=react-server", seedEntry],
          { cwd: repoRoot, env: cliEnv, encoding: "utf8", timeout: 25_000 },
        );
        expect(run.error, `CLI run ${runNumber} spawn error`).toBeUndefined();
        expect(run.status, `CLI run ${runNumber} stderr: ${run.stderr}`).toBe(0);
        expect(run.stdout).toContain("Seeded 129 curated foods and 6 curated medicines.");
      }

      const verify = await createDb(dbUrl);
      try {
        const curatedFoods = await verify.db
          .select({ id: schema.foods.id })
          .from(schema.foods)
          .where(and(isNull(schema.foods.userId), eq(schema.foods.source, "curated")));
        const curatedMeds = await verify.db
          .select({ id: schema.medicines.id })
          .from(schema.medicines)
          .where(and(isNull(schema.medicines.userId), eq(schema.medicines.source, "curated")));
        expect(curatedFoods).toHaveLength(129);
        expect(curatedMeds).toHaveLength(6);
      } finally {
        verify.client.close();
      }
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Ignore transient Windows SQLite file handle release delay
      }
    }
  });
});

const BASE_URL = "https://vitals.example.test";
const JPEG_BYTES = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG_BYTES = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function jsonReq(urlPath: string, body: unknown, method = "POST") {
  return new Request(`${BASE_URL}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
}

function getReq(urlPath: string) {
  return new Request(`${BASE_URL}${urlPath}`, { method: "GET" });
}

function deleteReq(urlPath: string) {
  return new Request(`${BASE_URL}${urlPath}`, { method: "DELETE" });
}

function imageReq(urlPath: string, mime: "image/jpeg" | "image/png" | "image/webp", bytes: Uint8Array) {
  return new Request(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: new Uint8Array(bytes),
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function logParams(id: string, logId: string) {
  return { params: Promise.resolve({ id, logId }) };
}

async function signupAndSeed(
  fixture: Awaited<ReturnType<typeof createTestDb>>,
  email = "amma@example.test",
  name = "Amma",
  password = "calm-daily-care-2026",
) {
  const { seedDatabase } = await import("@/db/seed");
  const { POST: signup } = await import("@/app/api/auth/signup/route");
  await seedDatabase(fixture.db);
  const res = await signup(jsonReq("/api/auth/signup", { email, name, password }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    user: { id: string; email: string; name: string; theme: string; visionModel: string | null };
  };
  const sessionToken = cookieJar.get(SESSION_COOKIE);
  expect(sessionToken).toBeTruthy();
  return { user: body.user, token: sessionToken! };
}

describe("Task 2: E2E signup/session, guided tracker creation, and food g/ml logging", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

  beforeEach(async () => {
    cookieJar.clear();
    vi.setSystemTime(new Date("2026-11-26T08:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network fetch")));
    fixture = await createTestDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  afterEach(() => {
    cookieJar.clear();
    fixture?.client.close();
    fixture = undefined;
    vi.mocked(getDb).mockReset();
  });

  it("completes signup/session, settings update, guided tracker wizard, curated & AI-confirmed food g/ml logs, and tenant isolation", async () => {
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { GET: getSettings, PATCH: patchSettings } = await import("@/app/api/settings/route");
    const { POST: createTracker, GET: listTrackers } = await import("@/app/api/trackers/route");
    const { GET: getTracker } = await import("@/app/api/trackers/[id]/route");
    const { GET: searchFoods } = await import("@/app/api/foods/search/route");
    const { POST: resolveFood } = await import("@/app/api/foods/resolve/route");
    const { POST: saveFood } = await import("@/app/api/foods/route");
    const { POST: addLog } = await import("@/app/api/trackers/[id]/logs/route");
    const { GET: getSummary } = await import("@/app/api/trackers/[id]/summary/route");

    // 1. Signup + persistent session resolution + settings
    const amma = await signupAndSeed(fixture!);
    const meRes = await me();
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toEqual({ user: amma.user });

    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const settingsPatch = await patchSettings(
      jsonReq("/api/settings", { theme: "dark", visionModel: "openai/gpt-4o" }, "PATCH"),
    );
    expect(settingsPatch.status).toBe(200);
    const settingsPayload = await settingsPatch.json();
    expect(settingsPayload.settings).toEqual({ theme: "dark", visionModel: "openai/gpt-4o" });
    expect(JSON.stringify(settingsPayload)).not.toContain("test-openrouter-key");

    const settingsGet = await getSettings();
    expect(settingsGet.status).toBe(200);
    expect((await settingsGet.json()).settings).toEqual({ theme: "dark", visionModel: "openai/gpt-4o" });

    // 2. Guided tracker creation (Diabetes + High BP flags, selected subset of nutrients)
    const createRes = await createTracker(
      jsonReq("/api/trackers", {
        name: "Amma's Daily Care",
        healthFlags: ["diabetes", "hypertension"],
        nutrients: [
          { nutrientKey: "vitaminD" },
          { nutrientKey: "calcium" },
          { nutrientKey: "protein" },
          { nutrientKey: "totalSugars" },
          { nutrientKey: "sodium" },
        ],
      }),
    );
    expect(createRes.status).toBe(201);
    const { tracker } = (await createRes.json()) as {
      tracker: {
        id: string;
        name: string;
        healthFlags: string[];
        nutrients: Array<{ nutrientKey: string; dailyTarget: number; isCustomTarget: boolean }>;
      };
    };
    expect(tracker.name).toBe("Amma's Daily Care");
    expect(tracker.healthFlags).toEqual(["diabetes", "hypertension"]);
    expect(tracker.nutrients.map((n) => n.nutrientKey)).toEqual([
      "vitaminD",
      "calcium",
      "protein",
      "totalSugars",
      "sodium",
    ]);
    expect(tracker.nutrients.every((n) => n.isCustomTarget === false)).toBe(true);

    // 3. Curated local alias food search (doodh -> ml, roti -> g) without network
    const milkSearch = await searchFoods(getReq("/api/foods/search?q=doodh"));
    expect(milkSearch.status).toBe(200);
    const milkFoods = (await milkSearch.json()).foods as Array<{
      id: string;
      name: string;
      defaultUnit: "g" | "ml";
      nutrientsPer100: Record<string, number>;
    }>;
    const milk = milkFoods.find((item) => item.name === "Whole cow's milk (unfortified)");
    expect(milk?.defaultUnit).toBe("ml");

    const rotiSearch = await searchFoods(getReq("/api/foods/search?q=roti"));
    expect(rotiSearch.status).toBe(200);
    const roti = ((await rotiSearch.json()).foods as Array<{ id: string; name: string; defaultUnit: "g" | "ml" }>)
      .find((item) => item.name === "Whole-wheat chapati");
    expect(roti?.defaultUnit).toBe("g");

    // 4. Log food in ml, food in g, and cross-unit (g on an ml baseline using 1:1 fallback)
    const today = "2026-11-26";
    const milkLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: milk!.id,
        quantity: 200,
        unit: "ml",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(milkLogRes.status).toBe(201);
    const milkLog = (await milkLogRes.json()).log;
    expect(milkLog.computedNutrientsJson.calcium).toBeCloseTo(milk!.nutrientsPer100.calcium * 2, 6);

    const milkGramsRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: milk!.id,
        quantity: 50,
        unit: "g",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(milkGramsRes.status).toBe(201);
    expect((await milkGramsRes.json()).log.computedNutrientsJson.calcium).toBeCloseTo(
      milk!.nutrientsPer100.calcium * 0.5,
      6,
    );

    const rotiLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: roti!.id,
        quantity: 100,
        unit: "g",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(rotiLogRes.status).toBe(201);

    // 5. Unlisted food -> OpenRouter AI draft (labeled Estimated, NOT saved) -> explicit confirmation -> cached & logged
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const target = String(url);
      if (target.includes("openfoodfacts.org")) {
        return Response.json({ products: [] });
      }
      if (target.includes("openrouter.ai")) {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: "Homemade Mango Lassi",
                  defaultUnit: "ml",
                  nutrients: [
                    { key: "protein", amount: 2.4 },
                    { key: "calcium", amount: 85 },
                    { key: "totalSugars", amount: 11.5 },
                    { key: "addedSugars", amount: 4.0 },
                    { key: "sodium", amount: 35 },
                  ],
                }),
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolveRes = await resolveFood(
      jsonReq("/api/foods/resolve", { query: "Homemade mango lassi" }),
    );
    expect(resolveRes.status).toBe(200);
    const resolved = await resolveRes.json();
    expect(resolved).toMatchObject({
      kind: "draft",
      draft: {
        provider: "openrouter",
        label: "Estimated",
        estimated: true,
        name: "Homemade Mango Lassi",
        defaultUnit: "ml",
      },
    });
    // Resolve must NOT persist to DB before explicit user confirmation
    expect(
      await fixture!.db.select().from(schema.foods).where(eq(schema.foods.userId, amma.user.id)),
    ).toEqual([]);

    const confirmRes = await saveFood(
      jsonReq("/api/foods", {
        confirmed: true,
        source: "ai_confirmed",
        name: resolved.draft.name,
        aliases: resolved.draft.aliases,
        defaultUnit: resolved.draft.defaultUnit,
        nutrientsPer100: resolved.draft.nutrientsPer100,
      }),
    );
    expect(confirmRes.status).toBe(201);
    const { food: cachedLassi } = await confirmRes.json();
    expect(cachedLassi).toMatchObject({ source: "ai_confirmed", estimated: true });

    const lassiLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: cachedLassi.id,
        quantity: 200,
        unit: "ml",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(lassiLogRes.status).toBe(201);

    // 6. Summary displays ONLY selected 5 nutrients
    const summaryRes = await getSummary(
      getReq(`/api/trackers/${tracker.id}/summary?date=${today}`),
      idParams(tracker.id),
    );
    expect(summaryRes.status).toBe(200);
    const summary = await summaryRes.json();
    expect(summary.progress.map((p: { nutrientKey: string }) => p.nutrientKey)).toEqual([
      "vitaminD",
      "calcium",
      "protein",
      "totalSugars",
      "sodium",
    ]);
    // Alerts evaluate full-day totals even outside pinned cards: today's milk, roti,
    // and lassi total 36.67 g sugars, so only the diabetes caution fires.
    expect(summary.alerts.map((a: { healthFlag: string }) => a.healthFlag)).toEqual(["diabetes"]);
    expect(summary.alerts[0].triggers[0]).toMatchObject({
      nutrientKey: "totalSugars",
      threshold: 35,
      unit: "g",
    });
    expect(summary.alerts[0].triggers[0].total).toBeGreaterThan(35);

    // 7. Strict tenant isolation: another signed-up user cannot see or read Amma's tracker
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    const bobSignup = await signup(
      jsonReq("/api/auth/signup", {
        email: "other@example.test",
        name: "Other User",
        password: "another-safe-password",
      }),
    );
    expect(bobSignup.status).toBe(201);
    expect(await (await listTrackers()).json()).toEqual({ trackers: [] });
    expect((await getTracker(getReq(`/api/trackers/${tracker.id}`), idParams(tracker.id))).status).toBe(404);
  });
});

describe("Task 3: E2E medicine photo scan confirmation, 1-tap repeat, and Diabetes/High-BP cautions", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

  beforeEach(async () => {
    cookieJar.clear();
    vi.setSystemTime(new Date("2026-11-26T09:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network fetch")));
    fixture = await createTestDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  afterEach(() => {
    cookieJar.clear();
    fixture?.client.close();
    fixture = undefined;
    vi.mocked(getDb).mockReset();
  });

  it("scans and confirms supplement + prescription medicines, repeats via 1-tap My Medicines with zero AI calls, and triggers safe Diabetes & High-BP cautions", async () => {
    const { PATCH: patchSettings } = await import("@/app/api/settings/route");
    const { POST: createTracker } = await import("@/app/api/trackers/route");
    const { POST: scanMedicine } = await import("@/app/api/medicines/scan/route");
    const { GET: listMedicines, POST: saveMedicine } = await import("@/app/api/medicines/route");
    const { GET: searchFoods } = await import("@/app/api/foods/search/route");
    const { GET: listLogs, POST: addLog } = await import("@/app/api/trackers/[id]/logs/route");
    const { GET: getSummary } = await import("@/app/api/trackers/[id]/summary/route");

    const amma = await signupAndSeed(fixture!);
    vi.stubEnv("OPENROUTER_API_KEY", "test-vision-key");

    // Configure custom user vision model in Settings
    expect(
      (await patchSettings(jsonReq("/api/settings", { visionModel: "openai/gpt-4o" }, "PATCH"))).status,
    ).toBe(200);

    // Create Diabetes + High-BP tracker without pinning addedSugars so full-day hidden-nutrient alert evaluation is also proven
    const trackerRes = await createTracker(
      jsonReq("/api/trackers", {
        name: "Care Plan",
        healthFlags: ["diabetes", "hypertension"],
        nutrients: [
          { nutrientKey: "vitaminD" },
          { nutrientKey: "calcium" },
          { nutrientKey: "sodium" },
        ],
      }),
    );
    expect(trackerRes.status).toBe(201);
    const { tracker } = (await trackerRes.json()) as { tracker: { id: string } };

    // 1. Photo-scan a supplement via OpenRouter Vision (must NOT auto-save or auto-log)
    const visionFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  brandName: "CalciD3 Plus",
                  genericName: "Calcium + Cholecalciferol",
                  category: "supplement",
                  defaultDoseLabel: "1 tablet",
                  nutrients: [
                    { key: "vitaminD", amount: 25, unit: "mcg" },
                    { key: "calcium", amount: 500, unit: "mg" },
                  ],
                  notes: "Take after breakfast.",
                  confidence: 0.92,
                }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  brandName: "Metformin 500",
                  genericName: "Metformin hydrochloride",
                  category: "prescription",
                  defaultDoseLabel: "1 tablet",
                  nutrients: [],
                  notes: "Take with evening meal to reduce stomach upset.",
                  confidence: 0.88,
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", visionFetch);

    const suppScanRes = await scanMedicine(imageReq("/api/medicines/scan", "image/jpeg", JPEG_BYTES));
    expect(suppScanRes.status).toBe(200);
    const suppScan = await suppScanRes.json();
    expect(suppScan).toMatchObject({
      requiresConfirmation: true,
      source: "vision",
      code: "REVIEW",
      confidence: { level: "high", score: 0.92 },
      draft: {
        brandName: "CalciD3 Plus",
        category: "supplement",
        defaultDoseLabel: "1 tablet",
        nutrientsPerDose: { vitaminD: 25, calcium: 500 },
      },
    });
    // Verify Settings vision model override was sent to OpenRouter
    expect(JSON.parse(String(visionFetch.mock.calls[0][1]?.body)).model).toBe("openai/gpt-4o");
    // Zero DB writes before explicit confirmation
    expect(
      await fixture!.db.select().from(schema.medicines).where(eq(schema.medicines.userId, amma.user.id)),
    ).toEqual([]);
    expect(await fixture!.db.select().from(schema.intakeLogs)).toEqual([]);

    // Confirm & save supplement to My Medicines, then log 1 dose on 2026-11-26
    const suppSaveRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: suppScan.draft.brandName,
        genericName: suppScan.draft.genericName,
        category: suppScan.draft.category,
        defaultDoseLabel: suppScan.draft.defaultDoseLabel,
        nutrientsPerDose: suppScan.draft.nutrientsPerDose,
        notes: suppScan.draft.notes,
        source: "vision_confirmed",
      }),
    );
    expect(suppSaveRes.status).toBe(201);
    const { medicine: savedSupplement } = await suppSaveRes.json();

    const day1 = "2026-11-26";
    const suppLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "medicine",
        medicineId: savedSupplement.id,
        quantity: 1,
        unit: "dose",
        logDate: day1,
      }),
      idParams(tracker.id),
    );
    expect(suppLogRes.status).toBe(201);
    expect((await suppLogRes.json()).log.computedNutrientsJson).toEqual({ vitaminD: 25, calcium: 500 });

    // 2. Photo-scan and confirm a prescription medicine (0 nutrients + plain-language food notes)
    const rxScanRes = await scanMedicine(imageReq("/api/medicines/scan", "image/png", PNG_BYTES));
    expect(rxScanRes.status).toBe(200);
    const rxScan = await rxScanRes.json();
    expect(rxScan).toMatchObject({
      requiresConfirmation: true,
      code: "REVIEW",
      confidence: { level: "high", score: 0.88 },
      draft: {
        brandName: "Metformin 500",
        category: "prescription",
        nutrientsPerDose: {},
        notes: "Take with evening meal to reduce stomach upset.",
      },
    });

    const rxSaveRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: rxScan.draft.brandName,
        genericName: rxScan.draft.genericName,
        category: rxScan.draft.category,
        defaultDoseLabel: rxScan.draft.defaultDoseLabel,
        nutrientsPerDose: rxScan.draft.nutrientsPerDose,
        notes: rxScan.draft.notes,
        source: "vision_confirmed",
      }),
    );
    expect(rxSaveRes.status).toBe(201);
    const { medicine: savedPrescription } = await rxSaveRes.json();

    const rxLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "medicine",
        medicineId: savedPrescription.id,
        quantity: 1,
        unit: "dose",
        logDate: day1,
      }),
      idParams(tracker.id),
    );
    expect(rxLogRes.status).toBe(201);
    expect((await rxLogRes.json()).log).toMatchObject({
      computedNutrientsJson: {},
      medicineNotes: "Take with evening meal to reduce stomach upset.",
    });

    // 3. 1-tap repeat medicine logging on next local date (2026-11-27) with ZERO external fetch calls
    const forbiddenFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("Should not call OpenRouter on repeat"));
    vi.stubGlobal("fetch", forbiddenFetch);

    const cabinetRes = await listMedicines();
    expect(cabinetRes.status).toBe(200);
    const cabinet = (await cabinetRes.json()) as {
      medicines: Array<{ id: string; brandName: string }>;
      curated: Array<{ id: string }>;
    };
    expect(cabinet.medicines.map((m) => m.brandName)).toEqual(
      expect.arrayContaining(["CalciD3 Plus", "Metformin 500"]),
    );
    expect(cabinet.curated).toHaveLength(6);

    const day2 = "2026-11-27";
    for (const medId of [savedSupplement.id, savedPrescription.id]) {
      const repeatRes = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "medicine",
          medicineId: medId,
          quantity: 1,
          unit: "dose",
          logDate: day2,
        }),
        idParams(tracker.id),
      );
      expect(repeatRes.status).toBe(201);
    }
    expect(forbiddenFetch).not.toHaveBeenCalled();

    const day2Logs = (await (await listLogs(getReq(`/api/trackers/${tracker.id}/logs?date=${day2}`), idParams(tracker.id))).json()).logs;
    expect(day2Logs).toHaveLength(2);
    expect(day2Logs.find((l: { medicineId: string }) => l.medicineId === savedPrescription.id)?.medicineNotes).toBe(
      "Take with evening meal to reduce stomach upset.",
    );

    // 4. Diabetes & High-BP condition caution evaluation on day1 using seeded curated foods
    // Medjool dates 60 g -> 39.882 g totalSugars (> 35 g diabetes threshold, even though totalSugars is NOT pinned)
    // Cheddar cheese 200 g (1306 mg sodium) + White sandwich bread 200 g (980 mg sodium) -> 2286 mg sodium (> 2000 mg hypertension threshold)
    const findFoodId = async (q: string, exactName: string) => {
      const res = await searchFoods(getReq(`/api/foods/search?q=${encodeURIComponent(q)}`));
      const rows = (await res.json()).foods as Array<{ id: string; name: string }>;
      const match = rows.find((row) => row.name === exactName);
      expect(match, exactName).toBeDefined();
      return match!.id;
    };

    const datesId = await findFoodId("dates", "Medjool dates");
    const cheddarId = await findFoodId("cheddar", "Cheddar cheese");
    const breadId = await findFoodId("white bread", "White sandwich bread");

    for (const [foodId, quantity] of [
      [datesId, 60],
      [cheddarId, 200],
      [breadId, 200],
    ] as const) {
      const res = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "food",
          foodId,
          quantity,
          unit: "g",
          logDate: day1,
        }),
        idParams(tracker.id),
      );
      expect(res.status).toBe(201);
    }

    const summaryRes = await getSummary(
      getReq(`/api/trackers/${tracker.id}/summary?date=${day1}`),
      idParams(tracker.id),
    );
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json()) as {
      progress: Array<{ nutrientKey: string; amount: number; hasAmount: boolean }>;
      alerts: Array<{
        healthFlag: "diabetes" | "hypertension";
        message: string;
        triggers: Array<{ nutrientKey: string; total: number; threshold: number; unit: string }>;
      }>;
    };

    // Supplement vitaminD + calcium are reflected in selected progress cards
    expect(summary.progress.find((p) => p.nutrientKey === "vitaminD")?.amount).toBeCloseTo(26.2, 4);
    expect(summary.progress.find((p) => p.nutrientKey === "calcium")?.amount).toBeGreaterThan(2000);
    expect(summary.progress.find((p) => p.nutrientKey === "sodium")?.amount).toBeCloseTo(2286.6, 4);

    // Both Diabetes and High-BP cautions fire with strict non-clinical directional copy
    expect(summary.alerts.map((a) => a.healthFlag)).toEqual(["diabetes", "hypertension"]);
    expect(summary.alerts[0].triggers[0]).toMatchObject({
      nutrientKey: "totalSugars",
      threshold: 35,
      unit: "g",
    });
    expect(summary.alerts[0].triggers[0].total).toBeGreaterThan(35);
    expect(summary.alerts[1].triggers[0]).toMatchObject({
      nutrientKey: "sodium",
      threshold: 2000,
      unit: "mg",
    });
    expect(summary.alerts[1].triggers[0].total).toBeGreaterThan(2000);
    for (const alert of summary.alerts) {
      expect(alert.message).not.toMatch(/mg\s*\/\s*dL|mm\s*Hg|\d/i);
    }
  });
});

describe("Task 4: E2E 7d/30d analytics, quantity edit, Undo deletion, and logout", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

  beforeEach(async () => {
    cookieJar.clear();
    vi.setSystemTime(new Date("2026-11-26T10:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network fetch")));
    fixture = await createTestDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  afterEach(() => {
    cookieJar.clear();
    fixture?.client.close();
    fixture = undefined;
    vi.mocked(getDb).mockReset();
  });

  it("handles quantity edits, Undo deletion clearing a caution, 7d vs 30d analytics rollups, and logout revocation", async () => {
    const { POST: createTracker, GET: listTrackers } = await import("@/app/api/trackers/route");
    const { GET: searchFoods } = await import("@/app/api/foods/search/route");
    const { POST: saveMedicine } = await import("@/app/api/medicines/route");
    const { GET: listLogs, POST: addLog } = await import("@/app/api/trackers/[id]/logs/route");
    const { PATCH: editLog, DELETE: deleteLog } = await import("@/app/api/trackers/[id]/logs/[logId]/route");
    const { GET: getSummary } = await import("@/app/api/trackers/[id]/summary/route");
    const { GET: getAnalytics } = await import("@/app/api/trackers/[id]/analytics/route");
    const { POST: logout } = await import("@/app/api/auth/logout/route");

    await signupAndSeed(fixture!);

    const trackerRes = await createTracker(
      jsonReq("/api/trackers", {
        name: "Analytics & Undo Care",
        healthFlags: ["hypertension"],
        nutrients: [
          { nutrientKey: "protein", customDailyTarget: 20 },
          { nutrientKey: "vitaminD" },
          { nutrientKey: "sodium" },
        ],
      }),
    );
    expect(trackerRes.status).toBe(201);
    const { tracker } = (await trackerRes.json()) as { tracker: { id: string } };

    const findFood = async (q: string, exactName: string) => {
      const res = await searchFoods(getReq(`/api/foods/search?q=${encodeURIComponent(q)}`));
      const rows = (await res.json()).foods as Array<{ id: string; name: string }>;
      const match = rows.find((row) => row.name === exactName);
      expect(match, exactName).toBeDefined();
      return match!.id;
    };

    const yogurtId = await findFood("dahi", "Plain whole-milk yogurt");
    const cheddarId = await findFood("cheddar", "Cheddar cheese");
    const breadId = await findFood("white bread", "White sandwich bread");

    const suppRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: "Daily D3",
        category: "supplement",
        defaultDoseLabel: "1 softgel",
        nutrientsPerDose: { vitaminD: 20 },
        source: "manual",
      }),
    );
    expect(suppRes.status).toBe(201);
    const { medicine: dailyD3 } = await suppRes.json();

    const rxRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: "Amlodipine",
        category: "prescription",
        defaultDoseLabel: "1 tablet",
        nutrientsPerDose: {},
        notes: "Take at the same time each morning.",
        source: "manual",
      }),
    );
    expect(rxRes.status).toBe(201);
    const { medicine: amlodipine } = await rxRes.json();

    const logFood = async (foodId: string, quantity: number, logDate: string) => {
      const res = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "food",
          foodId,
          quantity,
          unit: "g",
          logDate,
        }),
        idParams(tracker.id),
      );
      expect(res.status).toBe(201);
      return (await res.json()).log as {
        id: string;
        quantity: number;
        displayName: string;
        computedNutrientsJson: Record<string, number>;
      };
    };

    const logMed = async (medicineId: string, logDate: string) => {
      const res = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "medicine",
          medicineId,
          quantity: 1,
          unit: "dose",
          logDate,
        }),
        idParams(tracker.id),
      );
      expect(res.status).toBe(201);
      return (await res.json()).log;
    };

    // Day inside 30d window ONLY (2026-11-05)
    await logFood(yogurtId, 200, "2026-11-05");
    await logMed(amlodipine.id, "2026-11-05");

    // Caution day inside 7d window (2026-11-25): 200 g cheddar (1306 mg) + 200 g bread (980 mg) = 2286 mg sodium
    await logFood(cheddarId, 200, "2026-11-25");
    await logFood(breadId, 200, "2026-11-25");
    await logMed(dailyD3.id, "2026-11-25");
    await logMed(amlodipine.id, "2026-11-25");

    // Today (2026-11-26): test quantity edit + Undo clearing an accidental high-sodium log
    const yogurtLog = await logFood(yogurtId, 100, "2026-11-26");
    expect(yogurtLog.computedNutrientsJson.protein).toBeCloseTo(3.47, 6);

    // Edit quantity 100 g -> 200 g and verify proportional immutable snapshot rescale
    const editRes = await editLog(
      jsonReq(`/api/trackers/${tracker.id}/logs/${yogurtLog.id}`, { quantity: 200 }, "PATCH"),
      logParams(tracker.id, yogurtLog.id),
    );
    expect(editRes.status).toBe(200);
    const editedLog = (await editRes.json()).log;
    expect(editedLog.quantity).toBe(200);
    expect(editedLog.computedNutrientsJson.protein).toBeCloseTo(6.94, 6);
    expect(editedLog.computedNutrientsJson.calcium).toBeCloseTo(242, 6);

    // Add accidental high-sodium food on 2026-11-26 -> triggers caution -> Undo deletes it and clears caution
    const accidentalCheddar = await logFood(cheddarId, 350, "2026-11-26");
    const preUndoSummary = await (
      await getSummary(getReq(`/api/trackers/${tracker.id}/summary?date=2026-11-26`), idParams(tracker.id))
    ).json();
    expect(preUndoSummary.alerts.map((a: { healthFlag: string }) => a.healthFlag)).toEqual(["hypertension"]);

    const undoRes = await deleteLog(
      deleteReq(`/api/trackers/${tracker.id}/logs/${accidentalCheddar.id}`),
      logParams(tracker.id, accidentalCheddar.id),
    );
    expect(undoRes.status).toBe(200);
    expect(await undoRes.json()).toEqual({ ok: true });

    // Repeating Undo returns 404
    const repeatUndo = await deleteLog(
      deleteReq(`/api/trackers/${tracker.id}/logs/${accidentalCheddar.id}`),
      logParams(tracker.id, accidentalCheddar.id),
    );
    expect(repeatUndo.status).toBe(404);

    const postUndoLogs = (
      await (await listLogs(getReq(`/api/trackers/${tracker.id}/logs?date=2026-11-26`), idParams(tracker.id))).json()
    ).logs;
    expect(postUndoLogs.map((l: { id: string }) => l.id)).toEqual([yogurtLog.id]);

    const postUndoSummary = await (
      await getSummary(getReq(`/api/trackers/${tracker.id}/summary?date=2026-11-26`), idParams(tracker.id))
    ).json();
    expect(postUndoSummary.alerts).toEqual([]);

    await logMed(dailyD3.id, "2026-11-26");

    // 7d analytics (2026-11-20 .. 2026-11-26)
    const weekRes = await getAnalytics(
      getReq(`/api/trackers/${tracker.id}/analytics?range=7d&endDate=2026-11-26`),
      idParams(tracker.id),
    );
    expect(weekRes.status).toBe(200);
    const { analytics: week } = await weekRes.json();
    expect(week).toMatchObject({
      range: "7d",
      startDate: "2026-11-20",
      endDate: "2026-11-26",
      activeDays: 2,
      cautionDays: ["2026-11-25"],
      cautionDayCount: 1,
    });
    expect(week.days).toHaveLength(7);
    expect(week.trends.map((t: { nutrientKey: string }) => t.nutrientKey)).toEqual([
      "protein",
      "vitaminD",
      "sodium",
    ]);
    expect(week.needsAttention).toEqual(
      expect.arrayContaining([
        { nutrientKey: "protein", reason: "lowCompletion" },
        { nutrientKey: "vitaminD", reason: "lowCompletion" },
        { nutrientKey: "sodium", reason: "upperExceeded" },
      ]),
    );
    expect(week.medicineAdherence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          medicineId: dailyD3.id,
          displayName: "Daily D3",
          loggedDays: 2,
          rangeDays: 7,
        }),
        expect.objectContaining({
          medicineId: amlodipine.id,
          displayName: "Amlodipine",
          loggedDays: 1,
          rangeDays: 7,
        }),
      ]),
    );

    // 30d analytics (2026-10-28 .. 2026-11-26) includes 2026-11-05
    const monthRes = await getAnalytics(
      getReq(`/api/trackers/${tracker.id}/analytics?range=30d&endDate=2026-11-26`),
      idParams(tracker.id),
    );
    expect(monthRes.status).toBe(200);
    const { analytics: month } = await monthRes.json();
    expect(month).toMatchObject({
      range: "30d",
      startDate: "2026-10-28",
      endDate: "2026-11-26",
      activeDays: 3,
      cautionDays: ["2026-11-25"],
      cautionDayCount: 1,
    });
    expect(month.days).toHaveLength(30);
    expect(month.medicineAdherence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          medicineId: amlodipine.id,
          loggedDays: 2,
          rangeDays: 30,
        }),
        expect.objectContaining({
          medicineId: dailyD3.id,
          loggedDays: 2,
          rangeDays: 30,
        }),
      ]),
    );

    // Logout revokes session and blocks subsequent tracker reads
    const logoutRes = await logout(jsonReq("/api/auth/logout", {}));
    expect(logoutRes.status).toBe(200);
    expect((await listTrackers()).status).toBe(401);
  });
});
