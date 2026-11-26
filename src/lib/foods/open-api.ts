import "server-only";
import * as z from "zod";
import { readEnv } from "@/lib/env";
import type { NutrientMap } from "@/lib/nutrients/types";
import {
  foodProfileSchema, lookupAliases, normalizeFoodText, type OnlineDraft,
} from "./schemas";

const offBase = "https://world.openfoodfacts.org";
const offFields = "product_name,nutriments,product_quantity_unit,serving_quantity_unit,quantity";
const offProductSchema = z.object({
  product_name: z.string(),
  nutriments: z.record(z.string(), z.unknown()),
  product_quantity_unit: z.string().optional(),
  serving_quantity_unit: z.string().optional(),
  quantity: z.string().optional(),
});
const offSearchSchema = z.object({ products: z.array(z.unknown()) });
const offBarcodeSchema = z.object({ status: z.literal(1), product: z.unknown() });
const minute = 60_000;
const day = 86_400_000;
const memoLimit = 256;

function amount(value: unknown) {
  const parsed = z.number().nonnegative().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function match(query: string, name: string) {
  const terms = normalizeFoodText(query).split(" ");
  const normalizedName = normalizeFoodText(name);
  if (normalizedName === terms.join(" ")) return 2;
  const words = new Set(normalizedName.split(" "));
  return terms.every((term) => term && words.has(term)) ? 1 : 0;
}

async function fetchJson(url: URL, signal: AbortSignal, headers: HeadersInit = {}) {
  try {
    const response = await fetch(url, { signal, headers, cache: "no-store", redirect: "error" });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: response.status, retryAfter: response.headers.get("Retry-After"), body: undefined };
    }
    return { status: response.status, retryAfter: null, body: await response.json() as unknown };
  } catch {
    return { status: 0, retryAfter: null, body: undefined };
  }
}

function offCandidate(raw: unknown, query: string): OnlineDraft | null {
  const item = offProductSchema.safeParse(raw);
  if (!item.success) return null;
  const { product_name, nutriments, product_quantity_unit, serving_quantity_unit, quantity } = item.data;
  const result: NutrientMap = {};
  for (const [key, field] of [
    ["protein", "proteins_100g"], ["carbohydrates", "carbohydrates_100g"],
    ["fiber", "fiber_100g"], ["totalSugars", "sugars_100g"],
  ] as const) {
    const value = amount(nutriments[field]);
    if (value !== undefined) result[key] = value;
  }
  const sodium = amount(nutriments.sodium_100g);
  const salt = amount(nutriments.salt_100g);
  if (sodium !== undefined || salt !== undefined) {
    result.sodium = sodium !== undefined ? sodium * 1000 : salt! * 400;
  }
  const unit = product_quantity_unit || serving_quantity_unit;
  const liquid = unit ? /^(ml|cl|dl|l)$/i.test(unit.trim()) : /\d\s*(ml|cl|dl|l)\b/i.test(quantity ?? "");
  const nutrientsPer100 = Object.fromEntries(Object.entries(result).map(([key, value]) =>
    [key, Number(value.toFixed(4))]));
  const parsed = foodProfileSchema.safeParse({
    name: product_name, aliases: lookupAliases(query, product_name), defaultUnit: liquid ? "ml" : "g",
    nutrientsPer100,
  });
  return parsed.success ? {
    ...parsed.data, provider: "open_food_facts", label: "Open Food Facts", estimated: false,
  } : null;
}

export function createOpenFoodFactsLookup(now = () => Date.now()) {
  const windows = { search: [] as number[], barcode: [] as number[] };
  const limits = { search: 10, barcode: 15 };
  const memo = new Map<string, { draft: OnlineDraft; expires: number }>();

  function take(kind: keyof typeof windows) {
    const start = now();
    const active = windows[kind].filter((stamp) => stamp > start - minute);
    windows[kind] = active;
    if (active.length >= limits[kind]) return false;
    active.push(start);
    return true;
  }

  return async function lookupOpenFoodFacts(userId: string, query: string): Promise<OnlineDraft | null> {
    const key = JSON.stringify([userId, normalizeFoodText(query)]);
    const previous = memo.get(key);
    if (previous && previous.expires > now()) return previous.draft;
    memo.delete(key);

    const barcode = /^(?:\d{8}|\d{12,14})$/.test(query);
    const kind = barcode ? "barcode" : "search";
    const url = new URL(barcode ? `/api/v2/product/${query}` : "/cgi/search.pl", offBase);
    url.searchParams.set("fields", offFields);
    if (!barcode) {
      for (const [name, value] of Object.entries({
        search_terms: query, search_simple: "1", action: "process", json: "1", page_size: "8",
      })) url.searchParams.set(name, value);
    }
    const appUrl = readEnv().NEXT_PUBLIC_APP_URL;
    const headers = { "User-Agent": `VitalsTracker/1.0${appUrl ? ` (${new URL(appUrl).origin})` : ""}` };
    const signal = AbortSignal.timeout(5_000);
    if (!take(kind)) return null;
    let response = await fetchJson(url, signal, headers);
    if (response.status === 503 && (response.retryAfter === null || response.retryAfter === "0") &&
        !signal.aborted && take(kind)) response = await fetchJson(url, signal, headers);
    if (response.status !== 200) return null;

    let draft: OnlineDraft | null = null;
    if (barcode) {
      const parsed = offBarcodeSchema.safeParse(response.body);
      draft = parsed.success ? offCandidate(parsed.data.product, query) : null;
    } else {
      const parsed = offSearchSchema.safeParse(response.body);
      const candidates = (parsed.data?.products ?? []).slice(0, 8)
        .map((item) => offCandidate(item, query)).filter((item) => item !== null)
        .filter((item) => match(query, item.name) > 0)
        .sort((a, b) => match(query, b.name) - match(query, a.name));
      draft = candidates[0] ?? null;
    }
    if (draft) {
      // Concurrent requests for the same key replace only that entry.
      memo.delete(key);
      const oldest = memo.keys().next().value;
      if (memo.size >= memoLimit && oldest !== undefined) memo.delete(oldest);
      memo.set(key, { draft, expires: now() + day });
    }
    return draft;
  };
}

