import { expect, it } from "vitest";
import { DEFAULT_IMPACT_THRESHOLDS, evaluateImpact } from "@/lib/impact/engine";
import { scaleFoodNutrients, scaleSupplementNutrients, sumDailyNutrients } from "@/lib/nutrients/calculator";

it("does not warn just below or exactly at each default threshold", () => {
  expect(DEFAULT_IMPACT_THRESHOLDS).toEqual({ totalSugars: 35, addedSugars: 25, sodium: 2000 });
  const healthFlags = ["diabetes", "hypertension"] as const;
  expect(evaluateImpact({
    healthFlags, dailyTotals: { totalSugars: 34.9999, addedSugars: 24.9999, sodium: 1999.9999 },
  })).toEqual([]);
  expect(evaluateImpact({
    healthFlags, dailyTotals: { totalSugars: 35, addedSugars: 25, sodium: 2000 },
  })).toEqual([]);
  expect(evaluateImpact({
    healthFlags, dailyTotals: { totalSugars: 30, addedSugars: 20, carbohydrates: 999 },
  })).toEqual([]);
});

it("warns just above each default threshold independently", () => {
  const healthFlags = ["diabetes", "hypertension"] as const;
  for (const entry of [
    ["totalSugars", 35.00001, 35, "g", "diabetes"],
    ["addedSugars", 25.00001, 25, "g", "diabetes"],
    ["sodium", 2000.00001, 2000, "mg", "hypertension"],
  ] as const) {
    const [nutrientKey, total, threshold, unit, healthFlag] = entry;
    const alerts = evaluateImpact({ healthFlags, dailyTotals: { [nutrientKey]: total } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ healthFlag, triggers: [{ nutrientKey, total, threshold, unit }] });
  }
});

it("emits one directional caution per active condition in stable order from mixed logs", () => {
  const food = scaleFoodNutrients({
    defaultUnit: "ml", nutrientsPer100: { totalSugars: 24, addedSugars: 17, sodium: 1200 },
  }, 150, "g");
  const supplement = scaleSupplementNutrients({ sodium: 110, vitaminC: 45 }, 2);
  const dailyTotals = Object.freeze(sumDailyNutrients([food, supplement]));
  const alerts = evaluateImpact({
    healthFlags: ["hypertension", "diabetes", "diabetes"], dailyTotals,
  });
  expect(alerts).toEqual([
    {
      healthFlag: "diabetes",
      message: "Sugar logged today is above the tracker’s reference. Sugary foods and drinks can raise blood sugar.",
      triggers: [
        { nutrientKey: "totalSugars", total: 36, threshold: 35, unit: "g" },
        { nutrientKey: "addedSugars", total: 25.5, threshold: 25, unit: "g" },
      ],
    },
    {
      healthFlag: "hypertension",
      message: "Sodium logged today is above the tracker’s reference. High-sodium foods can contribute to higher blood pressure.",
      triggers: [{ nutrientKey: "sodium", total: 2020, threshold: 2000, unit: "mg" }],
    },
  ]);
  expect(alerts.every(({ message }) => !/mg\s*\/\s*dL|mm\s*Hg|\d/i.test(message))).toBe(true);
  expect(evaluateImpact({ healthFlags: ["diabetes"], dailyTotals })).toEqual([alerts[0]]);
  expect(evaluateImpact({ healthFlags: ["hypertension"], dailyTotals })).toEqual([alerts[1]]);
  expect(evaluateImpact({ healthFlags: [], dailyTotals })).toEqual([]);
});

it("does not warn for empty, zero, missing or invalid daily nutrient amounts", () => {
  const healthFlags = ["diabetes", "hypertension"] as const;
  expect(evaluateImpact({ healthFlags, dailyTotals: sumDailyNutrients([]) })).toEqual([]);
  expect(evaluateImpact({
    healthFlags, dailyTotals: { totalSugars: 0, addedSugars: 0, sodium: 0 },
  })).toEqual([]);
  expect(evaluateImpact({
    healthFlags, dailyTotals: { protein: 50, totalSugars: Infinity, sodium: NaN, addedSugars: -1 },
  })).toEqual([]);
});

it("does not warn when a day exactly reaches the limit before entry display rounding", () => {
  const dailyTotals = sumDailyNutrients([
    { totalSugars: 10.00006 }, { totalSugars: 10.00006 }, { totalSugars: 14.99988 },
  ]);
  expect(dailyTotals.totalSugars).toBeCloseTo(35, 12);
  expect(evaluateImpact({ healthFlags: ["diabetes"], dailyTotals })).toEqual([]);
});
