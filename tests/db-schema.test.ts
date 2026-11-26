import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

it("bootstraps Node-only Next and Tailwind with strict TypeScript", async () => {
  const { default: config } = await import("../next.config");
  expect(config.serverExternalPackages).toEqual(expect.arrayContaining([
    "@libsql/client", "libsql", "tesseract.js",
  ]));
  const readJson = (relativePath: string) =>
    JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
  expect(readJson("tsconfig.json").compilerOptions).toMatchObject({
    strict: true, paths: { "@/*": ["./src/*"] },
  });
  expect(readFileSync(new URL("../postcss.config.mjs", import.meta.url), "utf8"))
    .toContain("@tailwindcss/postcss");
});

it("validates database configuration, optional keys, and vision model selection", async () => {
  const { readEnv } = await import("@/lib/env");
  const { VISION_MODELS, resolveVisionModel } = await import("@/lib/openrouter/models");
  expect(readEnv({})).toMatchObject({
    DATABASE_URL: "file:local.db", OPENROUTER_VISION_MODEL: "google/gemini-2.5-flash",
  });
  expect(readEnv({ DATABASE_URL: ":memory:", OPENROUTER_API_KEY: " " }).OPENROUTER_API_KEY)
    .toBeUndefined();
  expect(() => readEnv({ DATABASE_URL: "https://db.example", DATABASE_AUTH_TOKEN: "secret" }))
    .toThrow("DATABASE_URL");
  expect(() => readEnv({ DATABASE_URL: "libsql://db.example" })).toThrow("DATABASE_AUTH_TOKEN");
  expect(readEnv({ DATABASE_URL: "libsql://db.example", DATABASE_AUTH_TOKEN: "fixture" }))
    .toMatchObject({ DATABASE_AUTH_TOKEN: "fixture" });
  expect(VISION_MODELS).toContain("openai/gpt-4o");
  expect(resolveVisionModel("openai/gpt-4o", "google/gemini-2.5-flash")).toBe("openai/gpt-4o");
  expect(resolveVisionModel("custom/model:free", "google/gemini-2.5-flash")).toBe("custom/model:free");
  expect(resolveVisionModel(null, "google/gemini-2.5-flash")).toBe("google/gemini-2.5-flash");
  expect(() => resolveVisionModel("bad model", "google/gemini-2.5-flash")).toThrow("model");
});

const iso = "2026-11-26T03:15:00.000Z";
const localDate = "2026-11-25";

async function dbFixture() {
  const schema = await import("@/db/schema");
  const { createTestDb } = await import("@/db/test-utils");
  const connection = await createTestDb();
  return { ...connection, ...schema };
}

