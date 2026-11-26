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

it("uses an explicit override, even if it equals the catalog target, but not a different key's target", () => {
  const healthFlags = ["diabetes", "hypertension"] as const;
  const dailyTotals = { totalSugars: 36, addedSugars: 30, sodium: 2200 };
  const customTargets = Object.freeze({ totalSugars: 45, addedSugars: 50, sodium: 2300 });
  expect(evaluateImpact({ healthFlags, dailyTotals, customTargets })).toEqual([]);

  const alerts = evaluateImpact({ healthFlags, dailyTotals, customTargets: { totalSugars: 45 } });
  expect(alerts.map(({ healthFlag, triggers }) => [healthFlag, triggers])).toEqual([
    ["diabetes", [{ nutrientKey: "addedSugars", total: 30, threshold: 25, unit: "g" }]],
    ["hypertension", [{ nutrientKey: "sodium", total: 2200, threshold: 2000, unit: "mg" }]],
  ]);
});

it("uses lower custom limits only when the limit is exceeded, with no equality false alarms", () => {
  const healthFlags = ["diabetes", "hypertension"] as const;
  const customTargets = { totalSugars: 30, addedSugars: 20, sodium: 1500 };
  expect(evaluateImpact({
    healthFlags, customTargets, dailyTotals: { totalSugars: 29.9999, addedSugars: 19.9999, sodium: 1499.9999 },
  })).toEqual([]);
  expect(evaluateImpact({ healthFlags, customTargets, dailyTotals: { ...customTargets } })).toEqual([]);
  const alerts = evaluateImpact({
    healthFlags, customTargets,
    dailyTotals: { totalSugars: 30.00001, addedSugars: 20.00001, sodium: 1500.00001 },
  });
  expect(alerts.flatMap(({ triggers }) => triggers)).toEqual([
    { nutrientKey: "totalSugars", total: 30.00001, threshold: 30, unit: "g" },
    { nutrientKey: "addedSugars", total: 20.00001, threshold: 20, unit: "g" },
    { nutrientKey: "sodium", total: 1500.00001, threshold: 1500, unit: "mg" },
  ]);
});

it("treats machine roundoff at a fractional custom limit as equality", () => {
  const dailyTotals = sumDailyNutrients([{ addedSugars: 0.1 }, { addedSugars: 0.2 }]);
  expect(dailyTotals.addedSugars).toBeGreaterThan(0.3);
  expect(evaluateImpact({
    healthFlags: ["diabetes"], dailyTotals, customTargets: { addedSugars: 0.3 },
  })).toEqual([]);
});

it("ignores invalid or inherited custom targets and does not warn on unlogged nutrients", () => {
  const healthFlags = ["diabetes", "hypertension"] as const;
  const dailyTotals = { totalSugars: 36, addedSugars: 26, sodium: 2001 };
  const defaults = evaluateImpact({ healthFlags, dailyTotals });
  expect(defaults).toHaveLength(2);
  for (const value of [0, -1, NaN, Infinity, "500", undefined]) {
    expect(evaluateImpact({
      healthFlags, dailyTotals, customTargets: { totalSugars: value, addedSugars: value, sodium: value },
    })).toEqual(defaults);
  }
  expect(evaluateImpact({
    healthFlags, dailyTotals, customTargets: Object.create({ totalSugars: 100, sodium: 9999 }),
  })).toEqual(defaults);
  expect(evaluateImpact({
    healthFlags, dailyTotals: { protein: 90 }, customTargets: { totalSugars: 1, sodium: 1 },
  })).toEqual([]);
});
