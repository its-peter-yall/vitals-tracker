# P3 — Canonical Nutrient Catalog, Scaling Math & Condition Impact Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one canonical adult-reference nutrient catalog, pure food and supplement calculations, and deterministic, non-clinical cautions from a tracker's full daily totals.

**Architecture:** Catalog keys and units define the JSON contract shared by food, medicine, tracker, and UI consumers. The calculator scales inputs into sparse, immutable-by-convention snapshots and aggregates a caller-selected day's snapshots without display rounding. The impact engine reads those totals and explicit target overrides, without filtering by selection or performing any database, network, or UI work.

**Tech Stack:** Strict TypeScript (P1 `tsc` 7.0.2), Node ≥24.15, npm, Vitest 5.1.2 (P1 Node environment and `@/` → `src/` alias). No new packages.

---

## Owned files

| File | Responsibility |
| --- | --- |
| `src/lib/nutrients/catalog.ts` | Ordered catalog, runtime keys and key guard. |
| `src/lib/nutrients/types.ts` | Canonical keys, categories, units, maps and food profile contract. |
| `src/lib/nutrients/calculator.ts` | Scaling, full-day snapshot summation, explicit display rounding. |
| `src/lib/impact/types.ts` | Health flags, evaluation input and nutritional caution payload. |
| `src/lib/impact/engine.ts` | Default thresholds, custom overrides and stable, directional cautions. |
| `tests/nutrients.test.ts` | Catalog, unit/quantity cases, rounding and snapshot aggregation. |
| `tests/impact-engine.test.ts` | Full-day integration, strict boundaries, flags, custom targets and safe copy. |

## Execution and downstream contracts

- P1 is complete. Work from the repo root in Windows PowerShell 5.1. Run commands on separate lines; only RED runs are expected to fail. Use the existing Vitest config and scripts; don't edit setup, dependencies, routes, the DB schema, `.env*`, or other plans. Stage only the task's files; serialize staging and commits with the orchestrator if sharing a checkout.
- **P4/P5, providers and seeds:** use exact case-sensitive keys in Task 1. Normalize provider amounts into the catalog units before calling these functions or writing maps. `vitaminA` is retinol activity equivalents (RAE), `vitaminB9` dietary folate equivalents (DFE), `vitaminB3` niacin equivalents (NE), and `vitaminE` mg of alpha-tocopherol. Do not relabel IU, raw folic acid, or unverified vitamin forms as canonical amounts. `water` is grams of water in food/drink, not the serving's volume. Use `healthyFats` for known cis monounsaturated + polyunsaturated fat; missing components don't justify relabeling total fat. `totalSugars` includes `addedSugars` when known; don't add these columns together or infer one from the other. Convert sodium to **mg of sodium**, not grams of salt. Omit unknown values; an explicit zero means a known zero.
- **P6, snapshots and summaries:** P1's `intakeLogs.computedNutrientsJson`, `foods.nutrientsPer100Json` and `medicines.nutrientsPerDoseJson` are `Record<string, number>`; the pure helpers accept those maps without importing P1. Food: `scaleFoodNutrients({ defaultUnit: food.defaultUnit, nutrientsPer100: food.nutrientsPer100Json }, quantity, unit)`. Medicine: `scaleSupplementNutrients(medicine.nutrientsPerDoseJson, quantity)` for `supplement`/`both`, and `{}` for prescription-only. `quantity` is the multiplier of the labeled dose, not the mass of the medicine. Persist every canonical nutrient computed for the log. Pass `logs.map((log) => log.computedNutrientsJson)` to `sumDailyNutrients` after selecting one user, one tracker and one local date; use the result for `evaluateImpact`, then filter only the progress cards. P6 owns all parsing, log editing, bucketing, DB calls and validation of positive persisted quantities. P3 doesn't import env or the async DB factories.
- **P6/P7, explicit overrides:** `evaluateImpact({ dailyTotals, healthFlags, customTargets })` uses a positive finite *explicit* override for each relevant key, even if that value equals the catalog target. Omit untouched wizard defaults and do not infer overrides from a card being selected. P1's `trackerNutrients.dailyTarget` is required and has no override marker: the orchestrator must assign an integration owner to preserve explicitness from wizard through persistence (e.g. an explicit persisted flag). Comparing the row to the catalog default cannot distinguish an explicit choice equal to that default from an untouched value. This is a downstream integration risk, not permission to change P1 files in P3.
- **P7/P8, display and analytics:** Catalog defaults are editable references, not clinical limits or goals everyone should reach. Treat sodium and sugars as upper references, not achievements. `roundNutrientForDisplay` is for visible amounts only; never persist its output or feed it back to impact/analytics. Use the returned `healthFlag`, `triggers` (nutrition units only) and `message` for each caution. A caution day is a day with ≥1 alert; no alert is not a statement that intake is safe or fully logged.

