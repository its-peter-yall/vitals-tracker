import "server-only";
import type { Db } from "@/db";
import { medicines } from "@/db/schema";
import type { NutrientMap } from "@/lib/nutrients/types";

type Template = Pick<typeof medicines.$inferInsert, "brandName" | "category" | "defaultDoseLabel"> & {
  id: string; genericName: string; nutrientsPerDoseJson: NutrientMap; notes: string;
};

export const curatedMedicines = [
  {
    id: "f5d00000-0000-4000-8000-000000000001",
    brandName: "Vitamin D3 25 mcg", genericName: "Cholecalciferol", category: "supplement",
    defaultDoseLabel: "1 softgel", nutrientsPerDoseJson: { vitaminD: 25 },
    notes: "Check that the amount on your bottle is for one softgel.",
  },
  {
    id: "f5d00000-0000-4000-8000-000000000002",
    brandName: "Vitamin C 500 mg", genericName: "Ascorbic acid", category: "supplement",
    defaultDoseLabel: "1 tablet", nutrientsPerDoseJson: { vitaminC: 500 },
    notes: "Some labels list amounts for more than one tablet. Check your serving size.",
  },
  {
    id: "f5d00000-0000-4000-8000-000000000003",
    brandName: "Vitamin B12 1000 mcg", genericName: "Cyanocobalamin", category: "supplement",
    defaultDoseLabel: "1 tablet", nutrientsPerDoseJson: { vitaminB12: 1000 },
    notes: "Check the microgram amount on your label before saving.",
  },
  {
    id: "f5d00000-0000-4000-8000-000000000004",
    brandName: "Magnesium 100 mg", genericName: "Magnesium", category: "supplement",
    defaultDoseLabel: "1 capsule", nutrientsPerDoseJson: { magnesium: 100 },
    notes: "Use the amount listed as magnesium, not the weight of the whole compound.",
  },
  {
    id: "f5d00000-0000-4000-8000-000000000005",
    brandName: "Metformin", genericName: "Metformin", category: "prescription",
    defaultDoseLabel: "1 tablet", nutrientsPerDoseJson: {},
    notes: "Check the directions on your own prescription label for whether to take it with food.",
  },
  {
    id: "f5d00000-0000-4000-8000-000000000006",
    brandName: "Levothyroxine", genericName: "Levothyroxine", category: "prescription",
    defaultDoseLabel: "1 tablet", nutrientsPerDoseJson: {},
    notes: "Ask your pharmacist how to time this medicine with food, calcium, or iron.",
  },
] as const satisfies readonly Template[];

export async function seedMedicines(db: Db): Promise<void> {
  const createdAt = new Date().toISOString();
  await db.insert(medicines).values(curatedMedicines.map((item) => ({
    ...item, userId: null, source: "curated" as const, scheduleHint: null, createdAt,
  }))).onConflictDoNothing({ target: medicines.id });
}
