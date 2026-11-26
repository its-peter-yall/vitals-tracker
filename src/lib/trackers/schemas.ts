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

export const patchTrackerSchema = z.strictObject({
  name: name.optional(), healthFlags: healthFlags.optional(), nutrients: nutrients.optional(),
}).refine((input) => input.name !== undefined || input.healthFlags !== undefined || input.nutrients !== undefined);
export type PatchTracker = z.output<typeof patchTrackerSchema>;

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
