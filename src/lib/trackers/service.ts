import "server-only";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import type { Db } from "@/db";
import { foods, intakeLogs, medicines, trackerNutrients, trackers } from "@/db/schema";
import { isNutrientKey, NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import { scaleFoodNutrients, scaleSupplementNutrients } from "@/lib/nutrients/calculator";
import type { CreateLog, CreateTracker, PatchTracker } from "./schemas";

type Reader = Pick<Db, "select">;
type TrackerRow = typeof trackers.$inferSelect;
type NutrientRow = typeof trackerNutrients.$inferSelect;

function trackerScope(userId: string, id?: string) {
  return and(eq(trackers.userId, userId), id === undefined ? undefined : eq(trackers.id, id));
}

function nutrientView(row: NutrientRow) {
  const { nutrientKey, dailyTarget, isCustomTarget, sortOrder } = row;
  if (!isNutrientKey(nutrientKey)) return null;
  const { label, unit } = NUTRIENT_CATALOG[nutrientKey];
  const targetKind = nutrientKey === "sodium" || nutrientKey === "addedSugars" || nutrientKey === "totalSugars"
    ? "upper" as const : "goal" as const;
  return { nutrientKey, dailyTarget, isCustomTarget, sortOrder, label, unit, targetKind };
}

export type TrackerNutrient = NonNullable<ReturnType<typeof nutrientView>>;
export type Tracker = {
  id: string;
  name: string;
  healthFlags: TrackerRow["healthFlagsJson"];
  createdAt: string;
  updatedAt: string;
  nutrients: TrackerNutrient[];
};

function trackerView(row: TrackerRow): Tracker {
  return { id: row.id, name: row.name, healthFlags: row.healthFlagsJson,
    createdAt: row.createdAt, updatedAt: row.updatedAt, nutrients: [] };
}

function nutrientRows(trackerId: string, selection: CreateTracker["nutrients"]) {
  return selection.map(({ nutrientKey, customDailyTarget }, sortOrder) => ({
    trackerId, nutrientKey, sortOrder, dailyTarget: customDailyTarget ?? NUTRIENT_CATALOG[nutrientKey].defaultDailyTarget,
    isCustomTarget: customDailyTarget !== undefined,
  }));
}

async function loadTrackers(db: Reader, userId: string, id?: string) {
  const rows = await db.select({ tracker: trackers, nutrient: trackerNutrients }).from(trackers)
    .leftJoin(trackerNutrients, eq(trackerNutrients.trackerId, trackers.id))
    .where(trackerScope(userId, id))
    .orderBy(desc(trackers.createdAt), asc(trackers.id), asc(trackerNutrients.sortOrder));
  const views = new Map<string, Tracker>();
  for (const { tracker, nutrient } of rows) {
    const view = views.get(tracker.id) ?? trackerView(tracker);
    const selected = nutrient && nutrientView(nutrient);
    if (selected) view.nutrients.push(selected);
    views.set(tracker.id, view);
  }
  return [...views.values()];
}

export async function findTracker(db: Reader, userId: string, id: string) {
  return (await loadTrackers(db, userId, id))[0] ?? null;
}

export const listTrackers = (db: Db, userId: string) => loadTrackers(db, userId);

export function createTracker(db: Db, userId: string, input: CreateTracker) {
  return db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const [row] = await tx.insert(trackers).values({
      userId, name: input.name, healthFlagsJson: input.healthFlags, createdAt: now, updatedAt: now,
    }).returning({ id: trackers.id });
    const selected = nutrientRows(row.id, input.nutrients);
    if (selected.length) await tx.insert(trackerNutrients).values(selected);
    return (await findTracker(tx, userId, row.id))!;
  });
}

export function updateTracker(db: Db, userId: string, id: string, input: PatchTracker) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(trackers).set({
      name: input.name, healthFlagsJson: input.healthFlags, updatedAt: new Date().toISOString(),
    }).where(trackerScope(userId, id)).returning({ id: trackers.id });
    if (!row) return null;
    if (input.nutrients !== undefined) {
      // The owned parent UPDATE above is the gate for child writes in this transaction.
      await tx.delete(trackerNutrients).where(eq(trackerNutrients.trackerId, row.id));
      const selected = nutrientRows(row.id, input.nutrients);
      if (selected.length) await tx.insert(trackerNutrients).values(selected);
    }
    return findTracker(tx, userId, row.id);
  });
}