### Task 1: Lock the canonical catalog and types

**Files:** Create `src/lib/nutrients/catalog.ts`, `src/lib/nutrients/types.ts`, and `tests/nutrients.test.ts`.

- [ ] **Write the failing tests** in `tests/nutrients.test.ts`:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/nutrients.test.ts` → fails to resolve the catalog module.
- [ ] **Implement** `src/lib/nutrients/types.ts`:

```ts
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
```

`src/lib/nutrients/catalog.ts`:

```ts
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
```

Sources: [FDA label Daily Values](https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels) for the 20 vitamins/minerals and protein, fiber, added sugars and carbohydrates. Water uses the [National Academies' 2.7 L adult-women all-source adequate intake](https://www.nationalacademies.org/read/10925/chapter/10), expressed as 2700 g. Total sugars 35 g and healthy fats 45 g are editable app references, not FDA DVs; the US label has no separate DV for either. The default condition cautions are separate product thresholds (Task 4).

- [ ] **Run GREEN:** `npx vitest run tests/nutrients.test.ts` → both catalog tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/nutrients/catalog.ts src/lib/nutrients/types.ts tests/nutrients.test.ts
git commit -m "feat(nutrients): define canonical nutrient catalog and units"
```

### Task 2: Scale food and supplement portions without rounding snapshots

**Files:** Create `src/lib/nutrients/calculator.ts`; modify `tests/nutrients.test.ts`.

- [ ] **Write the failing tests.** Add this import and append the tests in `tests/nutrients.test.ts`:

```ts
import {
  roundNutrientForDisplay, scaleFoodNutrients, scaleSupplementNutrients,
} from "@/lib/nutrients/calculator";
```

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/nutrients.test.ts` → fails to resolve the calculator module.
- [ ] **Implement** `src/lib/nutrients/calculator.ts`. Quantity `0` is a valid empty preview. At positive quantities, preserve explicit zero from the input; skip absent, inherited, unknown or malformed amounts rather than coercing them. Nonfinite/negative quantities and overflow are calculation errors; downstream log APIs must validate inputs and handle errors. There is intentionally no density field or unit conversion beyond the specified `g`/`ml` fallback. Display rounding uses `toFixed(4)` on the JS `number` and returns a number (no trailing zero padding); it never changes the snapshot.

```ts
import { NUTRIENT_KEYS } from "./catalog";
import type {
  FoodNutrientProfile, FoodQuantityUnit, NutrientInput, NutrientKey, NutrientMap,
} from "./types";

const FALLBACK_GRAMS_PER_ML = 1;

export function readNutrientAmount(input: NutrientInput, key: NutrientKey): number | undefined {
  if (!Object.hasOwn(input, key)) return undefined;
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value === 0 ? 0 : value;
}

function checkQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError("Quantity must be a finite non-negative number.");
  }
}

function scaleAmounts(input: NutrientInput, factor: number): NutrientMap {
  const scaled: NutrientMap = {};
  for (const key of NUTRIENT_KEYS) {
    const amount = readNutrientAmount(input, key);
    if (amount === undefined) continue;
    const value = amount * factor;
    if (!Number.isFinite(value)) throw new RangeError(`Nutrient amount overflow: ${key}`);
    scaled[key] = value;
  }
  return scaled;
}

export function scaleFoodNutrients(
  food: FoodNutrientProfile, quantity: number, unit: FoodQuantityUnit,
): NutrientMap {
  checkQuantity(quantity);
  if (quantity === 0) return {};
  // Normalize to the profile's basis; the MVP fallback assumes 1 g per ml.
  const inBaselineUnit = unit === food.defaultUnit
    ? quantity
    : unit === "ml" ? quantity * FALLBACK_GRAMS_PER_ML : quantity / FALLBACK_GRAMS_PER_ML;
  return scaleAmounts(food.nutrientsPer100, inBaselineUnit / 100);
}

