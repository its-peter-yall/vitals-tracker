import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { intakeLogs, sessions, trackerNutrients, trackers, users } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { makeSession, SESSION_COOKIE } from "@/lib/auth/session";

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
const db = () => fixture!.db;
const loggedAt = "2024-03-13T02:15:00.000Z";
const endDate = "2024-03-12";

beforeEach(async () => {
  vi.setSystemTime(new Date(loggedAt));
  fixture = await createTestDb();
  vi.mocked(getDb).mockResolvedValue(db());
  async function account(name: string) {
    const [user] = await db().insert(users).values({
      name, email: `${name}@example.test`, passwordHash: "fixture", createdAt: loggedAt,
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

async function makeTracker(userId = alice.id, pinNutrients = true) {
  const [tracker] = await db().insert(trackers).values({
    userId, name: "Daily", healthFlagsJson: ["diabetes", "hypertension"],
    createdAt: loggedAt, updatedAt: loggedAt,
  }).returning();
  if (pinNutrients) await db().insert(trackerNutrients).values([
    { trackerId: tracker.id, nutrientKey: "protein", dailyTarget: 10, isCustomTarget: true, sortOrder: 0 },
    { trackerId: tracker.id, nutrientKey: "vitaminC", dailyTarget: 20, isCustomTarget: true, sortOrder: 1 },
    { trackerId: tracker.id, nutrientKey: "sodium", dailyTarget: 2300, sortOrder: 2 },
  ]);
  return tracker.id;
}

function food(trackerId: string, logDate: string, computedNutrientsJson: Record<string, number>, userId = alice.id) {
  return {
    trackerId, userId, logDate, loggedAt, computedNutrientsJson,
    displayName: "Food", quantity: 100, entryType: "food" as const, unit: "g" as const,
  };
}

async function query(id: string, queryString = `endDate=${endDate}`) {
  const { GET } = await import("@/app/api/trackers/[id]/analytics/route");
  return GET(new Request(`https://app.example.test/api/trackers/${id}/analytics?${queryString}`),
    { params: Promise.resolve({ id }) });
}

async function analytics(id: string, range = "7d") {
  const res = await query(id, `range=${range}&endDate=${endDate}`);
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  return (await res.json()).analytics;
}

it("rolls up inclusive 7d and 30d local calendars, zero days, capped completion and distinct caution dates", async () => {
  const id = await makeTracker();
  const other = await makeTracker();
  await db().insert(intakeLogs).values([
    food(id, "2024-02-11", { protein: 500 }), food(id, "2024-03-13", { protein: 500 }),
    food(id, "2024-02-29", { protein: 10, vitaminC: 20 }),
    food(id, "2024-03-06", { protein: 5, sodium: 2200, addedSugars: 30 }),
    food(id, endDate, { protein: 20, vitaminC: 10, sodium: 2000 }),
    food(other, endDate, { protein: 500 }),
    food(id, endDate, { protein: 500, sodium: 9999 }, bob.id),
  ]);
  const week = await analytics(id);
  expect(week).toMatchObject({
    range: "7d", startDate: "2024-03-06", endDate, activeDays: 2,
    cautionDays: ["2024-03-06"], cautionDayCount: 1, onTrack: [],
    needsAttention: [
      { nutrientKey: "protein", reason: "lowCompletion" },
      { nutrientKey: "vitaminC", reason: "lowCompletion" },
      { nutrientKey: "sodium", reason: "upperExceeded" },
    ],
  });
  expect(week.days.map((point: { date: string }) => point.date)).toEqual([
    "2024-03-06", "2024-03-07", "2024-03-08", "2024-03-09", "2024-03-10", "2024-03-11", endDate,
  ]);
  expect(week.days[0].alerts).toHaveLength(2);
  expect(week.days[1]).toEqual({ date: "2024-03-07", active: false, alerts: [] });
  expect(week.days[6].alerts).toEqual([]);
  const [protein, vitaminC, sodium] = week.trends;
  expect(protein.series).toHaveLength(7);
  expect(protein.series[1]).toEqual({ date: "2024-03-07", amount: 0, hasAmount: false });
  expect(protein.series[6]).toEqual({ date: endDate, amount: 20, hasAmount: true });
  expect(protein.averageCompletionPct).toBeCloseTo(150 / 7);
  expect(vitaminC.averageCompletionPct).toBeCloseTo(50 / 7);
  expect(sodium.averageCompletionPct).toBeNull();
  expect(week.averageCompletionPct).toBeCloseTo(100 / 7);

  const month = await analytics(id, "30d");
  expect(month).toMatchObject({ range: "30d", startDate: "2024-02-12", endDate, activeDays: 3,
    cautionDays: ["2024-03-06"], cautionDayCount: 1 });
  expect(month.days).toHaveLength(30);
  expect(month.trends[0].series).toHaveLength(30);
  expect(month.trends[0].series[17]).toEqual({ date: "2024-02-29", amount: 10, hasAmount: true });
  expect(month.days.at(-1).date).toBe(endDate);
  expect(month.averageCompletionPct).toBeCloseTo(200 / 30);
});

it("keeps empty windows quiet and uses the 80-percent and explicit-upper rules for insights", async () => {
  const id = await makeTracker();
  const empty = await analytics(id);
  expect(empty).toMatchObject({ activeDays: 0, cautionDayCount: 0, averageCompletionPct: 0,
    needsAttention: [], onTrack: [] });
  expect(empty.days).toHaveLength(7);
  await db().insert(intakeLogs).values([
    ...["06", "07", "08", "09", "10"].map((day) => food(id, `2024-03-${day}`, { protein: 10 })),
    food(id, "2024-03-11", { protein: 6, sodium: 2200 }),
  ]);
  // The numeric display target stays at 2300, but the explicit flag changes the impact threshold.
  const before = await analytics(id);
  expect(before.cautionDays).toEqual(["2024-03-11"]);
  expect(before.onTrack).toEqual([{ nutrientKey: "protein", reason: "goalOnTrack" }]);
  await db().update(trackerNutrients).set({ isCustomTarget: true })
    .where(eq(trackerNutrients.nutrientKey, "sodium"));
  const after = await analytics(id);
  expect(after.trends[0].averageCompletionPct).toBe(80);
  expect(after.cautionDays).toEqual([]);
  expect(after.onTrack).toEqual([
    { nutrientKey: "protein", reason: "goalOnTrack" },
    { nutrientKey: "sodium", reason: "upperWithinReference" },
  ]);
  expect(after.needsAttention).toEqual([{ nutrientKey: "vitaminC", reason: "lowCompletion" }]);
  expect((await (await query(id)).json()).analytics.range).toBe("7d");
});

it("rejects invalid ranges, impossible dates, and duplicate analytics params", async () => {
  const id = await makeTracker();
  for (const qs of ["range=8d&endDate=2024-03-12", "range=7d", "endDate=2023-02-29",
    "endDate=2024-03-12&endDate=2024-03-13", "range=7d&range=30d&endDate=2024-03-12",
    "range=30d&endDate=0001-01-01"]) {
    expect((await query(id, qs)).status).toBe(400);
  }
});
