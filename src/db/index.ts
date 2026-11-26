import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readEnv } from "@/lib/env";
import * as schema from "./schema";

export async function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  try {
    if (url === ":memory:" || url.startsWith("file:")) await client.execute("PRAGMA foreign_keys = ON");
    return { client, db: drizzle(client, { schema }) };
  } catch (error) {
    client.close();
    throw error;
  }
}

export type Db = Awaited<ReturnType<typeof createDb>>["db"];
let runtimeDb: Promise<Db> | undefined;

export async function getDb(): Promise<Db> {
  if (!runtimeDb) {
    const { DATABASE_URL, DATABASE_AUTH_TOKEN } = readEnv();
    runtimeDb = createDb(DATABASE_URL, DATABASE_AUTH_TOKEN).then(({ db }) => db).catch((error: unknown) => {
      runtimeDb = undefined;
      throw error;
    });
  }
  return runtimeDb;
}