it("migrates seven tables and round-trips typed JSON, timestamps and both local-date log kinds", async () => {
  const f = await dbFixture();
  try {
    const results = await f.client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(results.rows.map((row) => row.name)).toEqual([
      "foods", "intake_logs", "medicines", "sessions", "tracker_nutrients", "trackers", "users",
    ]);
    const [user] = await f.db.insert(f.users).values({
      email: "test@example.test", name: "Test", passwordHash: "fixture", createdAt: iso,
    }).returning();
    expect(user).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i), theme: "system", visionModel: null, createdAt: iso,
    });
    const [session] = await f.db.insert(f.sessions).values({
      userId: user.id, tokenHash: "session-hash", expiresAt: "2027-02-24T03:15:00.000Z", createdAt: iso,
    }).returning();
    expect(session).toMatchObject({ userId: user.id, tokenHash: "session-hash" });
    const [tracker] = await f.db.insert(f.trackers).values({
      userId: user.id, name: "Daily", healthFlagsJson: ["diabetes"], createdAt: iso, updatedAt: iso,
    }).returning();
    expect(tracker.healthFlagsJson).toEqual(["diabetes"]);
    const [nutrient] = await f.db.insert(f.trackerNutrients).values({
      trackerId: tracker.id, nutrientKey: "protein", dailyTarget: 52.5, sortOrder: 0,
    }).returning();
    expect(nutrient).toMatchObject({ dailyTarget: 52.5, sortOrder: 0 });
    const [food] = await f.db.insert(f.foods).values({
      name: "Milk", aliasesJson: ["Doodh"], defaultUnit: "ml",
      nutrientsPer100Json: { protein: 3.4, totalSugars: 5 }, source: "curated", createdAt: iso,
    }).returning();
    expect(food).toMatchObject({ userId: null, aliasesJson: ["Doodh"], nutrientsPer100Json: { protein: 3.4, totalSugars: 5 } });
    const [medicine] = await f.db.insert(f.medicines).values({
      userId: user.id, brandName: "Example", category: "supplement", defaultDoseLabel: "1 tablet",
      nutrientsPerDoseJson: { calcium: 100 }, source: "manual", createdAt: iso,
    }).returning();
    expect(medicine).toMatchObject({ genericName: null, scheduleHint: null, notes: null });
    const common = { trackerId: tracker.id, userId: user.id, logDate: localDate, loggedAt: iso };
    await f.db.insert(f.intakeLogs).values([
      { ...common, entryType: "food", foodId: food.id, displayName: "Milk", quantity: 50,
        unit: "ml", computedNutrientsJson: { protein: 1.7, totalSugars: 2.5 } },
      { ...common, entryType: "medicine", medicineId: medicine.id, displayName: "Example", quantity: 1,
        unit: "dose", computedNutrientsJson: { calcium: 100 } },
    ]);
    const logs = await f.db.select().from(f.intakeLogs).where(eq(f.intakeLogs.logDate, localDate));
    expect(logs).toHaveLength(2);
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ loggedAt: iso, logDate: localDate, foodId: food.id,
        computedNutrientsJson: { protein: 1.7, totalSugars: 2.5 } }),
      expect.objectContaining({ medicineId: medicine.id, unit: "dose", computedNutrientsJson: { calcium: 100 } }),
    ]));
    await f.db.delete(f.medicines).where(eq(f.medicines.id, medicine.id));
    expect(await f.db.select().from(f.intakeLogs).where(eq(f.intakeLogs.entryType, "medicine")))
      .toEqual([expect.objectContaining({ medicineId: null, displayName: "Example", computedNutrientsJson: { calcium: 100 } })]);
    await f.db.delete(f.users).where(eq(f.users.id, user.id));
    for (const table of [f.sessions, f.trackers, f.trackerNutrients, f.intakeLogs]) {
      expect(await f.db.select().from(table)).toEqual([]);
    }
    expect(await f.db.select().from(f.foods)).toHaveLength(1);
  } finally {
    f.client.close();
  }
});

it("enforces uniqueness, enums and foreign keys, has both date indexes, and isolates each client", async () => {
  const f = await dbFixture();
  try {
    const userInput = { email: "unique@example.test", name: "Test", passwordHash: "fixture", createdAt: iso };
    const [user] = await f.db.insert(f.users).values(userInput).returning();
    await expect(f.db.insert(f.users).values(userInput).run()).rejects.toThrow();
    await expect(f.client.execute({
      sql: "UPDATE users SET theme = ? WHERE id = ?", args: ["invalid", user.id],
    })).rejects.toThrow(/CHECK/i);
    const session = { userId: user.id, tokenHash: "unique", createdAt: iso, expiresAt: iso };
    await f.db.insert(f.sessions).values(session);
    await expect(f.db.insert(f.sessions).values(session).run()).rejects.toThrow();
    await expect(f.client.execute({
      sql: "UPDATE sessions SET user_id = ? WHERE token_hash = ?", args: ["missing", session.tokenHash],
    })).rejects.toThrow(/FOREIGN KEY/i);
    const [tracker] = await f.db.insert(f.trackers).values({
      userId: user.id, name: "Daily", healthFlagsJson: [], createdAt: iso, updatedAt: iso,
    }).returning();
    const nutrient = { trackerId: tracker.id, nutrientKey: "sodium", dailyTarget: 2000, sortOrder: 0 };
    await f.db.insert(f.trackerNutrients).values(nutrient);
    await expect(f.db.insert(f.trackerNutrients).values(nutrient).run()).rejects.toThrow();
    for (const [name, key] of [
      ["intake_logs_tracker_date_idx", "tracker_id"], ["intake_logs_user_date_idx", "user_id"],
    ]) {
      const result = await f.client.execute(`PRAGMA index_info('${name}')`);
      expect(result.rows.map((row) => row.name)).toEqual([key, "log_date"]);
    }
    const other = await dbFixture();
    try {
      expect(await other.db.select().from(other.users)).toEqual([]);
    } finally {
      other.client.close();
    }
  } finally {
    f.client.close();
  }
});
