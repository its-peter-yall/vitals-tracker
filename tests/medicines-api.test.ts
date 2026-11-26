import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { intakeLogs, medicines, sessions, trackers, users } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { makeSession, SESSION_COOKIE } from "@/lib/auth/session";

vi.mock("@/db", async (original) => {
  const actual = await original<typeof import("@/db")>();
  return { ...actual, getDb: vi.fn() };
});

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  cookieToken = undefined;
  fixture = await createTestDb();
  vi.mocked(getDb).mockResolvedValue(fixture.db);
});
afterEach(() => {
  fixture?.client.close();
  vi.mocked(getDb).mockReset();
});

it("seeds stable global medicine templates twice without duplication or prescription nutrients", async () => {
  const { seedMedicines, curatedMedicines } = await import("@/db/seed-medicines");
  const { nutrientMapSchema } = await import("@/lib/medicines/schemas");
  await seedMedicines(fixture.db);
  await seedMedicines(fixture.db);
  const rows = await fixture.db.select().from(medicines);
  expect(rows).toHaveLength(6);
  expect(new Set(rows.map((row) => row.id))).toEqual(new Set(curatedMedicines.map((row) => row.id)));
  expect(rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ brandName: "Vitamin D3 25 mcg", nutrientsPerDoseJson: { vitaminD: 25 } }),
    expect.objectContaining({ brandName: "Magnesium 100 mg", nutrientsPerDoseJson: { magnesium: 100 } }),
    expect.objectContaining({ brandName: "Metformin", nutrientsPerDoseJson: {}, category: "prescription" }),
    expect.objectContaining({ brandName: "Levothyroxine", nutrientsPerDoseJson: {}, category: "prescription" }),
  ]));
  for (const row of rows) {
    expect(row).toMatchObject({ userId: null, source: "curated", scheduleHint: null });
    expect(row.notes).toBeTruthy();
    expect(nutrientMapSchema.safeParse(row.nutrientsPerDoseJson).success).toBe(true);
    if (row.category === "prescription") expect(row.nutrientsPerDoseJson).toEqual({});
  }
});

let cookieToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieToken ? { name, value: cookieToken } : undefined,
  }),
}));

async function account(label: string, visionModel: string | null = null) {
  const [user] = await fixture.db.insert(users).values({
    email: `${label}@example.test`, name: label, passwordHash: "unused-in-handler-tests", visionModel,
    createdAt: new Date().toISOString(),
  }).returning();
  const session = makeSession(user.id);
  await fixture.db.insert(sessions).values(session.row);
  return { user, token: session.token };
}

const cabinetPath = "/api/medicines";
function cabinetJson(body: unknown, method = "POST", path = cabinetPath) {
  return new Request(`https://app.example.test${path}`, {
    method, headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body),
  });
}
const draftInput = {
  brandName: " My D3 ", category: "supplement", defaultDoseLabel: "1 softgel",
  nutrientsPerDose: { vitaminD: 25 }, notes: "Check the serving size.",
};

it("creates and lists private medicines for the authenticated user, with separate curated templates", async () => {
  const { GET, POST } = await import("@/app/api/medicines/route");
  const { seedMedicines } = await import("@/db/seed-medicines");
  await seedMedicines(fixture.db);
  const a = await account("alice");
  const b = await account("bob");
  expect((await GET()).status).toBe(401);
  expect((await POST(cabinetJson(draftInput))).status).toBe(401);

  cookieToken = a.token;
  const created = await POST(cabinetJson(draftInput));
  expect(created.status).toBe(201);
  expect(created.headers.get("Cache-Control")).toBe("no-store");
  const { medicine } = await created.json();
  expect(medicine).toEqual({
    id: expect.any(String), createdAt: expect.any(String), brandName: "My D3",
    category: "supplement", defaultDoseLabel: "1 softgel", nutrientsPerDose: { vitaminD: 25 },
    genericName: null, notes: "Check the serving size.", scheduleHint: null, source: "manual",
  });
  const aList = await GET();
  expect(aList.headers.get("Cache-Control")).toBe("no-store");
  const { medicines: mine, curated } = await aList.json();
  expect(mine).toEqual([medicine]);
  expect(curated).toHaveLength(6);
  expect(curated[0]).toMatchObject({ source: "curated" });
  expect(curated[0]).not.toHaveProperty("userId");

  cookieToken = b.token;
  expect(await (await GET()).json()).toEqual({ medicines: [], curated });
  const confirmed = await POST(cabinetJson({ ...draftInput, source: "vision_confirmed" }));
  expect(await confirmed.json()).toMatchObject({ medicine: { source: "vision_confirmed" } });
  const rows = await fixture.db.select().from(medicines);
  expect(rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: medicine.id, userId: a.user.id, source: "manual" }),
    expect.objectContaining({ userId: b.user.id, source: "vision_confirmed" }),
  ]));
});

