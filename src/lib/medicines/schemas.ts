import "server-only";
import * as z from "zod";
import { medicines } from "@/db/schema";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientKey } from "@/lib/nutrients/types";
import { MEDICINE_CATEGORIES } from "./types";

const category = z.enum(MEDICINE_CATEGORIES);
const name = z.string().trim().min(1).max(120);
const dose = z.string().trim().min(1).max(80);
const notes = z.string().trim().min(1).max(500);
const amount = z.number().nonnegative();
const fields = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, amount])) as
  Record<NutrientKey, typeof amount>;
export const nutrientMapSchema = z.strictObject(fields).partial();

const editable = z.strictObject({
  brandName: name,
  genericName: name.nullable().optional(),
  category,
  defaultDoseLabel: dose,
  nutrientsPerDose: nutrientMapSchema,
  notes: notes.nullable().optional(),
  scheduleHint: z.string().trim().min(1).max(120).nullable().optional(),
});
export const medicineCreateSchema = editable.extend({
  source: z.enum(["manual", "vision_confirmed", "ocr_confirmed"]).default("manual"),
});
export const medicinePatchSchema = editable.partial().refine((value) => Object.keys(value).length > 0);
export const medicineIdSchema = z.uuid();

export const medicineColumns = {
  id: medicines.id,
  brandName: medicines.brandName,
  genericName: medicines.genericName,
  category: medicines.category,
  defaultDoseLabel: medicines.defaultDoseLabel,
  nutrientsPerDose: medicines.nutrientsPerDoseJson,
  notes: medicines.notes,
  scheduleHint: medicines.scheduleHint,
  source: medicines.source,
  createdAt: medicines.createdAt,
};

const entry = z.strictObject({
  key: z.enum(NUTRIENT_KEYS),
  amount: z.number(),
  unit: z.enum([...new Set(NUTRIENT_KEYS.map((key) => NUTRIENT_CATALOG[key].unit))]),
});
const visionWire = z.strictObject({
  brandName: z.string().nullable(),
  genericName: z.string().nullable(),
  category: category.nullable(),
  defaultDoseLabel: z.string().nullable(),
  nutrients: z.array(entry),
  notes: z.string().nullable(),
  confidence: z.number(),
});
export const visionJsonSchema = z.toJSONSchema(visionWire, { target: "draft-07" });
delete visionJsonSchema.$schema;

// Unreadable fields are null on the strict wire. Also allow omissions in P1's
// json_object fallback, but never relax the schema for supplied values.
export const visionOutputSchema = visionWire.extend({
  brandName: name.nullish(),
  genericName: name.nullish(),
  category: category.nullish(),
  defaultDoseLabel: dose.nullish(),
  nutrients: z.array(entry.extend({ amount })).max(NUTRIENT_KEYS.length).optional(),
  notes: notes.nullish(),
  confidence: z.number().min(0).max(1),
}).refine((value) => {
  const entries = value.nutrients ?? [];
  if (value.category === "prescription" && entries.length) return false;
  const seen = new Set<NutrientKey>();
  for (const { key, unit } of entries) {
    if (seen.has(key) || NUTRIENT_CATALOG[key].unit !== unit) return false;
    seen.add(key);
  }
  return true;
});
