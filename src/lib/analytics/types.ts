import type { ImpactAlert } from "@/lib/impact/types";
import type { NutrientKey } from "@/lib/nutrients/types";
import type { AnalyticsQuery } from "@/lib/trackers/schemas";
import type { TrackerNutrient } from "@/lib/trackers/service";

export type AnalyticsDay = { date: string; active: boolean; alerts: ImpactAlert[] };
export type TrendPoint = { date: string; amount: number; hasAmount: boolean };
export type NutrientTrend = TrackerNutrient & {
  averageCompletionPct: number | null;
  series: TrendPoint[];
};
export type NutrientInsight = {
  nutrientKey: NutrientKey;
  reason: "lowCompletion" | "goalOnTrack" | "upperExceeded" | "upperWithinReference";
};
export type MedicineAdherence = {
  key: string;
  medicineId: string | null;
  displayName: string;
  loggedDays: number;
  rangeDays: number;
  loggedDates: string[];
  loggedDayPct: number;
};

export type Analytics = {
  range: AnalyticsQuery["range"];
  startDate: string;
  endDate: string;
  activeDays: number;
  cautionDays: string[];
  cautionDayCount: number;
  averageCompletionPct: number | null;
  days: AnalyticsDay[];
  trends: NutrientTrend[];
  needsAttention: NutrientInsight[];
  onTrack: NutrientInsight[];
  medicineAdherence: MedicineAdherence[];
};