it("rejects unconfirmed scan envelopes, ownership fields, and invalid cabinet create bodies", async () => {
  const { POST } = await import("@/app/api/medicines/route");
  cookieToken = (await account("alice")).token;
  for (const body of [
    { requiresConfirmation: true, draft: draftInput }, { ...draftInput, userId: "spoofed" },
    { ...draftInput, source: "curated" }, { ...draftInput, brandName: " " },
    { ...draftInput, defaultDoseLabel: null }, { ...draftInput, category: null },
    { ...draftInput, nutrientsPerDose: { vitamin_d: 25 } },
    { ...draftInput, nutrientsPerDose: { vitaminD: "25" } },
    { ...draftInput, nutrientsPerDose: { vitaminD: -25 } },
    { ...draftInput, nutrientsPerDose: JSON.parse('{"__proto__": 25}') },
  ]) {
    expect((await POST(cabinetJson(body))).status).toBe(400);
  }
  const malformed = new Request("https://app.example.test/api/medicines", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  expect((await POST(malformed)).status).toBe(400);
  const textBody = new Request("https://app.example.test/api/medicines", {
    method: "POST", body: JSON.stringify(draftInput),
  });
  expect((await POST(textBody)).status).toBe(400);
  expect(await fixture.db.select().from(medicines)).toEqual([]);
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const removeRequest = (id: string) =>
  new Request(`https://app.example.test/api/medicines/${id}`, { method: "DELETE" });

it("patches and deletes only an owned private medicine, preserving immutable history", async () => {
  const { POST } = await import("@/app/api/medicines/route");
  const { PATCH, DELETE } = await import("@/app/api/medicines/[id]/route");
  const { curatedMedicines, seedMedicines } = await import("@/db/seed-medicines");
  await seedMedicines(fixture.db);
  const a = await account("alice");
  const b = await account("bob");
  cookieToken = a.token;
  const { medicine } = await (await POST(cabinetJson({
    ...draftInput, source: "ocr_confirmed", scheduleHint: "Personal reminder", genericName: "D3",
  }))).json();
  const id: string = medicine.id;
  const patch = (body: unknown, target = id) =>
    PATCH(cabinetJson(body, "PATCH", `${cabinetPath}/${target}`), context(target));
  const remove = (target = id) => DELETE(removeRequest(target), context(target));

  cookieToken = undefined;
  expect((await patch({ notes: null })).status).toBe(401);
  expect((await remove()).status).toBe(401);
  cookieToken = b.token;
  const other = await patch({ notes: "Not mine" });
  expect(other.status).toBe(404);
  expect((await remove()).status).toBe(404);
  const missingId = "f5d00000-0000-4000-8000-000000000099";
  const missing = await patch({ notes: "Missing" }, missingId);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual(await other.json());
  expect((await remove(missingId)).status).toBe(404);

  cookieToken = a.token;
  const curatedId = curatedMedicines[0].id;
  expect((await patch({ notes: "No" }, curatedId)).status).toBe(404);
  expect((await remove(curatedId)).status).toBe(404);
  expect((await patch({ notes: "No" }, "not-a-uuid")).status).toBe(404);
  for (const body of [{}, { source: "manual" }, { userId: b.user.id }, { nutrientsPerDose: { D: 1 } }]) {
    expect((await patch(body)).status).toBe(400);
  }
  const time = new Date().toISOString();
  const [tracker] = await fixture.db.insert(trackers).values({
    userId: a.user.id, name: "Daily", healthFlagsJson: [], createdAt: time, updatedAt: time,
  }).returning();
  await fixture.db.insert(intakeLogs).values({
    trackerId: tracker.id, userId: a.user.id, logDate: "2026-11-26", loggedAt: time,
    entryType: "medicine", medicineId: id, displayName: "Original D3", quantity: 1,
    unit: "dose", computedNutrientsJson: { vitaminD: 25 },
  });
  const updated = await patch({ nutrientsPerDose: { vitaminC: 5 }, notes: null, scheduleHint: null });
  expect(updated.status).toBe(200);
  expect(await updated.json()).toEqual({ medicine: {
    ...medicine, notes: null, scheduleHint: null, nutrientsPerDose: { vitaminC: 5 },
  } });
  expect(await fixture.db.select().from(intakeLogs)).toEqual([
    expect.objectContaining({ medicineId: id, displayName: "Original D3", computedNutrientsJson: { vitaminD: 25 } }),
  ]);
  const deleted = await remove();
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ ok: true });
  expect((await remove()).status).toBe(404);
  expect(await fixture.db.select().from(medicines)).toHaveLength(6);
  expect(await fixture.db.select().from(intakeLogs)).toEqual([
    expect.objectContaining({ medicineId: null, displayName: "Original D3", computedNutrientsJson: { vitaminD: 25 } }),
  ]);
});
