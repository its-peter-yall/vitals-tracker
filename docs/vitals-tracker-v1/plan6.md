# P6 — Trackers, Intake Logs, Daily Summary & Analytics API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give authenticated users private tracker CRUD, local-date food and medicine logging with quantity edits and Undo, daily cautions, and 7/30-day analytics.

**Architecture:** Node route handlers authenticate and validate requests, then delegate to user-scoped Drizzle services. Intake snapshots preserve all computed nutrients independently of the food or medicine catalog; daily summary and analytics share one full-day impact evaluation before projecting selected nutrients. An additive target-provenance column distinguishes untouched catalog defaults from explicit overrides.

**Tech Stack:** Next.js 16 App Router, strict TypeScript, Node ≥24.15, Zod 4, Drizzle 0.45 + libSQL/SQLite/Turso, Vitest 5.

---

## Files and execution

| File | Responsibility |
| --- | --- |
| `src/lib/trackers/schemas.ts` | Strict Zod bodies, date query parsing, inferred inputs |
| `src/lib/trackers/service.ts` | Tracker and log persistence, snapshots, shared daily projection |
| `src/lib/analytics/types.ts` | Serializable analytics DTOs; safe for UI type-only imports |
| `src/lib/analytics/service.ts` | Calendar window and daily, trend, insight, and medicine rollups |
| `src/app/api/trackers/route.ts` | List and create trackers |
| `src/app/api/trackers/[id]/route.ts` | Read, edit, and delete one tracker |
| `src/app/api/trackers/[id]/logs/route.ts` | List a local day's logs and add a log |
| `src/app/api/trackers/[id]/logs/[logId]/route.ts` | Edit quantity and delete/Undo a log |
| `src/app/api/trackers/[id]/summary/route.ts` | Daily selected progress and nutritional cautions |
| `src/app/api/trackers/[id]/analytics/route.ts` | 7d/30d analytics |
| `tests/trackers-api.test.ts`, `tests/analytics.test.ts` | Direct handler tests against migrated in-memory libSQL |
| `src/db/schema.ts`, `drizzle/legacy/p6-target-provenance.sql` | **Only ownership exception:** one additive provenance column and its legacy upgrade |

- Run commands separately in Windows PowerShell 5.1 from the repo root. Stop on failures except the stated REDs. If already dispatched as the P6 worker, execute here, without further delegation. Stage only the task's paths; serialize commits with the orchestrator (use `git add --` and path quotes as shown). Do not change dependencies, state/other plans, upstream auth or nutrition code, or P4/P5/P7/P8 files.
- P1 exports `await getDb(): Promise<Db>`, `await createDb(url, authToken?)`, and `await createTestDb()` from `@/db/test-utils` (`{ client, db }`; always close). It generates fresh SQL directly from the schema; no existing Drizzle journal or committed baseline. P1 uses UUID defaults, cascades on tracker children, and `SET NULL` for removed food/medicine references. Never run `db:push`, `db:migrate` or SQL against a user/local/hosted DB as the worker.
- P2 exports `requireUser()` → `{ok:true,user}` or `{ok:false,response}` (`401`); `authJson` sends `Cache-Control: no-store`, and `readJson` accepts only `application/json` (optional charset) and returns `undefined` for bad JSON. Every handler uses `auth.user.id`; every tracker/log lookup/mutation is scoped, including nested log ID and parent matching. Private or missing resources share `404 {error:string}`. Bad bodies/dates are `400 {error:string}`. No echoed validation internals or client-supplied ownership fields. Async route params, Node runtime.
- P3 exports `NUTRIENT_CATALOG`, `NUTRIENT_KEYS`, `isNutrientKey`, `scaleFoodNutrients`, `scaleSupplementNutrients`, `sumDailyNutrients`, and `evaluateImpact({dailyTotals,healthFlags,customTargets})`. Work in canonical units; never add total sugars and added sugars together. Do not round a snapshot, an impact input, or a rollup.

## API handoff (P7/P8/P9)

| Method and path (base `/api/trackers`) | Request → success |
| --- | --- |
| `GET /` | `200 {trackers: Tracker[]}` |
| `POST /` | `{name, healthFlags?, nutrients}` → `201 {tracker: Tracker}` |
| `GET /[id]` | `200 {tracker: Tracker}` |
| `PATCH /[id]` | At least one of `name`, `healthFlags`, `nutrients` → `200 {tracker: Tracker}` |
| `DELETE /[id]` | `200 {ok:true}`; cascades logs and selected nutrients |
| `GET /[id]/logs?date=YYYY-MM-DD` | `200 {logs: IntakeLog[]}` newest first, including nullable `medicineNotes` |
| `POST /[id]/logs` | `{entryType:"food",foodId,quantity,unit:"g"\|"ml",logDate}` or `{entryType:"medicine",medicineId,quantity,unit:"dose",logDate}` → `201 {log: IntakeLog}` |
| `PATCH /[id]/logs/[logId]` | `{quantity}` → `200 {log: IntakeLog}` |
| `DELETE /[id]/logs/[logId]` | `200 {ok:true}`; same endpoint for Undo **of an add**, not a restore API; repeat after deletion → `404` |
| `GET /[id]/summary?date=YYYY-MM-DD` | `200 {date,progress,alerts}`; list logs separately |
| `GET /[id]/analytics?range=7d&endDate=YYYY-MM-DD` | `200 {analytics: Analytics}`; `range` defaults to `7d`, also accepts `30d`; always send `endDate` |

- `Tracker` returns `id`, `name`, `healthFlags`, timestamps, and `nutrients` ordered by input order. Each read entry has `nutrientKey`, `dailyTarget`, `isCustomTarget`, `sortOrder`, catalog `label`/`unit`, and `targetKind` (`goal` or `upper`). **Write** entries are `{nutrientKey, customDailyTarget?}`. Omit `customDailyTarget` for untouched/reset defaults; send it for an explicit target even if numerically equal to the catalog default. PATCH without `nutrients` preserves selections and provenance. If present, the array replaces the entire ordered selection, and the UI must carry forward any retained explicit edits. `[]` is valid for medicine-only trackers. Flags are optional on create (default `[]`); only `diabetes`/`hypertension`.
- P7 computes dates using the device/user's local calendar (not `toISOString().slice(0, 10)`). The server never infers dates from `loggedAt` (server UTC audit time) or from a timezone. Require real calendar dates; analytics uses UTC arithmetic solely to enumerate calendar labels safely across DST/leap days.
- P7 passes a saved/curated source ID, not a nutrient map. P4/P5 save confirmed/manual items first; P6 does not resolve, scan, or add to My Medicines. Food uses P3's 1 g/ml approximation; prescriptions have `{}` for nutrients, and `supplement`/`both` use per-dose values. A quantity edit rescales the historical snapshot by new/old quantity, preserving name, unit, source link, date and timestamp; never recalculate from the current catalog. `medicineNotes` is nullable *current* plain-language guidance from a readable source, not part of the immutable name/nutrient snapshot; it becomes `null` if the cabinet item is removed. Targets and quantities must be finite numbers between `0.000001` and `1_000_000` inclusive.
- Summary progress shows only pinned nutrients; alerts use **all** snapshots. Cautions use P3's copy and nutritional trigger details only (no predicted clinical readings). Defaults are strict above 35 g total sugars, 25 g added sugars, 2,000 mg sodium; only explicit relevant overrides replace them. Progress stores `amount:0` with `hasAmount:false` where unreported; do not present unreported quantities as measured zero. Use rounded numbers only for display.
- P8: `days` and each nutrient's `series` have N points (including empty dates), ascending, ending on `endDate` inclusive. A day is active when any log exists. A caution day has ≥1 alert and counts once. For goal nutrients, per-day completion = `min(amount / dailyTarget, 1) * 100`, window average over **all** N days (empty days are zero), overall average across goal nutrients only. With no goal nutrients the overall value is `null`. Sugars and sodium are upper references, never goals to fill. For active windows, goal average ≥80% is On Track, otherwise Needs Attention (`needsAttention`, not a clinical assessment). An upper nutrient needs attention if it crossed its display reference or its specific impact threshold on any day; On Track only if observed and not exceeded. Empty windows have no highlights. Use current tracker targets/flags for historical views; no target history is introduced. Medicine adherence means **distinct logged days / N** per source, not prescribed doses or missed-medication claims; include supplements and prescriptions.

