import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, getDb } from "@/db";
import * as schema from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { SESSION_COOKIE } from "@/lib/auth/session";

vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDb: vi.fn(),
}));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) cookieJar.delete(name);
      else cookieJar.set(name, value);
    },
  }),
}));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Task 1: unified idempotent seed runner (SQLite + Turso + Node 24 CLI)", () => {
  it("seeds 129 curated foods and 6 curated medicines idempotently without touching user rows", async () => {
    const { seedDatabase } = await import("@/db/seed");
    const { db, client } = await createTestDb();
    try {
      const [user] = await db.insert(schema.users).values({
        email: "owner@example.test",
        name: "Owner",
        passwordHash: "fixture",
        createdAt: "2026-11-26T00:00:00.000Z",
      }).returning();
      await db.insert(schema.foods).values({
        userId: user.id,
        name: "Family Khichdi",
        aliasesJson: ["home khichdi"],
        defaultUnit: "g",
        nutrientsPer100Json: { protein: 4.5, sodium: 120 },
        source: "manual",
        createdAt: "2026-11-26T00:00:00.000Z",
      });
      await db.insert(schema.medicines).values({
        userId: user.id,
        brandName: "My Morning D3",
        genericName: "Cholecalciferol",
        category: "supplement",
        defaultDoseLabel: "1 softgel",
        nutrientsPerDoseJson: { vitaminD: 25 },
        notes: "After breakfast",
        scheduleHint: "Morning",
        source: "manual",
        createdAt: "2026-11-26T00:00:00.000Z",
      });

      const first = await seedDatabase(db);
      const second = await seedDatabase(db);

      expect(first).toEqual({ curatedFoods: 129, curatedMedicines: 6 });
      expect(second).toEqual({ curatedFoods: 129, curatedMedicines: 6 });

      const allFoods = await db.select().from(schema.foods);
      const allMeds = await db.select().from(schema.medicines);
      expect(allFoods).toHaveLength(130);
      expect(allMeds).toHaveLength(7);

      const curatedFoods = allFoods.filter((row) => row.userId === null && row.source === "curated");
      expect(curatedFoods).toHaveLength(129);
      for (const alias of ["roti", "dahi", "dal", "idli", "palak", "bhindi masala", "doodh"]) {
        expect(curatedFoods.some((row) => row.aliasesJson.includes(alias)), alias).toBe(true);
      }

      const curatedMeds = allMeds.filter((row) => row.userId === null && row.source === "curated");
      expect(curatedMeds.map((row) => row.brandName)).toEqual(
        expect.arrayContaining(["Vitamin D3 25 mcg", "Metformin", "Levothyroxine"]),
      );
      expect(allFoods.some((row) => row.userId === user.id && row.name === "Family Khichdi")).toBe(true);
      expect(allMeds.some((row) => row.userId === user.id && row.brandName === "My Morning D3")).toBe(true);
    } finally {
      client.close();
    }
  });

  it("validates Turso libsql:// credentials, forwards them to createDb, and always closes the client", async () => {
    const { seedFromEnv } = await import("@/db/seed");

    await expect(
      seedFromEnv({ DATABASE_URL: "libsql://vitals-prod-org.turso.io" }),
    ).rejects.toThrow("DATABASE_AUTH_TOKEN");

    const fixture = await createTestDb();
    const closeSpy = vi.spyOn(fixture.client, "close");
    const createDbSpy = vi.fn(async () => fixture);

    const result = await seedFromEnv(
      {
        DATABASE_URL: "libsql://vitals-prod-org.turso.io",
        DATABASE_AUTH_TOKEN: "turso-fixture-token",
      },
      { createDb: createDbSpy },
    );

    expect(createDbSpy).toHaveBeenCalledExactlyOnceWith(
      "libsql://vitals-prod-org.turso.io",
      "turso-fixture-token",
    );
    expect(result).toEqual({ curatedFoods: 129, curatedMedicines: 6 });
    expect(closeSpy).toHaveBeenCalledOnce();

    // Ensure client.close() still runs when seeding throws (e.g. unmigrated DB)
    const emptyConn = await createDb(":memory:");
    const emptyCloseSpy = vi.spyOn(emptyConn.client, "close");
    await expect(
      seedFromEnv(
        { DATABASE_URL: "file:local.db" },
        { createDb: async () => emptyConn },
      ),
    ).rejects.toThrow();
    expect(emptyCloseSpy).toHaveBeenCalledOnce();
  });

  it("executes src/db/seed.ts via real Node 24 CLI twice against a temp local SQLite file", async () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["db:seed"]).toBe(
      "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local src/db/seed.ts",
    );

    const dir = mkdtempSync(path.join(tmpdir(), "vt-seed-cli-"));
    const dbPath = path.join(dir, "local-seed.db");
    const dbUrl = pathToFileURL(dbPath).href;

    try {
      // Provision schema on the temporary SQLite file
      const setup = await createDb(dbUrl);
      try {
        const empty = await generateSQLiteDrizzleJson({});
        const statements = await generateSQLiteMigration(
          empty,
          await generateSQLiteDrizzleJson(schema, empty.id),
        );
        for (const statement of statements) {
          await setup.client.execute(statement);
        }
      } finally {
        setup.client.close();
      }

      const cliEnv: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: dbUrl,
        DATABASE_AUTH_TOKEN: "",
      };
      delete cliEnv.VITEST;

      const seedEntry = path.join(repoRoot, "src", "db", "seed.ts");
      for (const runNumber of [1, 2]) {
        const run = spawnSync(
          process.execPath,
          ["--conditions=react-server", seedEntry],
          { cwd: repoRoot, env: cliEnv, encoding: "utf8", timeout: 25_000 },
        );
        expect(run.error, `CLI run ${runNumber} spawn error`).toBeUndefined();
        expect(run.status, `CLI run ${runNumber} stderr: ${run.stderr}`).toBe(0);
        expect(run.stdout).toContain("Seeded 129 curated foods and 6 curated medicines.");
      }

      const verify = await createDb(dbUrl);
      try {
        const curatedFoods = await verify.db
          .select({ id: schema.foods.id })
          .from(schema.foods)
          .where(and(isNull(schema.foods.userId), eq(schema.foods.source, "curated")));
        const curatedMeds = await verify.db
          .select({ id: schema.medicines.id })
          .from(schema.medicines)
          .where(and(isNull(schema.medicines.userId), eq(schema.medicines.source, "curated")));
        expect(curatedFoods).toHaveLength(129);
        expect(curatedMeds).toHaveLength(6);
      } finally {
        verify.client.close();
      }
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Ignore transient Windows SQLite file handle release delay
      }
    }
  });
});
