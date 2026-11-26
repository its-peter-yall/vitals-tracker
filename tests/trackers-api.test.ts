import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDb, getDb } from "@/db";
import { intakeLogs, sessions, trackerNutrients, users } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { makeSession, SESSION_COOKIE } from "@/lib/auth/session";

it("defaults legacy target provenance to false without changing the target", async () => {
  const { client, db } = await createDb(":memory:");
  try {
    await client.execute("CREATE TABLE trackers (id text PRIMARY KEY NOT NULL)");
    await client.execute("INSERT INTO trackers (id) VALUES ('tracker')");
    await client.execute(`CREATE TABLE tracker_nutrients (
      id text PRIMARY KEY NOT NULL, tracker_id text NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      nutrient_key text NOT NULL, daily_target real NOT NULL, sort_order integer NOT NULL
    )`);
    await client.execute(`CREATE UNIQUE INDEX tracker_nutrients_tracker_id_nutrient_key_uidx
      ON tracker_nutrients(tracker_id, nutrient_key)`);
    await client.execute("INSERT INTO tracker_nutrients VALUES ('old', 'tracker', 'sodium', 2300, 0)");
    const sql = readFileSync(new URL("../drizzle/legacy/p6-target-provenance.sql", import.meta.url), "utf8");
    await client.execute(sql);
    expect(await db.select().from(trackerNutrients)).toEqual([{
      id: "old", trackerId: "tracker", nutrientKey: "sodium", dailyTarget: 2300,
      sortOrder: 0, isCustomTarget: false,
    }]);
    await client.execute("DELETE FROM trackers WHERE id = 'tracker'");
    expect(await db.select().from(trackerNutrients)).toEqual([]);
  } finally {
    client.close();
  }
});

it("generates a fresh schema with an SQL default for target provenance", async () => {
  const { client } = await createTestDb();
  try {
    const { rows } = await client.execute("PRAGMA table_info(tracker_nutrients)");
    const column = rows.find((row) => row.name === "is_custom_target");
    expect(column).toMatchObject({ name: "is_custom_target", notnull: 1 });
    expect(["0", "false"]).toContain(String(column?.dflt_value).toLowerCase());
  } finally {
    client.close();
  }
});

vi.mock("@/db", async (original) => ({
  ...await original<typeof import("@/db")>(), getDb: vi.fn(),
}));
let token: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => name === SESSION_COOKIE && token ? { name, value: token } : undefined,
  }),
}));

let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;
let alice: { id: string; token: string };
let bob: { id: string; token: string };
const iso = "2026-11-26T03:15:00.000Z";
const root = "/api/trackers";
const db = () => fixture!.db;
beforeEach(async () => {
  vi.setSystemTime(new Date(iso));
  fixture = await createTestDb();
  vi.mocked(getDb).mockResolvedValue(db());
  async function account(name: string) {
    const [user] = await db().insert(users).values({
      name, email: `${name}@example.test`, passwordHash: "fixture", createdAt: iso,
    }).returning();
    const session = makeSession(user.id);
    await db().insert(sessions).values(session.row);
    return { id: user.id, token: session.token };
  }
  alice = await account("alice");
  bob = await account("bob");
  token = alice.token;
});
afterEach(() => {
  token = undefined;
  fixture?.client.close();
  fixture = undefined;
  vi.mocked(getDb).mockReset();
});

