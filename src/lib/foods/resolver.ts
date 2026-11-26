import "server-only";
import { and, asc, desc, eq, isNull, max, or } from "drizzle-orm";
import type { Db } from "@/db";
import { foods, intakeLogs } from "@/db/schema";
import { normalizeFoodText, foodProfileSchema, type SavedFood } from "./schemas";

type FoodRow = typeof foods.$inferSelect;
const curatedVisibility = and(isNull(foods.userId), eq(foods.source, "curated"));
const visibleTo = (userId: string) => or(eq(foods.userId, userId), curatedVisibility);

function publicFood(row: FoodRow): SavedFood {
  return {
    ...foodProfileSchema.parse({
      name: row.name, aliases: row.aliasesJson, defaultUnit: row.defaultUnit,
      nutrientsPer100: row.nutrientsPer100Json,
    }),
    id: row.id, source: row.source, estimated: row.source === "ai_confirmed",
  };
}

function visibleFoods(db: Db, userId: string) {
  return db.select().from(foods).where(visibleTo(userId)).orderBy(desc(foods.createdAt), asc(foods.id));
}

function matchScore(row: FoodRow, query: string) {
  let score = 0;
  for (const text of [row.name, ...row.aliasesJson]) {
    const normalized = normalizeFoodText(text);
    if (normalized === query) return 3;
    if (normalized.startsWith(query)) score = Math.max(score, 2);
    else if (normalized.includes(query)) score = Math.max(score, 1);
  }
  return score;
}

export async function searchFoods(db: Db, userId: string, input: string): Promise<SavedFood[]> {
  const query = normalizeFoodText(input);
  const rows = await visibleFoods(db, userId);
  const lastUsed = await db.select({ id: foods.id, timestamp: max(intakeLogs.loggedAt) })
    .from(intakeLogs).innerJoin(foods, eq(intakeLogs.foodId, foods.id))
    .where(and(eq(intakeLogs.userId, userId), eq(intakeLogs.entryType, "food"), visibleTo(userId)))
    .groupBy(foods.id);
  const timestamps = new Map(lastUsed.map(({ id, timestamp }) => [id, timestamp ?? ""]));
  const ranked = rows.map((row) => ({
    row, score: query ? matchScore(row, query) : 0,
    owned: Number(row.userId === userId), recent: timestamps.get(row.id) ?? "",
  }));
  return ranked.filter(({ score, owned, recent }) => query ? score > 0 : owned > 0 || recent !== "")
    .sort((a, b) => query
      ? b.score - a.score || b.owned - a.owned || b.recent.localeCompare(a.recent)
      : b.recent.localeCompare(a.recent) || b.owned - a.owned)
    .slice(0, 20).map(({ row }) => publicFood(row));
}