export function scaleSupplementNutrients(perDose: NutrientInput, doses: number): NutrientMap {
  checkQuantity(doses);
  return doses === 0 ? {} : scaleAmounts(perDose, doses);
}

export function roundNutrientForDisplay(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Nutrient amount must be a finite non-negative number.");
  }
  return Number(amount.toFixed(4));
}
```

- [ ] **Run GREEN:** `npx vitest run tests/nutrients.test.ts` → seven tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/nutrients/calculator.ts tests/nutrients.test.ts
git commit -m "feat(nutrients): scale food portions and supplement doses"
```

### Task 3: Aggregate mixed snapshots into full-day nutrient totals

**Files:** Modify `src/lib/nutrients/calculator.ts` and `tests/nutrients.test.ts`.

- [ ] **Write the failing tests.** Add `sumDailyNutrients` to the existing calculator import in `tests/nutrients.test.ts`, then append:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/nutrients.test.ts -t "aggregates"` → fails because `sumDailyNutrients` isn't exported.
- [ ] **Implement** by appending to `src/lib/nutrients/calculator.ts`. Add each nutrient independently with compensated summation to reduce floating-point accumulation error. This function neither re-scales snapshots nor determines which day they belong to.

```ts
export function sumDailyNutrients(snapshots: readonly NutrientInput[]): NutrientMap {
  const totals: NutrientMap = {};
  const correction: NutrientMap = {};
  for (const snapshot of snapshots) {
    for (const key of NUTRIENT_KEYS) {
      const amount = readNutrientAmount(snapshot, key);
      if (amount === undefined) continue;
      const previous = totals[key] ?? 0;
      const adjusted = amount - (correction[key] ?? 0);
      const next = previous + adjusted;
      if (!Number.isFinite(next)) throw new RangeError(`Daily nutrient total overflow: ${key}`);
      correction[key] = (next - previous) - adjusted;
      totals[key] = next;
    }
  }
  return totals;
}
```

- [ ] **Run GREEN:** `npx vitest run tests/nutrients.test.ts` → ten tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/nutrients/calculator.ts tests/nutrients.test.ts
git commit -m "feat(nutrients): aggregate full-day nutrient snapshots"
```

### Task 4: Emit deterministic directional cautions at default limits

**Files:** Create `src/lib/impact/types.ts`, `src/lib/impact/engine.ts`, and `tests/impact-engine.test.ts`.

- [ ] **Write the failing tests** in `tests/impact-engine.test.ts`:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/impact-engine.test.ts` → fails to resolve the impact engine.
- [ ] **Implement** `src/lib/impact/types.ts`. The pure flag union is structurally compatible with P1's `HealthFlag`; don't import the server-only schema.

```ts
import type { NutrientInput, NutrientUnit } from "../nutrients/types";

export type HealthFlag = "diabetes" | "hypertension";
export type ImpactNutrientKey = "totalSugars" | "addedSugars" | "sodium";

export type ImpactInput = Readonly<{
  dailyTotals: NutrientInput;
  healthFlags: readonly HealthFlag[];
}>;

export type ImpactTrigger = Readonly<{
  nutrientKey: ImpactNutrientKey;
  total: number;
  threshold: number;
  unit: NutrientUnit;
}>;

export type ImpactAlert = Readonly<{
  healthFlag: HealthFlag;
  message: string;
  triggers: readonly ImpactTrigger[];
}>;
```

`src/lib/impact/engine.ts`:

```ts
import { readNutrientAmount } from "../nutrients/calculator";
import { NUTRIENT_CATALOG } from "../nutrients/catalog";
import type { HealthFlag, ImpactAlert, ImpactInput, ImpactNutrientKey, ImpactTrigger } from "./types";

export const DEFAULT_IMPACT_THRESHOLDS = Object.freeze({
  totalSugars: 35, addedSugars: 25, sodium: 2000,
} as const satisfies Record<ImpactNutrientKey, number>);

