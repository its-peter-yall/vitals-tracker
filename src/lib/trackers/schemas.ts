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
