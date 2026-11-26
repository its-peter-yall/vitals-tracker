import * as z from "zod";
import { isNutrientKey, NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import type { FoodQuantityUnit, NutrientMap } from "@/lib/nutrients/types";

export function normalizeFoodText(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

const hasText = (text: string) => /[\p{L}\p{N}]/u.test(text);
const foodText = z.string().trim().min(1).max(120).refine((s) => hasText(s) && !/\p{Cc}/u.test(s));
const query = z.string().trim().max(100).refine((s) => !/\p{Cc}/u.test(s) && (!s || hasText(s)));
export const searchQuerySchema = query;
export const resolveRequestSchema = z.strictObject({ query: query.refine((s) => s.length > 0) });

// Validate own keys before parsing: JSON records must not silently strip reserved keys.
const nutrientKey = z.custom<keyof NutrientMap>(isNutrientKey);
const nutrientAmounts = z.unknown().refine((value) =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  Object.keys(value).length > 0 && Object.keys(value).every(isNutrientKey),
).pipe(z.record(nutrientKey, z.number().nonnegative()));
const profileShape = {
  name: foodText,
  aliases: z.array(foodText).max(12).default([]),
  defaultUnit: z.enum(["g", "ml"]),
  nutrientsPer100: nutrientAmounts,
};
const validAmounts = ({ defaultUnit, nutrientsPer100 }: {
  defaultUnit: FoodQuantityUnit; nutrientsPer100: NutrientMap;
}) => {
  const maxGrams = defaultUnit === "g" ? 100 : 150;
  for (const [key, value] of Object.entries(nutrientsPer100)) {
    if (!isNutrientKey(key)) return false;
    const unit = NUTRIENT_CATALOG[key].unit;
    const perGram = unit === "g" ? 1 : unit.startsWith("mg") ? 1000 : 1_000_000;
    if (value > maxGrams * perGram) return false;
  }
  const { addedSugars, totalSugars } = nutrientsPer100;
  return addedSugars === undefined || totalSugars === undefined || addedSugars <= totalSugars;
};
export const foodProfileSchema = z.strictObject(profileShape).refine(validAmounts);
export const saveFoodSchema = z.strictObject({
  ...profileShape,
  confirmed: z.literal(true),
  source: z.enum(["open_api", "ai_confirmed", "manual"]),
}).refine(validAmounts);

export type FoodProfile = {
  name: string; aliases: string[]; defaultUnit: FoodQuantityUnit; nutrientsPer100: NutrientMap;
};
export type SaveFoodInput = FoodProfile & {
  confirmed: true; source: "open_api" | "ai_confirmed" | "manual";
};
export type SavedFood = FoodProfile & {
  id: string; source: "curated" | SaveFoodInput["source"]; estimated: boolean;
};
export type OnlineDraft = FoodProfile & (
  | { provider: "open_food_facts"; label: "Open Food Facts"; estimated: false }
  | { provider: "usda"; label: "USDA FoodData Central"; estimated: false }
);
export type FoodDraft = OnlineDraft | (FoodProfile & {
  provider: "openrouter"; label: "Estimated"; estimated: true;
});
export type ResolveFoodResult =
  | { kind: "saved" | "curated"; food: SavedFood }
  | { kind: "draft"; draft: FoodDraft }
  | { kind: "unavailable"; status: 404 | 422 | 503; error: string };