function request(path: string, method = "GET", body?: unknown) {
  return new Request(`https://app.example.test${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  });
}
const selection = [{ nutrientKey: "vitaminC" }, { nutrientKey: "sodium", customDailyTarget: 2300 },
  { nutrientKey: "fiber" }];

async function newTracker(body: unknown = { name: "Daily care", nutrients: selection }) {
  const { POST } = await import("@/app/api/trackers/route");
  const result = await POST(request(root, "POST", body));
  expect(result.status).toBe(201);
  return (await result.json()).tracker;
}

it("creates trackers with canonical ordered selections and lists only the session owner", async () => {
  const { GET } = await import("@/app/api/trackers/route");
  const tracker = await newTracker({ name: " Care ", healthFlags: ["hypertension"], nutrients: selection });
  expect(tracker).toMatchObject({ name: "Care", healthFlags: ["hypertension"], createdAt: iso });
  expect(tracker).not.toHaveProperty("userId");
  expect(tracker.nutrients).toEqual([
    { nutrientKey: "vitaminC", dailyTarget: 90, isCustomTarget: false, sortOrder: 0,
      label: "Vitamin C", unit: "mg", targetKind: "goal" },
    { nutrientKey: "sodium", dailyTarget: 2300, isCustomTarget: true, sortOrder: 1,
      label: "Sodium", unit: "mg", targetKind: "upper" },
    { nutrientKey: "fiber", dailyTarget: 28, isCustomTarget: false, sortOrder: 2,
      label: "Fiber", unit: "g", targetKind: "goal" },
  ]);
  expect(await db().select().from(trackerNutrients)).toEqual(expect.arrayContaining([
    expect.objectContaining({ dailyTarget: 2300, isCustomTarget: true }),
  ]));
  token = bob.token;
  expect(await (await GET()).json()).toEqual({ trackers: [] });
  const other = await newTracker({ name: "Medicine only", nutrients: [] });
  token = alice.token;
  const list = await GET();
  expect(list.headers.get("Cache-Control")).toBe("no-store");
  expect(await list.json()).toEqual({ trackers: [tracker] });
  expect(other.nutrients).toEqual([]);
});

it("rejects bad tracker selections, spoofed ownership, and unauthenticated collection requests", async () => {
  const { GET, POST } = await import("@/app/api/trackers/route");
  const base = { name: "Daily", nutrients: selection };
  for (const patch of [
    { name: "  " }, { nutrients: [{ nutrientKey: "salt" }] },
    { nutrients: [selection[0], selection[0]] }, { healthFlags: ["asthma"] },
    { nutrients: [{ nutrientKey: "protein", customDailyTarget: 0 }] },
    { userId: bob.id },
  ]) {
    expect((await POST(request(root, "POST", { ...base, ...patch }))).status).toBe(400);
  }
  expect((await POST(new Request(`https://app.example.test${root}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  }))).status).toBe(400);
  expect(await (await GET()).json()).toEqual({ trackers: [] });
  token = undefined;
  expect((await GET()).status).toBe(401);
  expect((await POST(request(root, "POST", base))).status).toBe(401);
});

const date = "2026-11-25";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

it("patches owned metadata and replaces the selection only when sent", async () => {
  const { GET, PATCH, DELETE } = await import("@/app/api/trackers/[id]/route");
  const original = await newTracker();
  const { id } = original;
  const path = `${root}/${id}`;
  expect(await (await GET(request(path), ctx(id))).json()).toEqual({ tracker: original });
  vi.setSystemTime(new Date("2026-11-26T03:16:00Z"));
  const changed = await PATCH(request(path, "PATCH", { name: "New name", healthFlags: ["diabetes"] }), ctx(id));
  expect(changed.status).toBe(200);
  expect((await changed.json()).tracker).toMatchObject({
    name: "New name", healthFlags: ["diabetes"], updatedAt: "2026-11-26T03:16:00.000Z",
    nutrients: original.nutrients,
  });
  const reset = await PATCH(request(path, "PATCH", { nutrients: [{ nutrientKey: "sodium" }] }), ctx(id));
  expect((await reset.json()).tracker.nutrients).toEqual([
    expect.objectContaining({ nutrientKey: "sodium", dailyTarget: 2300, isCustomTarget: false, sortOrder: 0 }),
  ]);
  expect((await PATCH(request(path, "PATCH", {}), ctx(id))).status).toBe(400);
  await db().insert(intakeLogs).values({
    trackerId: id, userId: alice.id, logDate: date, loggedAt: iso, entryType: "food",
    displayName: "Old food", quantity: 100, unit: "g", computedNutrientsJson: { sodium: 50 },
  });
  expect(await (await DELETE(request(path, "DELETE"), ctx(id))).json()).toEqual({ ok: true });
  expect(await db().select().from(trackerNutrients)).toEqual([]);
  expect(await db().select().from(intakeLogs)).toEqual([]);
  expect((await GET(request(path), ctx(id))).status).toBe(404);
});

it("makes another user's tracker indistinguishable from a missing tracker", async () => {
  const { GET, PATCH, DELETE } = await import("@/app/api/trackers/[id]/route");
  const { id } = await newTracker();
  token = bob.token;
  for (const [method, handler, body] of [
    ["GET", GET, undefined], ["PATCH", PATCH, { nutrients: [] }], ["DELETE", DELETE, undefined],
  ] as const) {
    const foreign = await handler(request(`${root}/${id}`, method, body), ctx(id));
    const missing = await handler(request(`${root}/missing`, method, body), ctx("missing"));
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    token = undefined;
    expect((await handler(request(`${root}/${id}`, method, body), ctx(id))).status).toBe(401);
    token = bob.token;
  }
  token = alice.token;
  expect((await (await GET(request(`${root}/${id}`), ctx(id))).json()).tracker.nutrients).toHaveLength(3);
});