### Task 1: Persist provenance and prove the additive upgrade

**Files:** Modify `src/db/schema.ts`; create `drizzle/legacy/p6-target-provenance.sql` and `tests/trackers-api.test.ts`. No change to `src/db/test-utils.ts`: it already generates from the live schema.

- [ ] **Write RED** in `tests/trackers-api.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createDb } from "@/db";
import { trackerNutrients } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";

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
```

- [ ] **Run RED:** `npx vitest run tests/trackers-api.test.ts -t "target provenance"` → missing upgrade file and new column.
- [ ] **Implement:** In `src/db/schema.ts` insert after `dailyTarget`; do not touch any other table:

```ts
  isCustomTarget: integer("is_custom_target", { mode: "boolean" }).notNull().default(false),
```

Create `drizzle/legacy/p6-target-provenance.sql`:

```sql
ALTER TABLE tracker_nutrients ADD COLUMN is_custom_target integer DEFAULT 0 NOT NULL;
```

This is a **one-time upgrade for an existing pre-P6 schema**, not a Drizzle journal entry or a second migration for a fresh baseline. Ship it before deploying P6 code to such a DB. The deployer checks `PRAGMA table_info(tracker_nutrients)` and runs the SQL only if the existing table lacks `is_custom_target`; check again afterward. Back up the intended DB before deployment. The fresh baseline generated from `src/db/schema.ts` already includes this column; leave journal ownership to the orchestrator. Legacy rows have no recoverable intent: preserve their display targets, but treat them as non-custom for alerts until explicitly set again.

- [ ] **Run GREEN:** `npx vitest run tests/trackers-api.test.ts tests/db-schema.test.ts` → both provenance checks and the existing P1 schema tests pass.
- [ ] **Commit:**

```powershell
git add -- src/db/schema.ts drizzle/legacy/p6-target-provenance.sql tests/trackers-api.test.ts
git commit -m "feat(trackers): preserve explicit target provenance"
```

### Task 2: Create and list isolated trackers

**Files:** Modify `tests/trackers-api.test.ts`; create `src/lib/trackers/schemas.ts`, `src/lib/trackers/service.ts`, `src/app/api/trackers/route.ts`.

- [ ] **Write RED:** In `tests/trackers-api.test.ts`, replace the Vitest import with `import { afterEach, beforeEach, expect, it, vi } from "vitest";`, the DB import with `import { createDb, getDb } from "@/db";`, and the schema import with `import { sessions, trackerNutrients, users } from "@/db/schema";`. Add `import { makeSession, SESSION_COOKIE } from "@/lib/auth/session";`. Append:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/trackers-api.test.ts -t "creates trackers|bad tracker selections"` → missing collection route.
- [ ] **Implement** `src/lib/trackers/schemas.ts`:

```ts
import * as z from "zod";
import { isNutrientKey, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientKey } from "@/lib/nutrients/types";

const positiveAmount = z.number().min(0.000001).max(1_000_000);
const name = z.string().trim().min(1).max(100);
const healthFlags = z.array(z.enum(["diabetes", "hypertension"])).max(2)
  .refine((flags) => new Set(flags).size === flags.length);
const nutrients = z.array(z.strictObject({
  nutrientKey: z.custom<NutrientKey>(isNutrientKey),
  customDailyTarget: positiveAmount.optional(),
})).max(NUTRIENT_KEYS.length)
  .refine((rows) => new Set(rows.map((row) => row.nutrientKey)).size === rows.length);

export const createTrackerSchema = z.strictObject({ name, healthFlags: healthFlags.default([]), nutrients });
export type CreateTracker = z.output<typeof createTrackerSchema>;
```

Create `src/lib/trackers/service.ts`:

```ts
import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { trackerNutrients, trackers } from "@/db/schema";
import { isNutrientKey, NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import type { CreateTracker } from "./schemas";

type Reader = Pick<Db, "select">;
type TrackerRow = typeof trackers.$inferSelect;
type NutrientRow = typeof trackerNutrients.$inferSelect;

function trackerScope(userId: string, id?: string) {
  return and(eq(trackers.userId, userId), id === undefined ? undefined : eq(trackers.id, id));
}

function nutrientView(row: NutrientRow) {
  const { nutrientKey, dailyTarget, isCustomTarget, sortOrder } = row;
  if (!isNutrientKey(nutrientKey)) return null;
  const { label, unit } = NUTRIENT_CATALOG[nutrientKey];
  const targetKind = nutrientKey === "sodium" || nutrientKey === "addedSugars" || nutrientKey === "totalSugars"
    ? "upper" as const : "goal" as const;
  return { nutrientKey, dailyTarget, isCustomTarget, sortOrder, label, unit, targetKind };
}

export type TrackerNutrient = NonNullable<ReturnType<typeof nutrientView>>;
export type Tracker = {
  id: string;
  name: string;
  healthFlags: TrackerRow["healthFlagsJson"];
  createdAt: string;
  updatedAt: string;
  nutrients: TrackerNutrient[];
};

function trackerView(row: TrackerRow): Tracker {
  return { id: row.id, name: row.name, healthFlags: row.healthFlagsJson,
    createdAt: row.createdAt, updatedAt: row.updatedAt, nutrients: [] };
}

function nutrientRows(trackerId: string, selection: CreateTracker["nutrients"]) {
  return selection.map(({ nutrientKey, customDailyTarget }, sortOrder) => ({
    trackerId, nutrientKey, sortOrder, dailyTarget: customDailyTarget ?? NUTRIENT_CATALOG[nutrientKey].defaultDailyTarget,
    isCustomTarget: customDailyTarget !== undefined,
  }));
}

async function loadTrackers(db: Reader, userId: string, id?: string) {
  const rows = await db.select({ tracker: trackers, nutrient: trackerNutrients }).from(trackers)
    .leftJoin(trackerNutrients, eq(trackerNutrients.trackerId, trackers.id))
    .where(trackerScope(userId, id))
    .orderBy(desc(trackers.createdAt), asc(trackers.id), asc(trackerNutrients.sortOrder));
  const views = new Map<string, Tracker>();
  for (const { tracker, nutrient } of rows) {
    const view = views.get(tracker.id) ?? trackerView(tracker);
    const selected = nutrient && nutrientView(nutrient);
    if (selected) view.nutrients.push(selected);
    views.set(tracker.id, view);
  }
  return [...views.values()];
}

async function findTracker(db: Reader, userId: string, id: string) {
  return (await loadTrackers(db, userId, id))[0] ?? null;
}

export const listTrackers = (db: Db, userId: string) => loadTrackers(db, userId);

export function createTracker(db: Db, userId: string, input: CreateTracker) {
  return db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const [row] = await tx.insert(trackers).values({
      userId, name: input.name, healthFlagsJson: input.healthFlags, createdAt: now, updatedAt: now,
    }).returning({ id: trackers.id });
    const selected = nutrientRows(row.id, input.nutrients);
    if (selected.length) await tx.insert(trackerNutrients).values(selected);
    return (await findTracker(tx, userId, row.id))!;
  });
}
```

Create `src/app/api/trackers/route.ts`:

```ts
import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { createTrackerSchema } from "@/lib/trackers/schemas";
import { createTracker, listTrackers } from "@/lib/trackers/service";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return authJson({ trackers: await listTrackers(await getDb(), auth.user.id) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = createTrackerSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the tracker name, nutrients, and targets." }, 400);
  const tracker = await createTracker(await getDb(), auth.user.id, parsed.data);
  return authJson({ tracker }, 201);
}
```

- [ ] **Run GREEN:** `npx vitest run tests/trackers-api.test.ts` → provenance and collection tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/trackers/schemas.ts src/lib/trackers/service.ts src/app/api/trackers/route.ts tests/trackers-api.test.ts
git commit -m "feat(trackers): create and list owned trackers"
```

### Task 3: Read, update and delete one tracker

**Files:** Modify `src/lib/trackers/schemas.ts`, `src/lib/trackers/service.ts`, `tests/trackers-api.test.ts`; create `src/app/api/trackers/[id]/route.ts`.

- [ ] **Write RED:** Add `intakeLogs` to the test schema import and append:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/trackers-api.test.ts -t "patches owned|indistinguishable from a missing tracker"` → missing detail route.
- [ ] **Implement:** Append to `src/lib/trackers/schemas.ts`:

```ts
export const patchTrackerSchema = z.strictObject({
  name: name.optional(), healthFlags: healthFlags.optional(), nutrients: nutrients.optional(),
}).refine((input) => input.name !== undefined || input.healthFlags !== undefined || input.nutrients !== undefined);
export type PatchTracker = z.output<typeof patchTrackerSchema>;
```

Add `PatchTracker` to the service schema type import, export `findTracker`, and append to `src/lib/trackers/service.ts`:

```ts
export function updateTracker(db: Db, userId: string, id: string, input: PatchTracker) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(trackers).set({
      name: input.name, healthFlagsJson: input.healthFlags, updatedAt: new Date().toISOString(),
    }).where(trackerScope(userId, id)).returning({ id: trackers.id });
    if (!row) return null;
    if (input.nutrients !== undefined) {
      // The owned parent UPDATE above is the gate for child writes in this transaction.
      await tx.delete(trackerNutrients).where(eq(trackerNutrients.trackerId, row.id));
      const selected = nutrientRows(row.id, input.nutrients);
      if (selected.length) await tx.insert(trackerNutrients).values(selected);
    }
    return findTracker(tx, userId, row.id);
  });
}