export async function deleteTracker(db: Db, userId: string, id: string) {
  const [row] = await db.delete(trackers).where(trackerScope(userId, id)).returning({ id: trackers.id });
  return Boolean(row);
}

type LogRow = typeof intakeLogs.$inferSelect;

function logScope(userId: string, trackerId: string) {
  return and(eq(intakeLogs.userId, userId), eq(intakeLogs.trackerId, trackerId));
}

async function ownsTracker(db: Reader, userId: string, trackerId: string) {
  const [row] = await db.select({ id: trackers.id }).from(trackers)
    .where(trackerScope(userId, trackerId)).limit(1);
  return Boolean(row);
}

function logView(row: LogRow, medicineNotes: string | null) {
  const { id, trackerId, logDate, loggedAt, entryType, foodId, medicineId, displayName,
    quantity, unit, computedNutrientsJson } = row;
  return { id, trackerId, logDate, loggedAt, entryType, foodId, medicineId, displayName,
    quantity, unit, computedNutrientsJson, medicineNotes };
}
export type IntakeLog = ReturnType<typeof logView>;

function readableMedicine(userId: string) {
  return or(eq(medicines.userId, userId), isNull(medicines.userId));
}

async function findMedicine(db: Reader, userId: string, id: string) {
  const [medicine] = await db.select().from(medicines)
    .where(and(eq(medicines.id, id), readableMedicine(userId))).limit(1);
  return medicine;
}

export class InvalidSnapshotAmount extends Error {}

function checkedSnapshot(calculate: () => Record<string, number>) {
  try {
    const snapshot = calculate();
    // Reject implausibly large stored results, including from older catalog imports.
    if (Object.values(snapshot).some((value) => value > Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("Snapshot amount exceeds the numeric limit.");
    }
    return snapshot;
  } catch (error) {
    if (error instanceof RangeError) throw new InvalidSnapshotAmount();
    throw error;
  }
}

export async function listLogs(db: Db, userId: string, trackerId: string, date: string) {
  if (!await ownsTracker(db, userId, trackerId)) return null;
  const rows = await db.select({ log: intakeLogs, notes: medicines.notes }).from(intakeLogs)
    .leftJoin(medicines, and(eq(medicines.id, intakeLogs.medicineId), readableMedicine(userId)))
    .where(and(logScope(userId, trackerId), eq(intakeLogs.logDate, date)))
    .orderBy(desc(intakeLogs.loggedAt), asc(intakeLogs.id));
  return rows.map(({ log, notes }) => logView(log, notes));
}

export function createLog(db: Db, userId: string, trackerId: string, input: CreateLog) {
  return db.transaction(async (tx) => {
    if (!await ownsTracker(tx, userId, trackerId)) return null;
    const common = { trackerId, userId, logDate: input.logDate, loggedAt: new Date().toISOString(),
      quantity: input.quantity, unit: input.unit, entryType: input.entryType };
    if (input.entryType === "food") {
      const [food] = await tx.select().from(foods).where(and(
        eq(foods.id, input.foodId), or(eq(foods.userId, userId), isNull(foods.userId)),
      )).limit(1);
      if (!food) return null;
      const computedNutrientsJson = checkedSnapshot(() => scaleFoodNutrients(
        { defaultUnit: food.defaultUnit, nutrientsPer100: food.nutrientsPer100Json }, input.quantity, input.unit,
      ));
      const [row] = await tx.insert(intakeLogs).values({
        ...common, foodId: food.id, displayName: food.name, computedNutrientsJson,
      }).returning();
      return logView(row, null);
    }
    const medicine = await findMedicine(tx, userId, input.medicineId);
    if (!medicine) return null;
    const computedNutrientsJson = medicine.category === "prescription" ? {} :
      checkedSnapshot(() => scaleSupplementNutrients(medicine.nutrientsPerDoseJson, input.quantity));
    const [row] = await tx.insert(intakeLogs).values({
      ...common, medicineId: medicine.id, displayName: medicine.brandName, computedNutrientsJson,
    }).returning();
    return logView(row, medicine.notes);
  });
}
