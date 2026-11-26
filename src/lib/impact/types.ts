import type { NutrientInput, NutrientUnit } from "../nutrients/types";

export type HealthFlag = "diabetes" | "hypertension";
export type ImpactNutrientKey = "totalSugars" | "addedSugars" | "sodium";

export type ImpactInput = Readonly<{
  dailyTotals: NutrientInput;
  healthFlags: readonly HealthFlag[];
  customTargets?: NutrientInput;
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