export async function deleteTracker(db: Db, userId: string, id: string) {
  const [row] = await db.delete(trackers).where(trackerScope(userId, id)).returning({ id: trackers.id });
  return Boolean(row);
}
```

Create `src/app/api/trackers/[id]/route.ts`:

```ts
import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { patchTrackerSchema } from "@/lib/trackers/schemas";
import { deleteTracker, findTracker, updateTracker } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const missingTracker = () => authJson({ error: "Tracker not found." }, 404);

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const tracker = await findTracker(await getDb(), auth.user.id, (await params).id);
  return tracker ? authJson({ tracker }) : missingTracker();
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = patchTrackerSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the tracker name, nutrients, and targets." }, 400);
  const tracker = await updateTracker(await getDb(), auth.user.id, (await params).id, parsed.data);
  return tracker ? authJson({ tracker }) : missingTracker();
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const deleted = await deleteTracker(await getDb(), auth.user.id, (await params).id);
  return deleted ? authJson({ ok: true }) : missingTracker();
}
```

- [ ] **Run GREEN:** `npx vitest run tests/trackers-api.test.ts` → collection, detail, cascade and isolation pass.
- [ ] **Commit:**

```powershell
git add -- 'src/app/api/trackers/[id]/route.ts' src/lib/trackers/schemas.ts src/lib/trackers/service.ts tests/trackers-api.test.ts
git commit -m "feat(trackers): update and delete owned trackers"
```

### Task 4: Add and list local-date logs from readable catalog items

**Files:** Modify `src/lib/trackers/schemas.ts`, `src/lib/trackers/service.ts`, `tests/trackers-api.test.ts`; create `src/app/api/trackers/[id]/logs/route.ts`.

- [ ] **Write RED:** Add `import { eq } from "drizzle-orm";` and add `foods` and `medicines` to the schema import in `tests/trackers-api.test.ts`. Append:

```ts
async function catalog() {
  const [food, privateFood] = await db().insert(foods).values([
    { name: "Drink", aliasesJson: [], defaultUnit: "ml", source: "curated", createdAt: iso,
      nutrientsPer100Json: { vitaminC: 10, addedSugars: 30, sodium: 100, protein: 2 } },
    { name: "Private food", userId: bob.id, aliasesJson: [], defaultUnit: "g", source: "manual",
      createdAt: iso, nutrientsPer100Json: { protein: 20 } },
  ]).returning();
  const base = { defaultDoseLabel: "1 tablet", createdAt: iso, source: "manual" as const };
  const [supplement, prescription, both, privateMedicine] = await db().insert(medicines).values([
    { ...base, brandName: "Vitamin", userId: alice.id, category: "supplement",
      nutrientsPerDoseJson: { vitaminC: 25 } },
    { ...base, brandName: "Prescription", userId: alice.id, category: "prescription",
      nutrientsPerDoseJson: { vitaminC: 999 }, notes: "Take with food as directed." },
    { ...base, brandName: "Combined", userId: null, category: "both",
      nutrientsPerDoseJson: { vitaminC: 5, sodium: 15 } },
    { ...base, brandName: "Private med", userId: bob.id, category: "supplement",
      nutrientsPerDoseJson: { vitaminC: 50 } },
  ]).returning();
  return { food, privateFood, supplement, prescription, both, privateMedicine };
}

const foodBody = (foodId: string, patch = {}) => ({
  entryType: "food", foodId, quantity: 100, unit: "ml", logDate: date, ...patch,
});
const medicineBody = (medicineId: string, patch = {}) => ({
  entryType: "medicine", medicineId, quantity: 1, unit: "dose", logDate: date, ...patch,
});
async function addLog(id: string, body: unknown) {
  const { POST } = await import("@/app/api/trackers/[id]/logs/route");
  const res = await POST(request(`${root}/${id}/logs`, "POST", body), ctx(id));
  expect(res.status).toBe(201);
  return (await res.json()).log;
}

it("persists full food and medicine snapshots and buckets by local date, not loggedAt", async () => {
  const { GET } = await import("@/app/api/trackers/[id]/logs/route");
  const { id } = await newTracker();
  const { food, supplement, prescription, both } = await catalog();
  const drink = await addLog(id, foodBody(food.id, { quantity: 150 }));
  expect(drink).toMatchObject({
    displayName: "Drink", trackerId: id, foodId: food.id, medicineId: null,
    logDate: date, loggedAt: iso, computedNutrientsJson: { vitaminC: 15, addedSugars: 45, sodium: 150, protein: 3 },
  });
  expect(drink).not.toHaveProperty("userId");
  vi.setSystemTime(new Date("2026-11-26T03:16:00Z"));
  const vitamin = await addLog(id, medicineBody(supplement.id, { quantity: 2 }));
  expect(vitamin.computedNutrientsJson).toEqual({ vitaminC: 50 });
  const rx = await addLog(id, medicineBody(prescription.id));
  expect(rx).toMatchObject({ computedNutrientsJson: {}, medicineNotes: "Take with food as directed." });
  const combined = await addLog(id, medicineBody(both.id, { quantity: 0.5 }));
  expect(combined.computedNutrientsJson).toEqual({ vitaminC: 2.5, sodium: 7.5 });
  const nextDay = await addLog(id, foodBody(food.id, { logDate: "2026-11-26", quantity: 50, unit: "g" }));
  expect(nextDay.computedNutrientsJson).toEqual({ vitaminC: 5, addedSugars: 15, sodium: 50, protein: 1 });
  await db().update(foods).set({ name: "Changed", nutrientsPer100Json: { vitaminC: 99 } }).where(eq(foods.id, food.id));
  const list = await GET(request(`${root}/${id}/logs?date=${date}`), ctx(id));
  expect(list.headers.get("Cache-Control")).toBe("no-store");
  const { logs } = await list.json();
  expect(logs).toHaveLength(4);
  expect(logs.at(-1)).toEqual(drink);
  expect(logs.map((log: { id: string }) => log.id)).not.toContain(nextDay.id);
  expect((await db().select().from(intakeLogs).where(eq(intakeLogs.id, drink.id)))[0])
    .toMatchObject({ userId: alice.id, computedNutrientsJson: drink.computedNutrientsJson });
});