const rules = [
  {
    healthFlag: "diabetes",
    nutrientKeys: ["totalSugars", "addedSugars"],
    message: "Sugar logged today is above the tracker’s reference. Sugary foods and drinks can raise blood sugar.",
  },
  {
    healthFlag: "hypertension",
    nutrientKeys: ["sodium"],
    message: "Sodium logged today is above the tracker’s reference. High-sodium foods can contribute to higher blood pressure.",
  },
] as const satisfies readonly {
  healthFlag: HealthFlag; nutrientKeys: readonly ImpactNutrientKey[]; message: string;
}[];

export function evaluateImpact({ dailyTotals, healthFlags }: ImpactInput): ImpactAlert[] {
  const alerts: ImpactAlert[] = [];
  for (const { healthFlag, nutrientKeys, message } of rules) {
    if (!healthFlags.includes(healthFlag)) continue;
    const triggers: ImpactTrigger[] = [];
    for (const nutrientKey of nutrientKeys) {
      const total = readNutrientAmount(dailyTotals, nutrientKey);
      if (total === undefined) continue;
      const threshold = DEFAULT_IMPACT_THRESHOLDS[nutrientKey];
      // Treat roundoff from scaling and summing as equality, not a measured excess.
      const floatSlack = 2 * Number.EPSILON * Math.max(total, threshold);
      if (total <= threshold || total - threshold <= floatSlack) continue;
      triggers.push({ nutrientKey, total, threshold, unit: NUTRIENT_CATALOG[nutrientKey].unit });
    }
    if (triggers.length > 0) alerts.push({ healthFlag, message, triggers });
  }
  return alerts;
}
```

Diabetes uses OR (one message with up to two independently exceeded nutrients), not a sum or a carbohydrate/glycemic proxy. Hypertension uses sodium only. Both use a strict `>` rule at meaningful precision: equality and machine-roundoff-sized excesses do not warn; there is no display rounding or nutrition-unit-sized tolerance. The engine returns no diagnosis, simulated reading, dosing advice or treatment recommendation.

- [ ] **Run GREEN:** `npx vitest run tests/impact-engine.test.ts` → five tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/impact/types.ts src/lib/impact/engine.ts tests/impact-engine.test.ts
git commit -m "feat(impact): evaluate default daily sugar and sodium cautions"
```

### Task 5: Honor explicit custom targets and run the P3 exit gate

**Files:** Modify `src/lib/impact/types.ts`, `src/lib/impact/engine.ts`, and `tests/impact-engine.test.ts`.

- [ ] **Write the failing tests** by appending to `tests/impact-engine.test.ts`:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/impact-engine.test.ts -t "explicit override|lower custom limits"` → the assertions fail with default thresholds still used.
- [ ] **Implement:** In `src/lib/impact/types.ts`, replace `ImpactInput` with:

```ts
export type ImpactInput = Readonly<{
  dailyTotals: NutrientInput;
  healthFlags: readonly HealthFlag[];
  customTargets?: NutrientInput;
}>;
```

In `src/lib/impact/engine.ts`, change only the evaluator signature and threshold lookup:

```diff
-export function evaluateImpact({ dailyTotals, healthFlags }: ImpactInput): ImpactAlert[] {
+export function evaluateImpact({ dailyTotals, healthFlags, customTargets }: ImpactInput): ImpactAlert[] {
@@
-      const threshold = DEFAULT_IMPACT_THRESHOLDS[nutrientKey];
+      const custom = customTargets && readNutrientAmount(customTargets, nutrientKey);
+      const threshold = custom !== undefined && custom > 0
+        ? custom
+        : DEFAULT_IMPACT_THRESHOLDS[nutrientKey];
```

Undefined, inherited, zero, negative, nonfinite, and nonnumeric overrides fall back per nutrient; no other targets affect these rules.

- [ ] **Run GREEN and the exit gate**, as separate commands:

```powershell
npx vitest run tests/nutrients.test.ts tests/impact-engine.test.ts
npm run typecheck
```

Expect 19 passing tests across the two files and an exit code of 0 for typecheck (`next typegen` may create ignored outputs). Review `git diff --check` and `git status --short`; no P3 edits outside the seven owned files.

- [ ] **Commit:**

```powershell
git add -- src/lib/impact/types.ts src/lib/impact/engine.ts tests/impact-engine.test.ts
git commit -m "feat(impact): honor explicit tracker nutrient thresholds"
```
