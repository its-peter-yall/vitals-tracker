import "server-only";
import type { Db } from "@/db";
import type { NutrientKey } from "@/lib/nutrients/types";
import type { AnalyticsQuery } from "@/lib/trackers/schemas";
import { findTracker, readSnapshotWindow, summarizeDay, type SnapshotRow } from "@/lib/trackers/service";
import type { Analytics, MedicineAdherence, NutrientInsight } from "./types";

const dayMs = 86_400_000;
const completionThresholdPct = 80;
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function calendarWindow(endDate: string, length: number) {
  // UTC here is only calendar arithmetic on an already-chosen local date label.
  const last = Date.parse(`${endDate}T00:00:00.000Z`);
  return Array.from({ length }, (_, index) => new Date(last - (length - 1 - index) * dayMs)
    .toISOString().slice(0, 10));
}

function exceedsReference(amount: number, target: number) {
  return amount - target > 2 * Number.EPSILON * Math.max(amount, target);
}

function buildMedicineAdherence(rows: readonly SnapshotRow[], rangeDays: number): MedicineAdherence[] {
  type Group = { medicineId: string | null; displayName: string; dates: Set<string> };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (row.entryType !== "medicine") continue;
    const key = row.medicineId ? `id:${row.medicineId}` : `name:${row.displayName.trim().toLowerCase()}`;
    const group = groups.get(key) ?? { medicineId: row.medicineId, displayName: row.displayName, dates: new Set<string>() };
    group.dates.add(row.logDate);
    groups.set(key, group);
  }
  return [...groups].map(([key, { medicineId, displayName, dates }]) => ({
    key, medicineId, displayName, loggedDays: dates.size, rangeDays, loggedDates: [...dates].sort(),
    loggedDayPct: (dates.size / rangeDays) * 100,
  })).sort((a, b) => b.loggedDays - a.loggedDays || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export async function trackerAnalytics(
  db: Db, userId: string, trackerId: string, { range, endDate }: AnalyticsQuery,
): Promise<Analytics | null> {
  const tracker = await findTracker(db, userId, trackerId);
  if (!tracker) return null;
  const length = range === "7d" ? 7 : 30;
  const dates = calendarWindow(endDate, length);
  const startDate = dates[0];
  const rows = await readSnapshotWindow(db, userId, trackerId, startDate, endDate);
  const buckets = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.logDate);
    if (bucket) bucket.push(row);
    else buckets.set(row.logDate, [row]);
  }
  const summaries = dates.map((date) => summarizeDay(date, tracker, buckets.get(date) ?? []));
  const days = summaries.map(({ date, alerts }) => ({ date, alerts, active: buckets.has(date) }));
  const activeDays = days.filter((day) => day.active).length;
  const cautionDays = days.filter((day) => day.alerts.length > 0).map((day) => day.date);
  const cautionKeys = new Set<NutrientKey>(days.flatMap((day) => day.alerts.flatMap((alert) =>
    alert.triggers.map((trigger) => trigger.nutrientKey))));
  const needsAttention: NutrientInsight[] = [];
  const onTrack: NutrientInsight[] = [];
  const goalAverages: number[] = [];
  const trends = tracker.nutrients.map((nutrient, index) => {
    const { nutrientKey, targetKind, dailyTarget } = nutrient;
    const series = summaries.map(({ date, progress }) => {
      const { amount, hasAmount } = progress[index];
      return { date, amount, hasAmount };
    });
    const averageCompletionPct = targetKind === "goal"
      ? mean(series.map(({ amount }) => Math.min(amount / dailyTarget, 1) * 100)) : null;
    if (averageCompletionPct !== null) goalAverages.push(averageCompletionPct);
    if (activeDays > 0) {
      if (averageCompletionPct !== null) {
        if (averageCompletionPct >= completionThresholdPct) onTrack.push({ nutrientKey, reason: "goalOnTrack" });
        else needsAttention.push({ nutrientKey, reason: "lowCompletion" });
      } else if (series.some(({ amount }) => exceedsReference(amount, dailyTarget)) || cautionKeys.has(nutrientKey)) {
        needsAttention.push({ nutrientKey, reason: "upperExceeded" });
      } else if (series.some(({ hasAmount }) => hasAmount)) {
        onTrack.push({ nutrientKey, reason: "upperWithinReference" });
      }
    }
    return { ...nutrient, series, averageCompletionPct };
  });
  return {
    range, startDate, endDate, days, activeDays, cautionDays, cautionDayCount: cautionDays.length,
    trends, needsAttention, onTrack, averageCompletionPct: goalAverages.length ? mean(goalAverages) : null,
    medicineAdherence: buildMedicineAdherence(rows, length),
  };
}