it("rejects spoofed or invalid log writes and hides private source items and trackers", async () => {
  const { GET, POST } = await import("@/app/api/trackers/[id]/logs/route");
  const { id } = await newTracker();
  const { food, privateFood, privateMedicine } = await catalog();
  const path = `${root}/${id}/logs`;
  for (const body of [
    foodBody(food.id, { unit: "dose" }), foodBody(food.id, { quantity: 0 }),
    foodBody(food.id, { logDate: "2026-02-29" }), foodBody(food.id, { userId: alice.id }),
    foodBody(food.id, { computedNutrientsJson: { sodium: 0 } }), foodBody(food.id, { quantity: "50" }),
    medicineBody(privateMedicine.id, { unit: "g" }),
  ]) expect((await POST(request(path, "POST", body), ctx(id))).status).toBe(400);
  for (const body of [foodBody(privateFood.id), medicineBody(privateMedicine.id), foodBody("missing")]) {
    const res = await POST(request(path, "POST", body), ctx(id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tracker or item not found." });
  }
  expect((await GET(request(`${path}?date=2026-11-25T00:00:00Z`), ctx(id))).status).toBe(400);
  expect((await GET(request(`${path}?date=${date}&date=${date}`), ctx(id))).status).toBe(400);
  expect((await GET(request(path), ctx(id))).status).toBe(400);
  const saved = await addLog(id, foodBody(food.id, { logDate: "2024-02-29" }));
  expect(saved.logDate).toBe("2024-02-29");
  token = bob.token;
  expect((await GET(request(`${path}?date=${date}`), ctx(id))).status).toBe(404);
  expect((await POST(request(path, "POST", foodBody(food.id)), ctx(id))).status).toBe(404);
  token = undefined;
  expect((await GET(request(`${path}?date=${date}`), ctx(id))).status).toBe(401);
  expect((await POST(request(path, "POST", foodBody(food.id)), ctx(id))).status).toBe(401);
  expect(await db().select().from(intakeLogs)).toHaveLength(1);
});
```

- [ ] **Run RED:** `npx vitest run tests/trackers-api.test.ts -t "persists full food|invalid log writes"` → missing logs collection route.
- [ ] **Implement:** Append to `src/lib/trackers/schemas.ts`:

```ts
export const localDateSchema = z.iso.date().refine((date) => date >= "0001-01-01");
const id = z.string().min(1).max(128);
const logFields = { logDate: localDateSchema, quantity: positiveAmount };
export const createLogSchema = z.discriminatedUnion("entryType", [
  z.strictObject({ ...logFields, entryType: z.literal("food"), foodId: id, unit: z.enum(["g", "ml"]) }),
  z.strictObject({ ...logFields, entryType: z.literal("medicine"), medicineId: id, unit: z.literal("dose") }),
]);
export type CreateLog = z.output<typeof createLogSchema>;

export function dateFromRequest(request: Request) {
  const dates = new URL(request.url).searchParams.getAll("date");
  return localDateSchema.safeParse(dates.length === 1 ? dates[0] : undefined);
}
```

In `src/lib/trackers/service.ts`, add `isNull` and `or` to the Drizzle import, `foods`, `intakeLogs`, `medicines` to the schema import, `CreateLog` to the schema type import, and `import { scaleFoodNutrients, scaleSupplementNutrients } from "@/lib/nutrients/calculator";`. Append:

```ts
type LogRow = typeof intakeLogs.$inferSelect;

function logScope(userId: string, trackerId: string) {
  return and(eq(intakeLogs.userId, userId), eq(intakeLogs.trackerId, trackerId));
}

async function ownsTracker(db: Reader, userId: string, trackerId: string) {
  const [row] = await db.select({ id: trackers.id }).from(trackers)
    .where(trackerScope(userId, trackerId)).limit(1);
  return Boolean(row);
}

function logView(row: LogRow, medicineNotes: string | null) {
  const { id, trackerId, logDate, loggedAt, entryType, foodId, medicineId, displayName,
    quantity, unit, computedNutrientsJson } = row;
  return { id, trackerId, logDate, loggedAt, entryType, foodId, medicineId, displayName,
    quantity, unit, computedNutrientsJson, medicineNotes };
}
export type IntakeLog = ReturnType<typeof logView>;

function readableMedicine(userId: string) {
  return or(eq(medicines.userId, userId), isNull(medicines.userId));
}

async function findMedicine(db: Reader, userId: string, id: string) {
  const [medicine] = await db.select().from(medicines)
    .where(and(eq(medicines.id, id), readableMedicine(userId))).limit(1);
  return medicine;
}

export class InvalidSnapshotAmount extends Error {}

function checkedSnapshot(calculate: () => Record<string, number>) {
  try {
    const snapshot = calculate();
    // Reject implausibly large stored results, including from older catalog imports.
    if (Object.values(snapshot).some((value) => value > Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("Snapshot amount exceeds the numeric limit.");
    }
    return snapshot;
  } catch (error) {
    if (error instanceof RangeError) throw new InvalidSnapshotAmount();
    throw error;
  }
}

export async function listLogs(db: Db, userId: string, trackerId: string, date: string) {
  if (!await ownsTracker(db, userId, trackerId)) return null;
  const rows = await db.select({ log: intakeLogs, notes: medicines.notes }).from(intakeLogs)
    .leftJoin(medicines, and(eq(medicines.id, intakeLogs.medicineId), readableMedicine(userId)))
    .where(and(logScope(userId, trackerId), eq(intakeLogs.logDate, date)))
    .orderBy(desc(intakeLogs.loggedAt), asc(intakeLogs.id));
  return rows.map(({ log, notes }) => logView(log, notes));
}

export function createLog(db: Db, userId: string, trackerId: string, input: CreateLog) {
  return db.transaction(async (tx) => {
    if (!await ownsTracker(tx, userId, trackerId)) return null;
    const common = { trackerId, userId, logDate: input.logDate, loggedAt: new Date().toISOString(),
      quantity: input.quantity, unit: input.unit, entryType: input.entryType };
    if (input.entryType === "food") {
      const [food] = await tx.select().from(foods).where(and(
        eq(foods.id, input.foodId), or(eq(foods.userId, userId), isNull(foods.userId)),
      )).limit(1);
      if (!food) return null;
      const computedNutrientsJson = checkedSnapshot(() => scaleFoodNutrients(
        { defaultUnit: food.defaultUnit, nutrientsPer100: food.nutrientsPer100Json }, input.quantity, input.unit,
      ));
      const [row] = await tx.insert(intakeLogs).values({
        ...common, foodId: food.id, displayName: food.name, computedNutrientsJson,
      }).returning();
      return logView(row, null);
    }
    const medicine = await findMedicine(tx, userId, input.medicineId);
    if (!medicine) return null;
    const computedNutrientsJson = medicine.category === "prescription" ? {} :
      checkedSnapshot(() => scaleSupplementNutrients(medicine.nutrientsPerDoseJson, input.quantity));
    const [row] = await tx.insert(intakeLogs).values({
      ...common, medicineId: medicine.id, displayName: medicine.brandName, computedNutrientsJson,
    }).returning();
    return logView(row, medicine.notes);
  });
}
```

Create `src/app/api/trackers/[id]/logs/route.ts`:

```ts
import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { createLogSchema, dateFromRequest } from "@/lib/trackers/schemas";
import { createLog, InvalidSnapshotAmount, listLogs } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const date = dateFromRequest(request);
  if (!date.success) return authJson({ error: "Choose a valid local date." }, 400);
  const logs = await listLogs(await getDb(), auth.user.id, (await params).id, date.data);
  return logs ? authJson({ logs }) : authJson({ error: "Tracker not found." }, 404);
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = createLogSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the item, quantity, unit, and date." }, 400);
  try {
    const log = await createLog(await getDb(), auth.user.id, (await params).id, parsed.data);
    return log ? authJson({ log }, 201) : authJson({ error: "Tracker or item not found." }, 404);
  } catch (error) {
    if (error instanceof InvalidSnapshotAmount) return authJson({ error: "Check the quantity and nutrient amounts." }, 400);
    throw error;
  }
}
```

- [ ] **Run GREEN:** `npx vitest run tests/trackers-api.test.ts` → source isolation, local date validation and food/medicine snapshots pass.
- [ ] **Commit:**

```powershell
git add -- 'src/app/api/trackers/[id]/logs/route.ts' src/lib/trackers/schemas.ts src/lib/trackers/service.ts tests/trackers-api.test.ts
git commit -m "feat(trackers): log full food and medicine snapshots by local date"
```

### Task 5: Edit using the historical snapshot, and Undo by deletion

**Files:** Modify `src/lib/trackers/schemas.ts`, `src/lib/trackers/service.ts`, `tests/trackers-api.test.ts`; create `src/app/api/trackers/[id]/logs/[logId]/route.ts`.

- [ ] **Write RED:** Append to `tests/trackers-api.test.ts`:

```ts
const logCtx = (id: string, logId: string) => ({ params: Promise.resolve({ id, logId }) });

it("rescales the original snapshot after source removal and undoes a new log by deleting it", async () => {
  const { PATCH, DELETE } = await import("@/app/api/trackers/[id]/logs/[logId]/route");
  const { GET } = await import("@/app/api/trackers/[id]/logs/route");
  const { id } = await newTracker();
  const { food, supplement } = await catalog();
  const drink = await addLog(id, foodBody(food.id));
  const vitamin = await addLog(id, medicineBody(supplement.id));
  await db().delete(foods).where(eq(foods.id, food.id));
  const path = `${root}/${id}/logs/${drink.id}`;
  const bad = await PATCH(request(path, "PATCH", { quantity: 150, logDate: "2026-11-26" }), logCtx(id, drink.id));
  expect(bad.status).toBe(400);
  const edited = await PATCH(request(path, "PATCH", { quantity: 150 }), logCtx(id, drink.id));
  expect(edited.status).toBe(200);
  expect((await edited.json()).log).toEqual({
    ...drink, foodId: null, quantity: 150,
    computedNutrientsJson: { vitaminC: 15, addedSugars: 45, sodium: 150, protein: 3 },
  });
  const vitaminPath = `${root}/${id}/logs/${vitamin.id}`;
  expect((await (await PATCH(request(vitaminPath, "PATCH", { quantity: 0.5 }), logCtx(id, vitamin.id))).json()).log)
    .toMatchObject({ computedNutrientsJson: { vitaminC: 12.5 }, quantity: 0.5, unit: "dose" });
  const undo = await DELETE(request(vitaminPath, "DELETE"), logCtx(id, vitamin.id));
  expect(undo.status).toBe(200);
  expect(await undo.json()).toEqual({ ok: true });
  expect((await DELETE(request(vitaminPath, "DELETE"), logCtx(id, vitamin.id))).status).toBe(404);
  const day = await GET(request(`${root}/${id}/logs?date=${date}`), ctx(id));
  expect((await day.json()).logs.map((log: { id: string }) => log.id)).toEqual([drink.id]);
});

it("blocks log mutations across both tenant and tracker boundaries", async () => {
  const { PATCH, DELETE } = await import("@/app/api/trackers/[id]/logs/[logId]/route");
  const { id } = await newTracker();
  const sameUserOther = await newTracker();
  const { food } = await catalog();
  const log = await addLog(id, foodBody(food.id));
  // Even SQL rows with a mismatched user and tracker must not be visible or mutable.
  const [mismatch] = await db().insert(intakeLogs).values({
    trackerId: id, userId: bob.id, entryType: "food", logDate: date, loggedAt: iso, displayName: "Private",
    quantity: 100, unit: "g", computedNutrientsJson: {},
  }).returning();
  token = bob.token;
  const other = await newTracker();
  for (const [method, handler, body] of [
    ["PATCH", PATCH, { quantity: 25 }], ["DELETE", DELETE, undefined],
  ] as const) {
    for (const [actorToken, trackerId, logId] of [
      [bob.token, id, log.id], [bob.token, other.id, log.id], [bob.token, id, mismatch.id],
      [alice.token, sameUserOther.id, log.id], [alice.token, id, mismatch.id],
    ]) {
      token = actorToken;
      const response = await handler(request(`${root}/${trackerId}/logs/${logId}`, method, body), logCtx(trackerId, logId));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Log not found." });
    }
    token = undefined;
    expect((await handler(request(`${root}/${id}/logs/${log.id}`, method, body), logCtx(id, log.id))).status).toBe(401);
  }
  expect(await db().select().from(intakeLogs)).toHaveLength(2);
  expect((await db().select().from(intakeLogs).where(eq(intakeLogs.id, log.id)))[0].quantity).toBe(100);
});
```

- [ ] **Run RED:** `npx vitest run tests/trackers-api.test.ts -t "rescales the original|blocks log mutations"` → missing log detail route.
- [ ] **Implement:** Append to `src/lib/trackers/schemas.ts`:

```ts
export const patchLogSchema = z.strictObject({ quantity: positiveAmount });
```

Add `inArray` to the Drizzle import and append to `src/lib/trackers/service.ts`:

```ts
function ownedLog(db: Reader, userId: string, trackerId: string, logId: string) {
  return and(logScope(userId, trackerId), eq(intakeLogs.id, logId),
    inArray(intakeLogs.trackerId, db.select({ id: trackers.id }).from(trackers)
      .where(trackerScope(userId, trackerId))));
}

export function updateLogQuantity(db: Db, userId: string, trackerId: string, logId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const scope = ownedLog(tx, userId, trackerId, logId);
    const [current] = await tx.select().from(intakeLogs).where(scope).limit(1);
    if (!current) return null;
    const computedNutrientsJson = quantity === current.quantity ? current.computedNutrientsJson :
      checkedSnapshot(() => scaleSupplementNutrients(current.computedNutrientsJson, quantity / current.quantity));
    const [edited] = await tx.update(intakeLogs).set({ quantity, computedNutrientsJson })
      .where(scope).returning();
    if (!edited) return null;
    const medicine = edited.medicineId ? await findMedicine(tx, userId, edited.medicineId) : undefined;
    return logView(edited, medicine?.notes ?? null);
  });
}

