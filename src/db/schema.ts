import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type HealthFlag = "diabetes" | "hypertension";
export type NutrientAmounts = Record<string, number>;
const id = () => text("id").notNull().primaryKey().$defaultFn(randomUUID);
const createdAt = () => text("created_at").notNull();

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  theme: text("theme", { enum: ["system", "light", "dark"] }).notNull().default("system"),
  visionModel: text("vision_model"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_email_uidx").on(t.email),
  check("users_theme_chk", sql`${t.theme} IN ('system', 'light', 'dark')`),
]);

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("sessions_token_hash_uidx").on(t.tokenHash)]);

export const trackers = sqliteTable("trackers", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  healthFlagsJson: text("health_flags_json", { mode: "json" }).$type<HealthFlag[]>().notNull(),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull(),
});

export const trackerNutrients = sqliteTable("tracker_nutrients", {
  id: id(),
  trackerId: text("tracker_id").notNull().references(() => trackers.id, { onDelete: "cascade" }),
  nutrientKey: text("nutrient_key").notNull(),
  dailyTarget: real("daily_target").notNull(),
  isCustomTarget: integer("is_custom_target", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull(),
}, (t) => [uniqueIndex("tracker_nutrients_tracker_id_nutrient_key_uidx").on(t.trackerId, t.nutrientKey)]);

export const foods = sqliteTable("foods", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  aliasesJson: text("aliases_json", { mode: "json" }).$type<string[]>().notNull(),
  defaultUnit: text("default_unit", { enum: ["g", "ml"] }).notNull(),
  nutrientsPer100Json: text("nutrients_per_100_json", { mode: "json" }).$type<NutrientAmounts>().notNull(),
  source: text("source", { enum: ["curated", "open_api", "ai_confirmed", "manual"] }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("foods_unit_chk", sql`${t.defaultUnit} IN ('g', 'ml')`),
  check("foods_source_chk", sql`${t.source} IN ('curated', 'open_api', 'ai_confirmed', 'manual')`),
]);

export const medicines = sqliteTable("medicines", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull(),
  genericName: text("generic_name"),
  category: text("category", { enum: ["supplement", "prescription", "both"] }).notNull(),
  defaultDoseLabel: text("default_dose_label").notNull(),
  nutrientsPerDoseJson: text("nutrients_per_dose_json", { mode: "json" }).$type<NutrientAmounts>().notNull(),
  notes: text("notes"),
  scheduleHint: text("schedule_hint"),
  source: text("source", { enum: ["curated", "vision_confirmed", "ocr_confirmed", "manual"] }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("medicines_category_chk", sql`${t.category} IN ('supplement', 'prescription', 'both')`),
  check("medicines_source_chk", sql`${t.source} IN ('curated', 'vision_confirmed', 'ocr_confirmed', 'manual')`),
]);

export const intakeLogs = sqliteTable("intake_logs", {
  id: id(),
  trackerId: text("tracker_id").notNull().references(() => trackers.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  logDate: text("log_date").notNull(),
  loggedAt: text("logged_at").notNull(),
  entryType: text("entry_type", { enum: ["food", "medicine"] }).notNull(),
  foodId: text("food_id").references(() => foods.id, { onDelete: "set null" }),
  medicineId: text("medicine_id").references(() => medicines.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit", { enum: ["g", "ml", "dose"] }).notNull(),
  computedNutrientsJson: text("computed_nutrients_json", { mode: "json" }).$type<NutrientAmounts>().notNull(),
}, (t) => [
  index("intake_logs_tracker_date_idx").on(t.trackerId, t.logDate),
  index("intake_logs_user_date_idx").on(t.userId, t.logDate),
  check("intake_logs_kind_chk", sql`
    (${t.entryType} = 'food' AND ${t.unit} IN ('g', 'ml') AND ${t.medicineId} IS NULL)
    OR (${t.entryType} = 'medicine' AND ${t.unit} = 'dose' AND ${t.foodId} IS NULL)
  `),
]);
