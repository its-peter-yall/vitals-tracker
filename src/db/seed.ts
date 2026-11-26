import "server-only";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./index.ts";

export type SeedResult = {
  curatedFoods: number;
  curatedMedicines: number;
};

type DbConnection = {
  client: { close(): void };
  db: Db;
};

type SeedFromEnvDeps = {
  createDb?: (url: string, authToken?: string) => Promise<DbConnection>;
};

let resolverInstalled = false;

function isExistingFile(filePath: string): boolean {
  return statSync(filePath, { throwIfNoEntry: false })?.isFile() === true;
}

function resolveCandidateFile(basePath: string): string | null {
  for (const candidate of [basePath, `${basePath}.ts`, path.join(basePath, "index.ts")]) {
    if (isExistingFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Node 24 native TypeScript stripping handles `.ts`-extension relative imports
 * (such as `seed-foods.ts`), while Next.js/Vitest modules (`index.ts`,
 * `seed-medicines.ts`, `env.ts`) also use `@/*` aliases and extensionless
 * relative imports. Registering a lightweight synchronous resolve hook keeps
 * `npm run db:seed` working on Node 24/Windows without altering curated seeds
 * or application modules.
 */
export function installNodeTsResolver(): void {
  if (resolverInstalled || process.env.VITEST || typeof registerHooks !== "function") return;
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) {
        const resolved = resolveCandidateFile(path.join(srcRoot, specifier.slice(2)));
        if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
      }

      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        context.parentURL?.startsWith("file:")
      ) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL));
        const directTarget = path.resolve(parentDir, specifier);
        if (!isExistingFile(directTarget)) {
          const resolved = resolveCandidateFile(directTarget);
          if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
        }
      }

      return nextResolve(specifier, context);
    },
  });

  resolverInstalled = true;
}

export async function seedDatabase(db: Db): Promise<SeedResult> {
  installNodeTsResolver();
  const [{ seedFoods }, { seedMedicines }, { foods, medicines }] = await Promise.all([
    import("./seed-foods.ts"),
    import("./seed-medicines.ts"),
    import("./schema.ts"),
  ]);

  await seedFoods(db);
  await seedMedicines(db);

  const [curatedFoods, curatedMedicines] = await Promise.all([
    db.select({ id: foods.id }).from(foods).where(and(isNull(foods.userId), eq(foods.source, "curated"))),
    db.select({ id: medicines.id }).from(medicines).where(and(isNull(medicines.userId), eq(medicines.source, "curated"))),
  ]);

  return {
    curatedFoods: curatedFoods.length,
    curatedMedicines: curatedMedicines.length,
  };
}

export async function seedFromEnv(
  env: Record<string, string | undefined> = process.env,
  deps: SeedFromEnvDeps = {},
): Promise<SeedResult> {
  installNodeTsResolver();
  const { readEnv } = await import("../lib/env.ts");
  const { DATABASE_URL, DATABASE_AUTH_TOKEN } = readEnv(env);
  const openDb = deps.createDb ?? (await import("./index.ts")).createDb;

  const { client, db } = await openDb(DATABASE_URL, DATABASE_AUTH_TOKEN);
  try {
    return await seedDatabase(db);
  } finally {
    client.close();
  }
}

function isDirectCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const selfPath = path.resolve(fileURLToPath(import.meta.url));
  const invokedPath = path.resolve(entry);
  if (process.platform === "win32") {
    return selfPath.toLowerCase() === invokedPath.toLowerCase();
  }
  return selfPath === invokedPath;
}

async function runCli(): Promise<void> {
  try {
    const result = await seedFromEnv();
    console.log(
      `Seeded ${result.curatedFoods} curated foods and ${result.curatedMedicines} curated medicines.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected database seed error.";
    if (/no such table/i.test(message)) {
      console.error(
        'Database schema not found. Run "npm run db:push" (or "npm run db:generate" then "npm run db:migrate") before running "npm run db:seed".',
      );
    } else {
      console.error(`Seed failed: ${message}`);
    }
    process.exitCode = 1;
  }
}

if (isDirectCliEntry()) {
  void runCli();
}