export async function deleteLog(db: Db, userId: string, trackerId: string, logId: string) {
  const [row] = await db.delete(intakeLogs).where(ownedLog(db, userId, trackerId, logId))
    .returning({ id: intakeLogs.id });
  return Boolean(row);
}
```

The dose scaler here is the P3 sparse canonical-map multiplier: it applies a pure ratio to already-computed values, not current medicine data. Mutate only quantity and its derived snapshot in the same transaction; ordinary reads and catalog updates never mutate a snapshot.

Create `src/app/api/trackers/[id]/logs/[logId]/route.ts`:

```ts
import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { patchLogSchema } from "@/lib/trackers/schemas";
import { deleteLog, InvalidSnapshotAmount, updateLogQuantity } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; logId: string }> };
const missingLog = () => authJson({ error: "Log not found." }, 404);

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = patchLogSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Enter a valid quantity." }, 400);
  const { id, logId } = await params;
  try {
    const log = await updateLogQuantity(await getDb(), auth.user.id, id, logId, parsed.data.quantity);
    return log ? authJson({ log }) : missingLog();
  } catch (error) {
    if (error instanceof InvalidSnapshotAmount) return authJson({ error: "Check the quantity and nutrient amounts." }, 400);
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, logId } = await params;
  return await deleteLog(await getDb(), auth.user.id, id, logId) ? authJson({ ok: true }) : missingLog();
}
```

- [ ] **Run GREEN:** `npx vitest run tests/trackers-api.test.ts` → historical edits, Undo and ownership tests pass.
- [ ] **Commit:**

```powershell
git add -- 'src/app/api/trackers/[id]/logs/[logId]/route.ts' src/lib/trackers/schemas.ts src/lib/trackers/service.ts tests/trackers-api.test.ts
git commit -m "feat(trackers): edit snapshot quantities and delete logs for Undo"
```

### Task 6: Project daily progress and full-day condition cautions

**Files:** Modify `src/lib/trackers/service.ts`, `tests/trackers-api.test.ts`; create `src/app/api/trackers/[id]/summary/route.ts`.

- [ ] **Write RED:** Append to `tests/trackers-api.test.ts`:

```ts
it("combines food and supplements for pinned progress while evaluating unpinned nutrients", async () => {
  const { GET } = await import("@/app/api/trackers/[id]/summary/route");
  const { DELETE } = await import("@/app/api/trackers/[id]/logs/[logId]/route");
  const { id } = await newTracker({
    name: "Daily", healthFlags: ["diabetes", "hypertension"],
    nutrients: [{ nutrientKey: "vitaminC" }, { nutrientKey: "fiber" }, { nutrientKey: "sodium" }],
  });
  const { food, supplement } = await catalog();
  await db().update(foods).set({
    nutrientsPer100Json: { vitaminC: 10, sodium: 2200, addedSugars: 30 },
  }).where(eq(foods.id, food.id));
  const drink = await addLog(id, foodBody(food.id));
  await addLog(id, medicineBody(supplement.id, { quantity: 2 }));
  await addLog(id, foodBody(food.id, { logDate: "2026-11-26", quantity: 500 }));
  const another = await newTracker();
  await addLog(another.id, foodBody(food.id, { quantity: 500 }));
  await db().insert(intakeLogs).values({
    trackerId: id, userId: bob.id, logDate: date, loggedAt: iso, entryType: "food",
    displayName: "Mismatched owner", quantity: 100, unit: "g",
    computedNutrientsJson: { vitaminC: 999, sodium: 9999 },
  });
  const path = `${root}/${id}/summary?date=${date}`;
  const response = await GET(request(path), ctx(id));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const day = await response.json();
  expect(day.date).toBe(date);
  expect(day.progress.map(({ nutrientKey, amount, hasAmount }: {
    nutrientKey: string; amount: number; hasAmount: boolean;
  }) => [nutrientKey, amount, hasAmount])).toEqual([
    ["vitaminC", 60, true], ["fiber", 0, false], ["sodium", 2200, true],
  ]);
  expect(day.alerts).toEqual([
    { healthFlag: "diabetes", message: expect.stringMatching(/Sugar logged today/),
      triggers: [{ nutrientKey: "addedSugars", total: 30, threshold: 25, unit: "g" }] },
    { healthFlag: "hypertension", message: expect.stringMatching(/Sodium logged today/),
      triggers: [{ nutrientKey: "sodium", total: 2200, threshold: 2000, unit: "mg" }] },
  ]);
  expect(JSON.stringify(day.alerts)).not.toMatch(/mg\/dL|mmHg/i);
  expect((await DELETE(request(`${root}/${id}/logs/${drink.id}`, "DELETE"), logCtx(id, drink.id))).status)
    .toBe(200);
  const undone = await (await GET(request(path), ctx(id))).json();
  expect(undone.alerts).toEqual([]);
  expect(undone.progress[0].amount).toBe(50);
});

