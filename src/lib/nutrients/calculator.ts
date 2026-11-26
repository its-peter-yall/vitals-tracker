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
