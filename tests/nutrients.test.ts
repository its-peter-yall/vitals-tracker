import { expect, it } from "vitest";
import { isNutrientKey, NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import {
  roundNutrientForDisplay, scaleFoodNutrients, scaleSupplementNutrients, sumDailyNutrients,
} from "@/lib/nutrients/calculator";

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

it("scales food in g or ml on either baseline using the 1:1 fallback", () => {
  const solids = { defaultUnit: "g", nutrientsPer100: { protein: 4, iron: 0 } } as const;
  const liquids = { defaultUnit: "ml", nutrientsPer100: { water: 80, totalSugars: 10 } } as const;
  expect(scaleFoodNutrients(solids, 50, "g")).toEqual({ protein: 2, iron: 0 });
  expect(scaleFoodNutrients(solids, 50, "ml")).toEqual({ protein: 2, iron: 0 });
  const fractional = scaleFoodNutrients(liquids, 125.5, "ml");
  expect(fractional.water).toBeCloseTo(100.4, 12);
  expect(fractional.totalSugars).toBeCloseTo(12.55, 12);
  expect(scaleFoodNutrients(liquids, 125.5, "g")).toEqual(fractional);
  expect(scaleFoodNutrients(solids, 100, "g")).toEqual(solids.nutrientsPer100);
  expect(scaleFoodNutrients(solids, 100, "g")).not.toBe(solids.nutrientsPer100);
});

it("scales fractional or multiple supplement doses in canonical units", () => {
  const baseline = Object.freeze({ vitaminD: 25, calcium: 300, vitaminB12: 2.4 });
  expect(scaleSupplementNutrients(baseline, 0.5)).toEqual({
    vitaminD: 12.5, calcium: 150, vitaminB12: 1.2,
  });
  expect(scaleSupplementNutrients(baseline, 2)).toEqual({
    vitaminD: 50, calcium: 600, vitaminB12: 4.8,
  });
  expect(baseline).toEqual({ vitaminD: 25, calcium: 300, vitaminB12: 2.4 });
});

it("scales sparse baselines safely without treating unknown amounts as zero", () => {
  const baseline = { protein: 0, sodium: NaN, iodine: Infinity, iron: -1, fiber: "2", salt: 5 };
  expect(scaleFoodNutrients({ defaultUnit: "g", nutrientsPer100: baseline }, 100, "g"))
    .toEqual({ protein: 0 });
  expect(scaleFoodNutrients({ defaultUnit: "ml", nutrientsPer100: {} }, 100, "ml")).toEqual({});
  expect(scaleFoodNutrients({ defaultUnit: "g", nutrientsPer100: baseline }, 0, "g")).toEqual({});
  expect(scaleSupplementNutrients({ calcium: 300 }, 0)).toEqual({});
  expect(scaleSupplementNutrients({}, 2)).toEqual({});
  const inherited = Object.assign(Object.create({ vitaminC: 500 }), { protein: 1 });
  expect(scaleSupplementNutrients(inherited, 1)).toEqual({ protein: 1 });
});

it("rejects invalid scaling quantities and numeric overflow", () => {
  const food = { defaultUnit: "g", nutrientsPer100: { iron: 1 } } as const;
  for (const quantity of [-1, NaN, Infinity]) {
    expect(() => scaleFoodNutrients(food, quantity, "g")).toThrow(RangeError);
    expect(() => scaleSupplementNutrients({ iron: 1 }, quantity)).toThrow(RangeError);
  }
  expect(() => scaleSupplementNutrients({ iron: Number.MAX_VALUE }, 2)).toThrow(RangeError);
});

it("scales at number precision and rounds explicitly for display only", () => {
  const food = { defaultUnit: "g", nutrientsPer100: { fiber: 3.456789 } } as const;
  const snapshot = scaleFoodNutrients(food, 33.3, "g");
  expect(snapshot.fiber).toBeCloseTo(1.151110737, 12);
  expect(roundNutrientForDisplay(snapshot.fiber!)).toBe(1.1511);
  expect(roundNutrientForDisplay(0.03125)).toBe(0.0313);
  expect(roundNutrientForDisplay(0.00004)).toBe(0);
  expect(roundNutrientForDisplay(2)).toBe(2);
  expect(() => roundNutrientForDisplay(NaN)).toThrow(RangeError);
});

it("aggregates full-day food and supplement snapshots without altering inputs", () => {
  const food = Object.freeze(scaleFoodNutrients({
    defaultUnit: "g", nutrientsPer100: { protein: 4, totalSugars: 6, calcium: 60, sodium: 55 },
  }, 150, "g"));
  const supplement = Object.freeze(scaleSupplementNutrients({ calcium: 200, vitaminD: 10 }, 0.5));
  const snapshots = Object.freeze([food, supplement, Object.freeze({})]);
  expect(sumDailyNutrients(snapshots)).toEqual({
    protein: 6, totalSugars: 9, calcium: 190, sodium: 82.5, vitaminD: 5,
  });
  expect(food).toEqual({ protein: 6, totalSugars: 9, calcium: 90, sodium: 82.5 });
  expect(supplement).toEqual({ calcium: 100, vitaminD: 5 });
});

it("aggregates sparse and empty snapshots and retains only known valid amounts", () => {
  expect(sumDailyNutrients([])).toEqual({});
  expect(sumDailyNutrients([{}, {}])).toEqual({});
  expect(sumDailyNutrients([{ fiber: 0, sodium: NaN, unknown: 10 }, { calcium: 15, iron: -1 }]))
    .toEqual({ fiber: 0, calcium: 15 });
  expect(() => sumDailyNutrients([{ iron: Number.MAX_VALUE }, { iron: Number.MAX_VALUE }]))
    .toThrow(RangeError);
});

it("aggregates before rounding so tiny logged amounts can add up", () => {
  const small = scaleSupplementNutrients({ vitaminB12: 0.00004 }, 1);
  const total = sumDailyNutrients([small, small, small]);
  expect(total.vitaminB12).toBeCloseTo(0.00012, 14);
  expect(roundNutrientForDisplay(total.vitaminB12!)).toBe(0.0001);
});