it("uses an explicit catalog-equal threshold, but not an untouched or reset default", async () => {
  const { GET } = await import("@/app/api/trackers/[id]/summary/route");
  const { PATCH } = await import("@/app/api/trackers/[id]/route");
  const { id } = await newTracker({
    name: "Sodium", healthFlags: ["hypertension"], nutrients: [{ nutrientKey: "sodium" }],
  });
  const { food } = await catalog();
  await db().update(foods).set({ nutrientsPer100Json: { sodium: 2200 } }).where(eq(foods.id, food.id));
  await addLog(id, foodBody(food.id));
  const detail = `${root}/${id}`;
  const summary = `${detail}/summary?date=${date}`;
  const read = async () => (await GET(request(summary), ctx(id))).json();
  expect((await read()).alerts).toHaveLength(1);
  const changed = await PATCH(request(detail, "PATCH", {
    nutrients: [{ nutrientKey: "sodium", customDailyTarget: 2300 }],
  }), ctx(id));
  expect(changed.status).toBe(200);
  expect((await read()).alerts).toEqual([]);
  expect((await PATCH(request(detail, "PATCH", { name: "Still custom" }), ctx(id))).status).toBe(200);
  expect((await read()).alerts).toEqual([]);
  expect((await PATCH(request(detail, "PATCH", { nutrients: [{ nutrientKey: "sodium" }] }), ctx(id))).status)
    .toBe(200);
  expect((await read()).alerts).toHaveLength(1);
  expect((await GET(request(`${detail}/summary?date=2026-02-30`), ctx(id))).status).toBe(400);
  token = bob.token;
  expect((await GET(request(summary), ctx(id))).status).toBe(404);
  token = undefined;
  expect((await GET(request(summary), ctx(id))).status).toBe(401);
});
```

- [ ] **Run RED:** `npx vitest run tests/trackers-api.test.ts -t "combines food|explicit catalog-equal"` → missing summary route.
- [ ] **Implement:** Add `gte` and `lte` to the Drizzle import in `src/lib/trackers/service.ts`, `sumDailyNutrients` to the calculator import, and add `import { evaluateImpact } from "@/lib/impact/engine";` and `import type { NutrientMap } from "@/lib/nutrients/types";`. Append:

```ts
export type SnapshotRow = Pick<LogRow,
  "logDate" | "entryType" | "medicineId" | "displayName" | "computedNutrientsJson">;

export async function readSnapshotWindow(
  db: Db, userId: string, trackerId: string, startDate: string, endDate: string,
): Promise<SnapshotRow[]> {
  return db.select({
    logDate: intakeLogs.logDate, entryType: intakeLogs.entryType, medicineId: intakeLogs.medicineId,
    displayName: intakeLogs.displayName, computedNutrientsJson: intakeLogs.computedNutrientsJson,
  }).from(intakeLogs)
    .where(and(logScope(userId, trackerId), gte(intakeLogs.logDate, startDate), lte(intakeLogs.logDate, endDate)))
    .orderBy(desc(intakeLogs.logDate), desc(intakeLogs.loggedAt), asc(intakeLogs.id));
}

