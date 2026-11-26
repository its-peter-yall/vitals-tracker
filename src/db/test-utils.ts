import "server-only";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { createDb } from "./index";
import * as schema from "./schema";

let migration: Promise<string[]> | undefined;

async function generateMigration() {
  const empty = await generateSQLiteDrizzleJson({});
  return generateSQLiteMigration(empty, await generateSQLiteDrizzleJson(schema, empty.id));
}

export async function createTestDb() {
  const result = await createDb(":memory:");
  try {
    for (const sql of await (migration ??= generateMigration())) {
      await result.client.execute(sql);
    }
    return result;
  } catch (error) {
    result.client.close();
    throw error;
  }
}
