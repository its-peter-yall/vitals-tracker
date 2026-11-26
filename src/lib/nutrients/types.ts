import type { NUTRIENT_CATALOG } from "./catalog";

export type NutrientKey = keyof typeof NUTRIENT_CATALOG;
export type NutrientCategory = "vitamin" | "mineral" | "essential";
export type NutrientUnit = "g" | "mg" | "mcg" | "mcg RAE" | "mg NE" | "mcg DFE";

export type NutrientDefinition = Readonly<{
  category: NutrientCategory;
  label: string;
  unit: NutrientUnit;
  defaultDailyTarget: number;
}>;

export type NutrientMap = Partial<Record<NutrientKey, number>>;
export type NutrientInput = Readonly<Record<string, unknown>>;
export type FoodQuantityUnit = "g" | "ml";
export type FoodNutrientProfile = Readonly<{
  defaultUnit: FoodQuantityUnit;
  nutrientsPer100: NutrientInput;
}>;