export function summarizeDay(date: string, tracker: Tracker, logs: readonly SnapshotRow[]) {
  const dailyTotals = sumDailyNutrients(logs.map((log) => log.computedNutrientsJson));
  const customTargets: NutrientMap = {};
  for (const row of tracker.nutrients) {
    if (row.isCustomTarget) customTargets[row.nutrientKey] = row.dailyTarget;
  }
  const alerts = evaluateImpact({ dailyTotals, healthFlags: tracker.healthFlags, customTargets });
  const progress = tracker.nutrients.map((nutrient) => {
    const amount = dailyTotals[nutrient.nutrientKey];
    return { ...nutrient, amount: amount ?? 0, hasAmount: amount !== undefined };
  });
  return { date, progress, alerts };
}
export type DailySummary = ReturnType<typeof summarizeDay>;

export async function dailySummary(db: Db, userId: string, trackerId: string, date: string) {
  const tracker = await findTracker(db, userId, trackerId);
  if (!tracker) return null;
  const rows = await readSnapshotWindow(db, userId, trackerId, date, date);
  return summarizeDay(date, tracker, rows);
}
```

Create `src/app/api/trackers/[id]/summary/route.ts`:

```ts
import { getDb } from "@/db";
import { authJson, requireUser } from "@/lib/auth/session";
import { dateFromRequest } from "@/lib/trackers/schemas";
import { dailySummary } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const date = dateFromRequest(request);
  if (!date.success) return authJson({ error: "Choose a valid local date." }, 400);
  const summary = await dailySummary(await getDb(), auth.user.id, (await params).id, date.data);
  return summary ? authJson(summary) : authJson({ error: "Tracker not found." }, 404);
}
```

- [ ] **Run GREEN:** `npx vitest run tests/trackers-api.test.ts` → aggregation, unpinned alerts, override/reset, Undo and isolation pass.
- [ ] **Commit:**

```powershell
git add -- 'src/app/api/trackers/[id]/summary/route.ts' src/lib/trackers/service.ts tests/trackers-api.test.ts
git commit -m "feat(trackers): summarize local days and evaluate full-day cautions"
```

### Task 7: Build guarded 7d/30d trend, completion, and caution rollups

**Files:** Create `src/lib/analytics/types.ts`, `src/lib/analytics/service.ts`, `src/app/api/trackers/[id]/analytics/route.ts`, `tests/analytics.test.ts`; modify `src/lib/trackers/schemas.ts`.

- [ ] **Write RED** in `tests/analytics.test.ts`:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/analytics.test.ts` → missing analytics route.
- [ ] **Implement:** Append to `src/lib/trackers/schemas.ts`:

```ts
const analyticsQuerySchema = z.strictObject({
  range: z.enum(["7d", "30d"]).default("7d"), endDate: localDateSchema,
}).refine(({ range, endDate }) => endDate >= (range === "7d" ? "0001-01-07" : "0001-01-30"));
export type AnalyticsQuery = z.output<typeof analyticsQuerySchema>;

export function analyticsQueryFromRequest(request: Request) {
  const params = new URL(request.url).searchParams;
  const ranges = params.getAll("range");
  const dates = params.getAll("endDate");
  return analyticsQuerySchema.safeParse(ranges.length > 1 || dates.length !== 1 ? undefined : {
    range: ranges[0], endDate: dates[0],
  });
}
```

Create `src/lib/analytics/types.ts`:

```ts
import type { ImpactAlert } from "@/lib/impact/types";
import type { NutrientKey } from "@/lib/nutrients/types";
import type { AnalyticsQuery } from "@/lib/trackers/schemas";
import type { TrackerNutrient } from "@/lib/trackers/service";

export type AnalyticsDay = { date: string; active: boolean; alerts: ImpactAlert[] };
export type TrendPoint = { date: string; amount: number; hasAmount: boolean };
export type NutrientTrend = TrackerNutrient & {
  averageCompletionPct: number | null;
  series: TrendPoint[];
};
export type NutrientInsight = {
  nutrientKey: NutrientKey;
  reason: "lowCompletion" | "goalOnTrack" | "upperExceeded" | "upperWithinReference";
};
export type Analytics = {
  range: AnalyticsQuery["range"];
  startDate: string;
  endDate: string;
  activeDays: number;
  cautionDays: string[];
  cautionDayCount: number;
  averageCompletionPct: number | null;
  days: AnalyticsDay[];
  trends: NutrientTrend[];
  needsAttention: NutrientInsight[];
  onTrack: NutrientInsight[];
};
```

Create `src/lib/analytics/service.ts`:

```ts
import "server-only";
import type { Db } from "@/db";
import type { NutrientKey } from "@/lib/nutrients/types";
import type { AnalyticsQuery } from "@/lib/trackers/schemas";
import { findTracker, readSnapshotWindow, summarizeDay, type SnapshotRow } from "@/lib/trackers/service";
import type { Analytics, NutrientInsight } from "./types";

const dayMs = 86_400_000;
const completionThresholdPct = 80;
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function calendarWindow(endDate: string, length: number) {
  // UTC here is only calendar arithmetic on an already-chosen local date label.
  const last = Date.parse(`${endDate}T00:00:00.000Z`);
  return Array.from({ length }, (_, index) => new Date(last - (length - 1 - index) * dayMs)
    .toISOString().slice(0, 10));
}

function exceedsReference(amount: number, target: number) {
  return amount - target > 2 * Number.EPSILON * Math.max(amount, target);
}

export async function trackerAnalytics(
  db: Db, userId: string, trackerId: string, { range, endDate }: AnalyticsQuery,
): Promise<Analytics | null> {
  const tracker = await findTracker(db, userId, trackerId);
  if (!tracker) return null;
  const length = range === "7d" ? 7 : 30;
  const dates = calendarWindow(endDate, length);
  const startDate = dates[0];
  const rows = await readSnapshotWindow(db, userId, trackerId, startDate, endDate);
  const buckets = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.logDate);
    if (bucket) bucket.push(row);
    else buckets.set(row.logDate, [row]);
  }
  const summaries = dates.map((date) => summarizeDay(date, tracker, buckets.get(date) ?? []));
  const days = summaries.map(({ date, alerts }) => ({ date, alerts, active: buckets.has(date) }));
  const activeDays = days.filter((day) => day.active).length;
  const cautionDays = days.filter((day) => day.alerts.length > 0).map((day) => day.date);
  const cautionKeys = new Set<NutrientKey>(days.flatMap((day) => day.alerts.flatMap((alert) =>
    alert.triggers.map((trigger) => trigger.nutrientKey))));
  const needsAttention: NutrientInsight[] = [];
  const onTrack: NutrientInsight[] = [];
  const goalAverages: number[] = [];
  const trends = tracker.nutrients.map((nutrient, index) => {
    const { nutrientKey, targetKind, dailyTarget } = nutrient;
    const series = summaries.map(({ date, progress }) => {
      const { amount, hasAmount } = progress[index];
      return { date, amount, hasAmount };
    });
    const averageCompletionPct = targetKind === "goal"
      ? mean(series.map(({ amount }) => Math.min(amount / dailyTarget, 1) * 100)) : null;
    if (averageCompletionPct !== null) goalAverages.push(averageCompletionPct);
    if (activeDays > 0) {
      if (averageCompletionPct !== null) {
        if (averageCompletionPct >= completionThresholdPct) onTrack.push({ nutrientKey, reason: "goalOnTrack" });
        else needsAttention.push({ nutrientKey, reason: "lowCompletion" });
      } else if (series.some(({ amount }) => exceedsReference(amount, dailyTarget)) || cautionKeys.has(nutrientKey)) {
        needsAttention.push({ nutrientKey, reason: "upperExceeded" });
      } else if (series.some(({ hasAmount }) => hasAmount)) {
        onTrack.push({ nutrientKey, reason: "upperWithinReference" });
      }
    }
    return { ...nutrient, series, averageCompletionPct };
  });
  return {
    range, startDate, endDate, days, activeDays, cautionDays, cautionDayCount: cautionDays.length,
    trends, needsAttention, onTrack, averageCompletionPct: goalAverages.length ? mean(goalAverages) : null,
  };
}
```

