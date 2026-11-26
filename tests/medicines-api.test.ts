import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { medicines } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";

vi.mock("@/db", async (original) => {
  const actual = await original<typeof import("@/db")>();
  return { ...actual, getDb: vi.fn() };
});

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
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