export const lookupOpenFoodFacts = createOpenFoodFactsLookup();

const fdcResponseSchema = z.object({ foods: z.array(z.unknown()) });
const fdcItemSchema = z.object({
  description: z.string(),
  dataType: z.enum(["Foundation", "SR Legacy"]),
  foodNutrients: z.array(z.unknown()),
});
const numberField = z.union([z.string(), z.number()]);
const fdcAmountSchema = z.object({
  nutrientId: z.number().int().optional(),
  nutrientNumber: numberField.optional(),
  number: numberField.optional(),
  unitName: z.string(),
  value: z.unknown().optional(),
  amount: z.unknown().optional(),
});
const fdcNutrients = [
  ["protein", 1003, "203", "G"], ["carbohydrates", 1005, "205", "G"],
  ["fiber", 1079, "291", "G"], ["totalSugars", 2000, "269", "G"],
  ["addedSugars", 1235, "539", "G"], ["water", 1051, "255", "G"],
  ["calcium", 1087, "301", "MG"], ["iron", 1089, "303", "MG"],
  ["magnesium", 1090, "304", "MG"], ["phosphorus", 1091, "305", "MG"],
  ["potassium", 1092, "306", "MG"], ["sodium", 1093, "307", "MG"],
  ["zinc", 1095, "309", "MG"], ["selenium", 1103, "317", "UG"],
  ["vitaminA", 1106, "320", "UG"], ["vitaminE", 1109, "323", "MG"],
  ["vitaminD", 1114, "328", "UG"], ["vitaminC", 1162, "401", "MG"],
  ["vitaminB1", 1165, "404", "MG"], ["vitaminB2", 1166, "405", "MG"],
  ["vitaminB6", 1175, "415", "MG"], ["vitaminB12", 1178, "418", "UG"],
  ["vitaminK", 1185, "430", "UG"], ["vitaminB9", 1190, "435", "UG"],
] as const;

function fdcCandidate(raw: unknown, query: string): OnlineDraft | null {
  const result = fdcItemSchema.safeParse(raw);
  if (!result.success) return null;
  const { description, foodNutrients } = result.data;
  if (!match(query, description)) return null;
  const nutrientsPer100: NutrientMap = {};
  for (const rawAmount of foodNutrients) {
    const parsed = fdcAmountSchema.safeParse(rawAmount);
    if (!parsed.success) continue;
    const row = parsed.data;
    const tuple = fdcNutrients.find(([, id, number]) => row.nutrientId !== undefined
      ? row.nutrientId === id : String(row.nutrientNumber ?? row.number) === number);
    if (!tuple) continue;
    const [key, , , unit] = tuple;
    const actualUnit = row.unitName.trim().toUpperCase().replace(/[µμΜ]/g, "U").replace(/^MCG$/, "UG");
    const value = amount(row.value ?? row.amount);
    if (actualUnit === unit && value !== undefined && nutrientsPer100[key] === undefined) {
      nutrientsPer100[key] = value;
    }
  }
  const profile = foodProfileSchema.safeParse({
    name: description, aliases: lookupAliases(query, description), defaultUnit: "g", nutrientsPer100,
  });
  return profile.success ? {
    ...profile.data, provider: "usda", label: "USDA FoodData Central", estimated: false,
  } : null;
}

export async function lookupUsdaFood(query: string): Promise<OnlineDraft | null> {
  const key = readEnv().USDA_FDC_API_KEY;
  if (!key) return null;
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  const { status, body } = await fetchJson(url, AbortSignal.timeout(5_000));
  if (status !== 200) return null;
  const parsed = fdcResponseSchema.safeParse(body);
  return (parsed.data?.foods ?? []).slice(0, 8).map((row) => fdcCandidate(row, query))
    .filter((row) => row !== null).sort((a, b) => match(query, b.name) - match(query, a.name))[0] ?? null;
}