Create `src/app/api/trackers/[id]/analytics/route.ts`:

```ts
import { getDb } from "@/db";
import { trackerAnalytics } from "@/lib/analytics/service";
import { authJson, requireUser } from "@/lib/auth/session";
import { analyticsQueryFromRequest } from "@/lib/trackers/schemas";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = analyticsQueryFromRequest(request);
  if (!parsed.success) return authJson({ error: "Choose a valid range and local end date." }, 400);
  const analytics = await trackerAnalytics(await getDb(), auth.user.id, (await params).id, parsed.data);
  return analytics ? authJson({ analytics }) : authJson({ error: "Tracker not found." }, 404);
}
```

- [ ] **Run GREEN:** `npx vitest run tests/analytics.test.ts` → inclusive bounds, leap day, zero days, trend totals, capped completion and insights pass.
- [ ] **Commit:**

```powershell
git add -- 'src/app/api/trackers/[id]/analytics/route.ts' src/lib/analytics/types.ts src/lib/analytics/service.ts src/lib/trackers/schemas.ts tests/analytics.test.ts
git commit -m "feat(analytics): roll up tracker trends and caution days"
```

### Task 8: Count distinct medicine logging days and verify analytics isolation

**Files:** Modify `src/lib/analytics/types.ts`, `src/lib/analytics/service.ts`, `tests/analytics.test.ts`.

- [ ] **Write RED:** Add `medicines` to the schema import in `tests/analytics.test.ts`; append:

```ts
it("counts distinct days per medicine, including removed catalog items and prescription-only logs", async () => {
  const trackerId = await makeTracker(alice.id, false);
  const other = await makeTracker();
  const common = { userId: alice.id, createdAt: loggedAt, defaultDoseLabel: "1 tablet",
    source: "manual" as const, nutrientsPerDoseJson: {} };
  const [rx, removed, sameName] = await db().insert(medicines).values([
    { ...common, brandName: "Example", category: "prescription" },
    { ...common, brandName: "Old", category: "supplement" },
    { ...common, brandName: "Example", category: "both" },
  ]).returning();
  function dose(medicineId: string, displayName: string, logDate: string, patch = {}) {
    return {
      trackerId, userId: alice.id, loggedAt, logDate, displayName, medicineId,
      entryType: "medicine" as const, unit: "dose" as const, quantity: 1, computedNutrientsJson: {}, ...patch,
    };
  }
  await db().insert(intakeLogs).values([
    dose(rx.id, "Example", endDate), dose(rx.id, "Example", endDate, { quantity: 2 }),
    dose(rx.id, "Former name", "2024-03-06"),
    dose(rx.id, "Example", "2024-03-01"), dose(rx.id, "Example", "2024-02-11"),
    dose(removed.id, "OLD", "2024-03-06"), dose(removed.id, "Old", "2024-03-08"),
    dose(sameName.id, "Example", endDate),
    dose(rx.id, "Example", "2024-03-07", { trackerId: other }),
    dose(rx.id, "Example", "2024-03-10", { userId: bob.id }),
  ]);
  await db().delete(medicines).where(eq(medicines.id, removed.id));
  const week = await analytics(trackerId);
  expect(week).toMatchObject({ activeDays: 3, averageCompletionPct: null, trends: [] });
  expect(week.medicineAdherence).toHaveLength(3);
  expect(week.medicineAdherence).toEqual(expect.arrayContaining([
    { key: `id:${rx.id}`, medicineId: rx.id, displayName: "Example", loggedDays: 2, rangeDays: 7,
      loggedDates: ["2024-03-06", endDate], loggedDayPct: (2 / 7) * 100 },
    { key: "name:old", medicineId: null, displayName: "Old", loggedDays: 2, rangeDays: 7,
      loggedDates: ["2024-03-06", "2024-03-08"], loggedDayPct: (2 / 7) * 100 },
    { key: `id:${sameName.id}`, medicineId: sameName.id, displayName: "Example", loggedDays: 1, rangeDays: 7,
      loggedDates: [endDate], loggedDayPct: (1 / 7) * 100 },
  ]));
  const month = await analytics(trackerId, "30d");
  expect(month.medicineAdherence[0]).toMatchObject({
    medicineId: rx.id, loggedDays: 3, rangeDays: 30, loggedDates: ["2024-03-01", "2024-03-06", endDate],
    loggedDayPct: 10,
  });
});

it("denies cross-user analytics and unauthenticated analytics and returns no medicines for an empty tracker", async () => {
  const id = await makeTracker();
  expect((await analytics(id)).medicineAdherence).toEqual([]);
  token = bob.token;
  const foreign = await query(id);
  const unknown = await query("missing");
  expect(foreign.status).toBe(404);
  expect(await foreign.json()).toEqual(await unknown.json());
  token = undefined;
  expect((await query(id)).status).toBe(401);
});
```

- [ ] **Run RED:** `npx vitest run tests/analytics.test.ts -t "distinct days|denies cross-user analytics"` → missing `medicineAdherence` data.
- [ ] **Implement:** Add this type above `Analytics` in `src/lib/analytics/types.ts` and `medicineAdherence: MedicineAdherence[];` to `Analytics`:

```ts
export type MedicineAdherence = {
  key: string;
  medicineId: string | null;
  displayName: string;
  loggedDays: number;
  rangeDays: number;
  loggedDates: string[];
  loggedDayPct: number;
};
```

In `src/lib/analytics/service.ts`, add `MedicineAdherence` to the type import and insert this helper before `trackerAnalytics`:

```ts
function buildMedicineAdherence(rows: readonly SnapshotRow[], rangeDays: number): MedicineAdherence[] {
  type Group = { medicineId: string | null; displayName: string; dates: Set<string> };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (row.entryType !== "medicine") continue;
    const key = row.medicineId ? `id:${row.medicineId}` : `name:${row.displayName.trim().toLowerCase()}`;
    const group = groups.get(key) ?? { medicineId: row.medicineId, displayName: row.displayName, dates: new Set<string>() };
    group.dates.add(row.logDate);
    groups.set(key, group);
  }
  return [...groups].map(([key, { medicineId, displayName, dates }]) => ({
    key, medicineId, displayName, loggedDays: dates.size, rangeDays, loggedDates: [...dates].sort(),
    loggedDayPct: (dates.size / rangeDays) * 100,
  })).sort((a, b) => b.loggedDays - a.loggedDays || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
```

Add this field to the return object in `trackerAnalytics`:

```ts
    medicineAdherence: buildMedicineAdherence(rows, length),
```

Use the most recent logged name within the window (rows arrive newest local date/time first). Distinct live IDs never merge, even when names match. Once `SET NULL` removes identity, same normalized historical names may merge; this is an explicitly best-effort fallback, not a new identity table or a skipped medication estimate.

- [ ] **Run GREEN:** `npx vitest run tests/analytics.test.ts` → 7/30-day adherence and analytics access checks pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/analytics/types.ts src/lib/analytics/service.ts tests/analytics.test.ts
git commit -m "feat(analytics): report distinct medicine logging days"
```

### Task 9: Run the P6 exit gate and hand off

**Files:** Read-only verification, no additional commit.

- [ ] **Run both required commands separately:**

```powershell
npx vitest run tests/trackers-api.test.ts tests/analytics.test.ts
npm run typecheck
```

Expect both test files green and typecheck exit `0`. Then run `git diff --check` and `git status --short`; no P6 files should be left unstaged and no credentials, DB files, journal or generated artifacts may be committed. Report the implementation commits and gate outputs, the P7 request/response and explicit-local-date/target handoff, the P8 analytics rules, and the legacy one-column upgrade requirement to the orchestrator. Carry the highest-priority failing gate back rather than declaring P6 complete if verification fails.
