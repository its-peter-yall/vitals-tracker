import type { NutrientDefinition, NutrientKey } from "./types";

export const NUTRIENT_CATALOG = Object.freeze({
  vitaminA: { category: "vitamin", label: "Vitamin A", unit: "mcg RAE", defaultDailyTarget: 900 },
  vitaminB1: { category: "vitamin", label: "Vitamin B1", unit: "mg", defaultDailyTarget: 1.2 },
  vitaminB2: { category: "vitamin", label: "Vitamin B2", unit: "mg", defaultDailyTarget: 1.3 },
  vitaminB3: { category: "vitamin", label: "Vitamin B3", unit: "mg NE", defaultDailyTarget: 16 },
  vitaminB6: { category: "vitamin", label: "Vitamin B6", unit: "mg", defaultDailyTarget: 1.7 },
  vitaminB9: { category: "vitamin", label: "Vitamin B9 (Folate)", unit: "mcg DFE", defaultDailyTarget: 400 },
  vitaminB12: { category: "vitamin", label: "Vitamin B12", unit: "mcg", defaultDailyTarget: 2.4 },
  vitaminC: { category: "vitamin", label: "Vitamin C", unit: "mg", defaultDailyTarget: 90 },
  vitaminD: { category: "vitamin", label: "Vitamin D", unit: "mcg", defaultDailyTarget: 20 },
  vitaminE: { category: "vitamin", label: "Vitamin E", unit: "mg", defaultDailyTarget: 15 },
  vitaminK: { category: "vitamin", label: "Vitamin K", unit: "mcg", defaultDailyTarget: 120 },
  calcium: { category: "mineral", label: "Calcium", unit: "mg", defaultDailyTarget: 1300 },
  iron: { category: "mineral", label: "Iron", unit: "mg", defaultDailyTarget: 18 },
  magnesium: { category: "mineral", label: "Magnesium", unit: "mg", defaultDailyTarget: 420 },
  potassium: { category: "mineral", label: "Potassium", unit: "mg", defaultDailyTarget: 4700 },
  sodium: { category: "mineral", label: "Sodium", unit: "mg", defaultDailyTarget: 2300 },
  zinc: { category: "mineral", label: "Zinc", unit: "mg", defaultDailyTarget: 11 },
  iodine: { category: "mineral", label: "Iodine", unit: "mcg", defaultDailyTarget: 150 },
  selenium: { category: "mineral", label: "Selenium", unit: "mcg", defaultDailyTarget: 55 },
  phosphorus: { category: "mineral", label: "Phosphorus", unit: "mg", defaultDailyTarget: 1250 },
  protein: { category: "essential", label: "Protein", unit: "g", defaultDailyTarget: 50 },
  fiber: { category: "essential", label: "Fiber", unit: "g", defaultDailyTarget: 28 },
  totalSugars: { category: "essential", label: "Total Sugars", unit: "g", defaultDailyTarget: 35 },
  addedSugars: { category: "essential", label: "Added Sugars", unit: "g", defaultDailyTarget: 50 },
  carbohydrates: { category: "essential", label: "Carbohydrates", unit: "g", defaultDailyTarget: 275 },
  healthyFats: { category: "essential", label: "Healthy Fats", unit: "g", defaultDailyTarget: 45 },
  water: { category: "essential", label: "Water", unit: "g", defaultDailyTarget: 2700 },
} as const satisfies Record<string, NutrientDefinition>);

export const NUTRIENT_KEYS: readonly NutrientKey[] =
  Object.freeze(Object.keys(NUTRIENT_CATALOG) as NutrientKey[]);

export function isNutrientKey(key: unknown): key is NutrientKey {
  return typeof key === "string" && Object.hasOwn(NUTRIENT_CATALOG, key);
}
