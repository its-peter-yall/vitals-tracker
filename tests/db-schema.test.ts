import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import * as z from "zod";

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

const completionInput = {
  prompt: "Read the label",
  schemaName: "label",
  jsonSchema: {
    type: "object", properties: { name: { type: "string" } },
    required: ["name"], additionalProperties: false,
  },
  output: z.object({ name: z.string() }),
};
const modelText = (content: string) => Response.json({ choices: [{ message: { content } }] });

it("posts a text-first data-URL vision completion and validates fenced JSON", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(modelText("```json\n{\"name\":\"Label\"}\n```"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  await expect(completeJson({
    ...completionInput, model: "openai/gpt-4o", system: "Extract only visible text.",
    image: { mime: "image/jpeg", bytes: Uint8Array.of(0xff, 0xd8, 0xff) },
  })).resolves.toEqual({ name: "Label" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(init).toMatchObject({
    method: "POST", headers: { Authorization: "Bearer fixture-key", "HTTP-Referer": "https://app.example.test" },
    signal: expect.any(AbortSignal),
  });
  expect(JSON.parse(String(init?.body))).toEqual({
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: "Extract only visible text." },
      { role: "user", content: [
        { type: "text", text: completionInput.prompt },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/", detail: "auto" } },
      ] },
    ],
    response_format: { type: "json_schema", json_schema: {
      name: "label", strict: true, schema: completionInput.jsonSchema,
    } },
    temperature: 0,
  });
});

it("falls back to JSON object once only for unsupported structured output", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ error: { message: "json_schema is not supported" } }, { status: 400 }))
    .mockResolvedValueOnce(modelText('{"name":123}'));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash");
  await expect(completeJson(completionInput)).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(body).toMatchObject({
    model: "google/gemini-2.5-flash", response_format: { type: "json_object" },
    messages: [{ role: "user", content: completionInput.prompt }],
  });
});

it("maps embedded, authentication and configuration errors without exposing provider details", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ choices: [{ error: { code: 503, message: "private detail" } }] }))
    .mockResolvedValueOnce(Response.json({ error: { message: "private key detail" } }, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  await expect(completeJson(completionInput)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  await expect(completeJson(completionInput)).rejects.toMatchObject({ code: "PROVIDER" });
  await expect(completeJson(completionInput)).rejects.toMatchObject({
    code: "AUTH", message: "AI access could not be verified.",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("honors a short Retry-After within the one-request retry budget", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": "0" } }))
    .mockResolvedValueOnce(modelText('{"name":"Recovered"}'));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  await expect(completeJson(completionInput)).resolves.toEqual({ name: "Recovered" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1]?.signal).toBe(fetchMock.mock.calls[1][1]?.signal);
});

it("aborts a pending OpenRouter request at 20 seconds", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);
  const result = expect(completeJson(completionInput)).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(19_999);
  const signal = fetchMock.mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal?.aborted).toBe(true);
  await result;
});
