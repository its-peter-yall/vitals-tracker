import { expect, it } from "vitest";
import { isNutrientKey, NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";

it("defines the complete selectable catalog in wizard order", () => {
  expect(NUTRIENT_KEYS.map((key) => {
    const { category, label, unit, defaultDailyTarget } = NUTRIENT_CATALOG[key];
    return [key, category, label, unit, defaultDailyTarget];
  })).toEqual([
    ["vitaminA", "vitamin", "Vitamin A", "mcg RAE", 900],
    ["vitaminB1", "vitamin", "Vitamin B1", "mg", 1.2],
    ["vitaminB2", "vitamin", "Vitamin B2", "mg", 1.3],
    ["vitaminB3", "vitamin", "Vitamin B3", "mg NE", 16],
    ["vitaminB6", "vitamin", "Vitamin B6", "mg", 1.7],
    ["vitaminB9", "vitamin", "Vitamin B9 (Folate)", "mcg DFE", 400],
    ["vitaminB12", "vitamin", "Vitamin B12", "mcg", 2.4],
    ["vitaminC", "vitamin", "Vitamin C", "mg", 90],
    ["vitaminD", "vitamin", "Vitamin D", "mcg", 20],
    ["vitaminE", "vitamin", "Vitamin E", "mg", 15],
    ["vitaminK", "vitamin", "Vitamin K", "mcg", 120],
    ["calcium", "mineral", "Calcium", "mg", 1300],
    ["iron", "mineral", "Iron", "mg", 18],
    ["magnesium", "mineral", "Magnesium", "mg", 420],
    ["potassium", "mineral", "Potassium", "mg", 4700],
    ["sodium", "mineral", "Sodium", "mg", 2300],
    ["zinc", "mineral", "Zinc", "mg", 11],
    ["iodine", "mineral", "Iodine", "mcg", 150],
    ["selenium", "mineral", "Selenium", "mcg", 55],
    ["phosphorus", "mineral", "Phosphorus", "mg", 1250],
    ["protein", "essential", "Protein", "g", 50],
    ["fiber", "essential", "Fiber", "g", 28],
    ["totalSugars", "essential", "Total Sugars", "g", 35],
    ["addedSugars", "essential", "Added Sugars", "g", 50],
    ["carbohydrates", "essential", "Carbohydrates", "g", 275],
    ["healthyFats", "essential", "Healthy Fats", "g", 45],
    ["water", "essential", "Water", "g", 2700],
  ]);
});

it("accepts exact canonical keys, not aliases, prototype keys or non-strings", () => {
  expect(NUTRIENT_KEYS.every(isNutrientKey)).toBe(true);
  for (const key of ["folate", "total_sugars", "Sodium", "constructor", "__proto__", null, 2000]) {
    expect(isNutrientKey(key)).toBe(false);
  }
});
