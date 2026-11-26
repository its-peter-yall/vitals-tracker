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
