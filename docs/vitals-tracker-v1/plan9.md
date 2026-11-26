# P9 — Unified Seed Runner, E2E Integration Tests, Setup Docs & Full Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire an idempotent Node 24/Windows-compatible `npm run db:seed` runner for local SQLite and Turso, add end-to-end integration tests across the complete user lifecycle, author setup/PWA/safety documentation in `README.md`, and pass the full project verification gate (`test`, `typecheck`, `lint`, `build`).

**Architecture:** `src/db/seed.ts` installs a lightweight Node 24 `node:module` `registerHooks` resolver (when running outside Vitest) before dynamically importing `src/db/index.ts`, `src/lib/env.ts`, `src/db/seed-foods.ts`, and `src/db/seed-medicines.ts`, so `npm run db:seed` works directly under `node --conditions=react-server` on Windows without modifying any P1–P5 files or curated profiles. `tests/e2e-flows.test.ts` runs in Vitest's Node environment against real migrated libSQL databases (`:memory:` and a temporary SQLite file for the real Node 24 CLI subprocess) and invokes the real P2/P4/P5/P6 App Router handlers with mocked external HTTP (`fetch`) and cookie store. `README.md` documents local SQLite, Turso, OpenRouter vision configuration, mobile PWA install steps, data attributions, and the medical-safety disclaimer.

**Tech Stack:** Node.js `>=24.15.0` (native TypeScript type stripping + `node:module` `registerHooks`), Next.js 16.4.6 App Router, TypeScript 7.0.2 (`tsc --noEmit`), Drizzle ORM 0.45.4 + `@libsql/client` 0.18.0 (SQLite / Turso), Zod 4.6.7, Vitest 5.1.2, ESLint 9.39.5. No new packages.

---

## Owned Files & Strict Boundaries

Do **not** modify any files outside these three paths. Do **not** alter `package.json`, `src/db/index.ts`, `src/db/schema.ts`, `src/db/seed-foods.ts`, `src/db/seed-medicines.ts`, `src/lib/*`, `src/app/*`, `src/components/*`, `postcss.config.mjs`, or `vitest.config.ts`.

| File | Responsibility |
| :--- | :--- |
| `src/db/seed.ts` | Node 24/Windows TS resolver hook + idempotent `seedDatabase(db)` and `seedFromEnv(env, deps)` combining `seedFoods` (129 foods) and `seedMedicines` (6 medicines) for local SQLite and Turso, plus direct CLI entrypoint for `npm run db:seed`. |
| `tests/e2e-flows.test.ts` | Seed idempotency + real Node 24 CLI + Turso env contract tests, full cross-plan E2E lifecycle integration tests (auth → settings → tracker wizard → food `g`/`ml` + AI confirm → medicine vision scan confirm for supplement & prescription → 1-tap repeat → Diabetes/High-BP cautions → quantity edit & Undo → `7d`/`30d` analytics → logout), and `README.md` completeness check. |
| `README.md` | Developer & caregiver setup guide covering Node `>=24.15`, local SQLite, Turso (`libsql://` + `DATABASE_AUTH_TOKEN`), OpenRouter API key & vision model config, optional USDA key & `NEXT_PUBLIC_APP_URL`, iOS/Android PWA installation, data attribution, verification commands, and the medical-safety disclaimer. |

**Execution Rules (Windows PowerShell 5.1):**
- Start P9 **only after** both P7 and P8 workers are complete and committed (P9's final verification gate validates the entire repo).
- Work from the repository root (`d:\Peter\Personal Stuffs\vitals-tracker`). Run commands on separate lines (avoid bash `&&` chaining in PowerShell 5.1). Stop on any nonzero exit unless the step explicitly expects RED.
- Stage only the exact files listed in each task using `git add --`. Never commit `.env.local`, `*.db`, `*.sqlite`, or `next-env.d.ts`.
- Never hit live OpenRouter, Open Food Facts, USDA, or Turso endpoints in tests; always stub `globalThis.fetch` and use `:memory:` or a temporary directory in `os.tmpdir()`.

---

## Upstream Contracts & Resolved Risks (Self-Contained Reference)

### 1. Node 24 / Windows Module Resolution for `npm run db:seed`
`package.json` (P1-owned, do not edit) already defines:
```json
"db:seed": "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local src/db/seed.ts"
```
Under Node 24 native TypeScript stripping on Windows:
- `src/db/schema.ts` and `src/db/seed-foods.ts` use `.ts`-extension relative imports (`./schema.ts`, `type` imports `../lib/nutrients/types.ts` and `./index.ts`) and load natively.
- `src/db/seed-medicines.ts` (`import { medicines } from "@/db/schema"`), `src/db/index.ts` (`import { readEnv } from "@/lib/env"` and `import * as schema from "./schema"`), and `src/lib/env.ts` (`import { ... } from "./openrouter/models"`) rely on bundler-style `@/*` aliases and extensionless relative imports.
- **Solution inside `src/db/seed.ts`:** Static imports in `src/db/seed.ts` are limited to `import "server-only"`, Node built-ins (`node:fs`, `node:module`, `node:path`, `node:url`), `drizzle-orm`, and `import type { Db } from "./index.ts"` (erased at runtime). Before any runtime dynamic `import(...)`, `installNodeTsResolver()` registers a synchronous `node:module` `registerHooks({ resolve })` hook (skipped when `process.env.VITEST` is truthy) that maps `@/*` → `<repo>/src/*` and resolves extensionless `./` / `../` specifiers to `.ts` or `/index.ts` using `statSync(candidate, { throwIfNoEntry: false })?.isFile() === true` (so directory paths like `@/db` resolve cleanly to `src/db/index.ts` without `ERR_UNSUPPORTED_DIR_IMPORT`).

### 2. Database & Seed Contracts (P1, P4, P5, P6)
- `readEnv(source)` (`src/lib/env.ts`):
  - `DATABASE_URL`: defaults to `"file:local.db"`; accepts `":memory:"`, `/^file:.+$/`, or `libsql://<host>`.
  - `DATABASE_AUTH_TOKEN`: optional trimmed string; **required** when `DATABASE_URL` starts with `"libsql://"`. Validation errors throw `Error("Invalid server environment: ...")` without echoing secret values.
  - `OPENROUTER_API_KEY`: optional trimmed string; `OPENROUTER_VISION_MODEL`: defaults to `"google/gemini-2.5-flash"`.
- `createDb(url, authToken?)` (`src/db/index.ts`): creates `@libsql/client` + Drizzle instance; runs `PRAGMA foreign_keys = ON` for `:memory:` and `file:` URLs; skips pragma for `libsql://` (Turso handles FKs remotely). Always close `client.close()` in a `finally` block.
- `createTestDb()` (`src/db/test-utils.ts`): generates SQLite DDL from live `src/db/schema.ts` (including P6's `tracker_nutrients.is_custom_target` column) in an isolated `:memory:` DB; caller owns `client.close()`.
- `seedFoods(db)` (`src/db/seed-foods.ts`): idempotently inserts **129** curated global rows (`userId: null`, `source: "curated"`): 105 USDA ARS SR28 staples + 24 regional recipes (`Whole-wheat chapati` alias `roti`, `Plain whole-milk yogurt` alias `dahi`, `Whole cow's milk (unfortified)` alias `doodh`, `Lentil dal tadka` alias `dal`, `Steamed rice idli` alias `idli`, `Raw spinach` alias `palak`, `Bhindi masala` alias `bhindi masala`, `Medjool dates`, `Cheddar cheese`, `White sandwich bread`, etc.).
- `seedMedicines(db)` (`src/db/seed-medicines.ts`): idempotently inserts **6** curated global rows (`userId: null`, `source: "curated"`): `Vitamin D3 25 mcg`, `Vitamin C 500 mg`, `Vitamin B12 1000 mcg`, `Magnesium 100 mg`, `Metformin`, `Levothyroxine`.
- **No committed Drizzle journal:** `drizzle/` contains only `drizzle/legacy/p6-target-provenance.sql` (for pre-P6 DB upgrades). Fresh local SQLite or Turso DBs provision tables via `npm run db:push` (or `npm run db:generate` then `npm run db:migrate`) before running `npm run db:seed`.

### 3. Cross-Plan API Contracts Verified in E2E Tests
- **Auth & Settings (P2):**
  - `POST /api/auth/signup` (`{ email, name, password }` — password 12–128 chars) → `201 { user }`, sets `vt_session` cookie (`HttpOnly`, `SameSite=Lax`, 90 days).
  - `GET /api/auth/me` → `200 { user }` or `401`.
  - `PATCH /api/settings` (`{ theme?, visionModel? }`) → `200 { settings, visionModels, defaultVisionModel }`.
  - `POST /api/auth/logout` (`{}`) → `200 { ok: true }`, clears `vt_session` (`maxAge: 0`).
- **Foods (P4):**
  - `GET /api/foods/search?q=...` → `200 { foods: SavedFood[] }` (local-only).
  - `POST /api/foods/resolve` (`{ query }`) → `200 { kind: "saved" | "curated", food }` or `200 { kind: "draft", draft }` (OpenRouter estimate JSON uses `{ name, defaultUnit, nutrients: [{ key, amount }] }` — no `unit` field; `draft.estimated === true`, `draft.label === "Estimated"`, never auto-saved).
  - `POST /api/foods` (`{ confirmed: true, source: "open_api" | "ai_confirmed" | "manual", name, aliases, defaultUnit, nutrientsPer100 }`) → `201 { food }` (`200` on same-user replay).
- **Medicines (P5):**
  - `POST /api/medicines/scan` (raw `image/jpeg | image/png | image/webp` body, ≤2 MB) → `200 { requiresConfirmation: true, source: "vision", code: "REVIEW", draft, confidence: { level, score }, message, actions }` (OpenRouter vision JSON uses `{ brandName, genericName, category, defaultDoseLabel, nutrients: [{ key, amount, unit }], notes, confidence }`; never auto-saves or auto-logs).
  - `POST /api/medicines` (`{ brandName, genericName?, category, defaultDoseLabel, nutrientsPerDose, notes?, scheduleHint?, source? }`) → `201 { medicine }`.
  - `GET /api/medicines` → `200 { medicines, curated }`.
- **Trackers, Logs, Summary & Analytics (P6 + P3):**
  - `POST /api/trackers` (`{ name, healthFlags?, nutrients: [{ nutrientKey, customDailyTarget? }] }`) → `201 { tracker }`. Omitting `customDailyTarget` sets `isCustomTarget: false` so P3's default condition thresholds (`totalSugars > 35 g`, `addedSugars > 25 g`, `sodium > 2000 mg`) apply even though catalog defaults are `35 g` / `50 g` / `2300 mg`.
  - `POST /api/trackers/[id]/logs`: food `{ entryType: "food", foodId, quantity, unit: "g" | "ml", logDate }` or medicine `{ entryType: "medicine", medicineId, quantity, unit: "dose", logDate }` → `201 { log }`.
  - `GET /api/trackers/[id]/logs?date=YYYY-MM-DD` → `200 { logs }` (includes `medicineNotes`).
  - `PATCH /api/trackers/[id]/logs/[logId]` (`{ quantity }`) → `200 { log }` (rescales immutable snapshot proportionally).
  - `DELETE /api/trackers/[id]/logs/[logId]` → `200 { ok: true }` (Undo; repeat returns `404`).
  - `GET /api/trackers/[id]/summary?date=YYYY-MM-DD` → `200 { date, progress, alerts }` (`progress` filtered to pinned nutrients; `alerts` evaluated on full daily totals, never containing `mg/dL` or `mmHg`).
  - `GET /api/trackers/[id]/analytics?range=7d|30d&endDate=YYYY-MM-DD` → `200 { analytics }`.

### 4. Known Non-Blocking Repo Warnings (Do Not Edit P1 Files)
- `postcss.config.mjs` emits 1 non-blocking ESLint warning (`import/no-anonymous-default-export`); `npm run lint` exits `0`.
- `vitest.config.ts` prints a Vite CJS-config notice on Node 24; `npm test` exits `0`.
- On Windows, removing a temporary SQLite directory right after `client.close()` can transiently raise `EPERM`; wrap temp-dir `rmSync` with `{ recursive: true, force: true, maxRetries: 5, retryDelay: 100 }` inside `try/catch`.

---

## Task 1: Unified Idempotent Seed Runner & Node 24/Windows Module Resolution

**Files:**
- Create: `src/db/seed.ts`
- Create: `tests/e2e-flows.test.ts`

- [ ] **Step 1: Write the failing seed tests** in `tests/e2e-flows.test.ts`

```ts
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

      const cliEnv = {
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
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/e2e-flows.test.ts -t "Task 1"
```

Expected: FAIL resolving `@/db/seed` and missing `src/db/seed.ts`.

- [ ] **Step 3: Implement `src/db/seed.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass (GREEN)**

```powershell
npx vitest run tests/e2e-flows.test.ts -t "Task 1"
```

Expected: PASS (3 tests), proving in-memory idempotency, Turso `libsql://` + token validation & cleanup, and real Node 24/Windows CLI resolution across repeated runs.

- [ ] **Step 5: Commit**

```powershell
git add -- src/db/seed.ts tests/e2e-flows.test.ts
git commit -m "feat(db): add unified idempotent seed runner with Node 24 resolver"
```

---

## Task 2: End-to-End Flow — Auth, Settings, Guided Tracker Creation & Food `g`/`ml` Logging

**Files:**
- Modify: `tests/e2e-flows.test.ts`

- [ ] **Step 1: Append the shared E2E API test helpers and the Auth → Guided Tracker Creation → Food `g`/`ml` Logging test** to `tests/e2e-flows.test.ts`

```ts
const BASE_URL = "https://vitals.example.test";
const JPEG_BYTES = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG_BYTES = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function jsonReq(urlPath: string, body: unknown, method = "POST") {
  return new Request(`${BASE_URL}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
}

function getReq(urlPath: string) {
  return new Request(`${BASE_URL}${urlPath}`, { method: "GET" });
}

function deleteReq(urlPath: string) {
  return new Request(`${BASE_URL}${urlPath}`, { method: "DELETE" });
}

function imageReq(urlPath: string, mime: "image/jpeg" | "image/png" | "image/webp", bytes: Uint8Array) {
  return new Request(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: new Uint8Array(bytes),
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function logParams(id: string, logId: string) {
  return { params: Promise.resolve({ id, logId }) };
}

async function signupAndSeed(
  fixture: Awaited<ReturnType<typeof createTestDb>>,
  email = "amma@example.test",
  name = "Amma",
  password = "calm-daily-care-2026",
) {
  const { seedDatabase } = await import("@/db/seed");
  const { POST: signup } = await import("@/app/api/auth/signup/route");
  await seedDatabase(fixture.db);
  const res = await signup(jsonReq("/api/auth/signup", { email, name, password }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    user: { id: string; email: string; name: string; theme: string; visionModel: string | null };
  };
  const sessionToken = cookieJar.get(SESSION_COOKIE);
  expect(sessionToken).toBeTruthy();
  return { user: body.user, token: sessionToken! };
}

describe("Task 2: E2E signup/session, guided tracker creation, and food g/ml logging", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

  beforeEach(async () => {
    cookieJar.clear();
    vi.setSystemTime(new Date("2026-11-26T08:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network fetch")));
    fixture = await createTestDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  afterEach(() => {
    cookieJar.clear();
    fixture?.client.close();
    fixture = undefined;
    vi.mocked(getDb).mockReset();
  });

  it("completes signup/session, settings update, guided tracker wizard, curated & AI-confirmed food g/ml logs, and tenant isolation", async () => {
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { GET: getSettings, PATCH: patchSettings } = await import("@/app/api/settings/route");
    const { POST: createTracker, GET: listTrackers } = await import("@/app/api/trackers/route");
    const { GET: getTracker } = await import("@/app/api/trackers/[id]/route");
    const { GET: searchFoods } = await import("@/app/api/foods/search/route");
    const { POST: resolveFood } = await import("@/app/api/foods/resolve/route");
    const { POST: saveFood } = await import("@/app/api/foods/route");
    const { POST: addLog } = await import("@/app/api/trackers/[id]/logs/route");
    const { GET: getSummary } = await import("@/app/api/trackers/[id]/summary/route");

    // 1. Signup + persistent session resolution + settings
    const amma = await signupAndSeed(fixture!);
    const meRes = await me();
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toEqual({ user: amma.user });

    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const settingsPatch = await patchSettings(
      jsonReq("/api/settings", { theme: "dark", visionModel: "openai/gpt-4o" }, "PATCH"),
    );
    expect(settingsPatch.status).toBe(200);
    const settingsPayload = await settingsPatch.json();
    expect(settingsPayload.settings).toEqual({ theme: "dark", visionModel: "openai/gpt-4o" });
    expect(JSON.stringify(settingsPayload)).not.toContain("test-openrouter-key");

    const settingsGet = await getSettings();
    expect(settingsGet.status).toBe(200);
    expect((await settingsGet.json()).settings).toEqual({ theme: "dark", visionModel: "openai/gpt-4o" });

    // 2. Guided tracker creation (Diabetes + High BP flags, selected subset of nutrients)
    const createRes = await createTracker(
      jsonReq("/api/trackers", {
        name: "Amma's Daily Care",
        healthFlags: ["diabetes", "hypertension"],
        nutrients: [
          { nutrientKey: "vitaminD" },
          { nutrientKey: "calcium" },
          { nutrientKey: "protein" },
          { nutrientKey: "totalSugars" },
          { nutrientKey: "sodium" },
        ],
      }),
    );
    expect(createRes.status).toBe(201);
    const { tracker } = (await createRes.json()) as {
      tracker: {
        id: string;
        name: string;
        healthFlags: string[];
        nutrients: Array<{ nutrientKey: string; dailyTarget: number; isCustomTarget: boolean }>;
      };
    };
    expect(tracker.name).toBe("Amma's Daily Care");
    expect(tracker.healthFlags).toEqual(["diabetes", "hypertension"]);
    expect(tracker.nutrients.map((n) => n.nutrientKey)).toEqual([
      "vitaminD",
      "calcium",
      "protein",
      "totalSugars",
      "sodium",
    ]);
    expect(tracker.nutrients.every((n) => n.isCustomTarget === false)).toBe(true);

    // 3. Curated local alias food search (doodh -> ml, roti -> g) without network
    const milkSearch = await searchFoods(getReq("/api/foods/search?q=doodh"));
    expect(milkSearch.status).toBe(200);
    const milkFoods = (await milkSearch.json()).foods as Array<{
      id: string;
      name: string;
      defaultUnit: "g" | "ml";
      nutrientsPer100: Record<string, number>;
    }>;
    const milk = milkFoods.find((item) => item.name === "Whole cow's milk (unfortified)");
    expect(milk?.defaultUnit).toBe("ml");

    const rotiSearch = await searchFoods(getReq("/api/foods/search?q=roti"));
    expect(rotiSearch.status).toBe(200);
    const roti = ((await rotiSearch.json()).foods as Array<{ id: string; name: string; defaultUnit: "g" | "ml" }>)
      .find((item) => item.name === "Whole-wheat chapati");
    expect(roti?.defaultUnit).toBe("g");

    // 4. Log food in ml, food in g, and cross-unit (g on an ml baseline using 1:1 fallback)
    const today = "2026-11-26";
    const milkLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: milk!.id,
        quantity: 200,
        unit: "ml",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(milkLogRes.status).toBe(201);
    const milkLog = (await milkLogRes.json()).log;
    expect(milkLog.computedNutrientsJson.calcium).toBeCloseTo(milk!.nutrientsPer100.calcium * 2, 6);

    const milkGramsRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: milk!.id,
        quantity: 50,
        unit: "g",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(milkGramsRes.status).toBe(201);
    expect((await milkGramsRes.json()).log.computedNutrientsJson.calcium).toBeCloseTo(
      milk!.nutrientsPer100.calcium * 0.5,
      6,
    );

    const rotiLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: roti!.id,
        quantity: 100,
        unit: "g",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(rotiLogRes.status).toBe(201);

    // 5. Unlisted food -> OpenRouter AI draft (labeled Estimated, NOT saved) -> explicit confirmation -> cached & logged
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const target = String(url);
      if (target.includes("openfoodfacts.org")) {
        return Response.json({ products: [] });
      }
      if (target.includes("openrouter.ai")) {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: "Homemade Mango Lassi",
                  defaultUnit: "ml",
                  nutrients: [
                    { key: "protein", amount: 2.4 },
                    { key: "calcium", amount: 85 },
                    { key: "totalSugars", amount: 11.5 },
                    { key: "addedSugars", amount: 4.0 },
                    { key: "sodium", amount: 35 },
                  ],
                }),
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolveRes = await resolveFood(
      jsonReq("/api/foods/resolve", { query: "Homemade mango lassi" }),
    );
    expect(resolveRes.status).toBe(200);
    const resolved = await resolveRes.json();
    expect(resolved).toMatchObject({
      kind: "draft",
      draft: {
        provider: "openrouter",
        label: "Estimated",
        estimated: true,
        name: "Homemade Mango Lassi",
        defaultUnit: "ml",
      },
    });
    // Resolve must NOT persist to DB before explicit user confirmation
    expect(
      await fixture!.db.select().from(schema.foods).where(eq(schema.foods.userId, amma.user.id)),
    ).toEqual([]);

    const confirmRes = await saveFood(
      jsonReq("/api/foods", {
        confirmed: true,
        source: "ai_confirmed",
        name: resolved.draft.name,
        aliases: resolved.draft.aliases,
        defaultUnit: resolved.draft.defaultUnit,
        nutrientsPer100: resolved.draft.nutrientsPer100,
      }),
    );
    expect(confirmRes.status).toBe(201);
    const { food: cachedLassi } = await confirmRes.json();
    expect(cachedLassi).toMatchObject({ source: "ai_confirmed", estimated: true });

    const lassiLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "food",
        foodId: cachedLassi.id,
        quantity: 200,
        unit: "ml",
        logDate: today,
      }),
      idParams(tracker.id),
    );
    expect(lassiLogRes.status).toBe(201);

    // 6. Summary displays ONLY selected 5 nutrients
    const summaryRes = await getSummary(
      getReq(`/api/trackers/${tracker.id}/summary?date=${today}`),
      idParams(tracker.id),
    );
    expect(summaryRes.status).toBe(200);
    const summary = await summaryRes.json();
    expect(summary.progress.map((p: { nutrientKey: string }) => p.nutrientKey)).toEqual([
      "vitaminD",
      "calcium",
      "protein",
      "totalSugars",
      "sodium",
    ]);
    expect(summary.alerts).toEqual([]);

    // 7. Strict tenant isolation: another signed-up user cannot see or read Amma's tracker
    const { POST: signup } = await import("@/app/api/auth/signup/route");
    const bobSignup = await signup(
      jsonReq("/api/auth/signup", {
        email: "other@example.test",
        name: "Other User",
        password: "another-safe-password",
      }),
    );
    expect(bobSignup.status).toBe(201);
    expect(await (await listTrackers()).json()).toEqual({ trackers: [] });
    expect((await getTracker(getReq(`/api/trackers/${tracker.id}`), idParams(tracker.id))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the Task 2 E2E test**

```powershell
npx vitest run tests/e2e-flows.test.ts -t "Task 2"
```

Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```powershell
git add -- tests/e2e-flows.test.ts
git commit -m "test(e2e): cover auth, guided tracker creation, and food g/ml logging"
```

---

## Task 3: End-to-End Flow — Medicine Photo Scan Confirmation (Supplement + Prescription), 1-Tap Repeat & Diabetes/High-BP Cautions

**Files:**
- Modify: `tests/e2e-flows.test.ts`

- [ ] **Step 1: Append the Medicine Photo Scan, 1-Tap Repeat & Condition Cautions E2E test** to `tests/e2e-flows.test.ts`

```ts
describe("Task 3: E2E medicine photo scan confirmation, 1-tap repeat, and Diabetes/High-BP cautions", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

  beforeEach(async () => {
    cookieJar.clear();
    vi.setSystemTime(new Date("2026-11-26T09:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network fetch")));
    fixture = await createTestDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  afterEach(() => {
    cookieJar.clear();
    fixture?.client.close();
    fixture = undefined;
    vi.mocked(getDb).mockReset();
  });

  it("scans and confirms supplement + prescription medicines, repeats via 1-tap My Medicines with zero AI calls, and triggers safe Diabetes & High-BP cautions", async () => {
    const { PATCH: patchSettings } = await import("@/app/api/settings/route");
    const { POST: createTracker } = await import("@/app/api/trackers/route");
    const { POST: scanMedicine } = await import("@/app/api/medicines/scan/route");
    const { GET: listMedicines, POST: saveMedicine } = await import("@/app/api/medicines/route");
    const { GET: searchFoods } = await import("@/app/api/foods/search/route");
    const { GET: listLogs, POST: addLog } = await import("@/app/api/trackers/[id]/logs/route");
    const { GET: getSummary } = await import("@/app/api/trackers/[id]/summary/route");

    const amma = await signupAndSeed(fixture!);
    vi.stubEnv("OPENROUTER_API_KEY", "test-vision-key");

    // Configure custom user vision model in Settings
    expect(
      (await patchSettings(jsonReq("/api/settings", { visionModel: "openai/gpt-4o" }, "PATCH"))).status,
    ).toBe(200);

    // Create Diabetes + High-BP tracker without pinning addedSugars so full-day hidden-nutrient alert evaluation is also proven
    const trackerRes = await createTracker(
      jsonReq("/api/trackers", {
        name: "Care Plan",
        healthFlags: ["diabetes", "hypertension"],
        nutrients: [
          { nutrientKey: "vitaminD" },
          { nutrientKey: "calcium" },
          { nutrientKey: "sodium" },
        ],
      }),
    );
    expect(trackerRes.status).toBe(201);
    const { tracker } = (await trackerRes.json()) as { tracker: { id: string } };

    // 1. Photo-scan a supplement via OpenRouter Vision (must NOT auto-save or auto-log)
    const visionFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  brandName: "CalciD3 Plus",
                  genericName: "Calcium + Cholecalciferol",
                  category: "supplement",
                  defaultDoseLabel: "1 tablet",
                  nutrients: [
                    { key: "vitaminD", amount: 25, unit: "mcg" },
                    { key: "calcium", amount: 500, unit: "mg" },
                  ],
                  notes: "Take after breakfast.",
                  confidence: 0.92,
                }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  brandName: "Metformin 500",
                  genericName: "Metformin hydrochloride",
                  category: "prescription",
                  defaultDoseLabel: "1 tablet",
                  nutrients: [],
                  notes: "Take with evening meal to reduce stomach upset.",
                  confidence: 0.88,
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", visionFetch);

    const suppScanRes = await scanMedicine(imageReq("/api/medicines/scan", "image/jpeg", JPEG_BYTES));
    expect(suppScanRes.status).toBe(200);
    const suppScan = await suppScanRes.json();
    expect(suppScan).toMatchObject({
      requiresConfirmation: true,
      source: "vision",
      code: "REVIEW",
      confidence: { level: "high", score: 0.92 },
      draft: {
        brandName: "CalciD3 Plus",
        category: "supplement",
        defaultDoseLabel: "1 tablet",
        nutrientsPerDose: { vitaminD: 25, calcium: 500 },
      },
    });
    // Verify Settings vision model override was sent to OpenRouter
    expect(JSON.parse(String(visionFetch.mock.calls[0][1]?.body)).model).toBe("openai/gpt-4o");
    // Zero DB writes before explicit confirmation
    expect(
      await fixture!.db.select().from(schema.medicines).where(eq(schema.medicines.userId, amma.user.id)),
    ).toEqual([]);
    expect(await fixture!.db.select().from(schema.intakeLogs)).toEqual([]);

    // Confirm & save supplement to My Medicines, then log 1 dose on 2026-11-26
    const suppSaveRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: suppScan.draft.brandName,
        genericName: suppScan.draft.genericName,
        category: suppScan.draft.category,
        defaultDoseLabel: suppScan.draft.defaultDoseLabel,
        nutrientsPerDose: suppScan.draft.nutrientsPerDose,
        notes: suppScan.draft.notes,
        source: "vision_confirmed",
      }),
    );
    expect(suppSaveRes.status).toBe(201);
    const { medicine: savedSupplement } = await suppSaveRes.json();

    const day1 = "2026-11-26";
    const suppLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "medicine",
        medicineId: savedSupplement.id,
        quantity: 1,
        unit: "dose",
        logDate: day1,
      }),
      idParams(tracker.id),
    );
    expect(suppLogRes.status).toBe(201);
    expect((await suppLogRes.json()).log.computedNutrientsJson).toEqual({ vitaminD: 25, calcium: 500 });

    // 2. Photo-scan and confirm a prescription medicine (0 nutrients + plain-language food notes)
    const rxScanRes = await scanMedicine(imageReq("/api/medicines/scan", "image/png", PNG_BYTES));
    expect(rxScanRes.status).toBe(200);
    const rxScan = await rxScanRes.json();
    expect(rxScan).toMatchObject({
      requiresConfirmation: true,
      code: "REVIEW",
      confidence: { level: "high", score: 0.88 },
      draft: {
        brandName: "Metformin 500",
        category: "prescription",
        nutrientsPerDose: {},
        notes: "Take with evening meal to reduce stomach upset.",
      },
    });

    const rxSaveRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: rxScan.draft.brandName,
        genericName: rxScan.draft.genericName,
        category: rxScan.draft.category,
        defaultDoseLabel: rxScan.draft.defaultDoseLabel,
        nutrientsPerDose: rxScan.draft.nutrientsPerDose,
        notes: rxScan.draft.notes,
        source: "vision_confirmed",
      }),
    );
    expect(rxSaveRes.status).toBe(201);
    const { medicine: savedPrescription } = await rxSaveRes.json();

    const rxLogRes = await addLog(
      jsonReq(`/api/trackers/${tracker.id}/logs`, {
        entryType: "medicine",
        medicineId: savedPrescription.id,
        quantity: 1,
        unit: "dose",
        logDate: day1,
      }),
      idParams(tracker.id),
    );
    expect(rxLogRes.status).toBe(201);
    expect((await rxLogRes.json()).log).toMatchObject({
      computedNutrientsJson: {},
      medicineNotes: "Take with evening meal to reduce stomach upset.",
    });

    // 3. 1-tap repeat medicine logging on next local date (2026-11-27) with ZERO external fetch calls
    const forbiddenFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("Should not call OpenRouter on repeat"));
    vi.stubGlobal("fetch", forbiddenFetch);

    const cabinetRes = await listMedicines();
    expect(cabinetRes.status).toBe(200);
    const cabinet = (await cabinetRes.json()) as {
      medicines: Array<{ id: string; brandName: string }>;
      curated: Array<{ id: string }>;
    };
    expect(cabinet.medicines.map((m) => m.brandName)).toEqual(
      expect.arrayContaining(["CalciD3 Plus", "Metformin 500"]),
    );
    expect(cabinet.curated).toHaveLength(6);

    const day2 = "2026-11-27";
    for (const medId of [savedSupplement.id, savedPrescription.id]) {
      const repeatRes = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "medicine",
          medicineId: medId,
          quantity: 1,
          unit: "dose",
          logDate: day2,
        }),
        idParams(tracker.id),
      );
      expect(repeatRes.status).toBe(201);
    }
    expect(forbiddenFetch).not.toHaveBeenCalled();

    const day2Logs = (await (await listLogs(getReq(`/api/trackers/${tracker.id}/logs?date=${day2}`), idParams(tracker.id))).json()).logs;
    expect(day2Logs).toHaveLength(2);
    expect(day2Logs.find((l: { medicineId: string }) => l.medicineId === savedPrescription.id)?.medicineNotes).toBe(
      "Take with evening meal to reduce stomach upset.",
    );

    // 4. Diabetes & High-BP condition caution evaluation on day1 using seeded curated foods
    // Medjool dates 60 g -> 39.882 g totalSugars (> 35 g diabetes threshold, even though totalSugars is NOT pinned)
    // Cheddar cheese 200 g (1306 mg sodium) + White sandwich bread 200 g (980 mg sodium) -> 2286 mg sodium (> 2000 mg hypertension threshold)
    const findFoodId = async (q: string, exactName: string) => {
      const res = await searchFoods(getReq(`/api/foods/search?q=${encodeURIComponent(q)}`));
      const rows = (await res.json()).foods as Array<{ id: string; name: string }>;
      const match = rows.find((row) => row.name === exactName);
      expect(match, exactName).toBeDefined();
      return match!.id;
    };

    const datesId = await findFoodId("dates", "Medjool dates");
    const cheddarId = await findFoodId("cheddar", "Cheddar cheese");
    const breadId = await findFoodId("white bread", "White sandwich bread");

    for (const [foodId, quantity] of [
      [datesId, 60],
      [cheddarId, 200],
      [breadId, 200],
    ] as const) {
      const res = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "food",
          foodId,
          quantity,
          unit: "g",
          logDate: day1,
        }),
        idParams(tracker.id),
      );
      expect(res.status).toBe(201);
    }

    const summaryRes = await getSummary(
      getReq(`/api/trackers/${tracker.id}/summary?date=${day1}`),
      idParams(tracker.id),
    );
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json()) as {
      progress: Array<{ nutrientKey: string; amount: number; hasAmount: boolean }>;
      alerts: Array<{
        healthFlag: "diabetes" | "hypertension";
        message: string;
        triggers: Array<{ nutrientKey: string; total: number; threshold: number; unit: string }>;
      }>;
    };

    // Supplement vitaminD + calcium are reflected in selected progress cards
    expect(summary.progress.find((p) => p.nutrientKey === "vitaminD")?.amount).toBeCloseTo(26.2, 4);
    expect(summary.progress.find((p) => p.nutrientKey === "calcium")?.amount).toBeGreaterThan(2000);
    expect(summary.progress.find((p) => p.nutrientKey === "sodium")?.amount).toBeCloseTo(2286.6, 4);

    // Both Diabetes and High-BP cautions fire with strict non-clinical directional copy
    expect(summary.alerts.map((a) => a.healthFlag)).toEqual(["diabetes", "hypertension"]);
    expect(summary.alerts[0].triggers[0]).toMatchObject({
      nutrientKey: "totalSugars",
      threshold: 35,
      unit: "g",
    });
    expect(summary.alerts[0].triggers[0].total).toBeGreaterThan(35);
    expect(summary.alerts[1].triggers[0]).toMatchObject({
      nutrientKey: "sodium",
      threshold: 2000,
      unit: "mg",
    });
    expect(summary.alerts[1].triggers[0].total).toBeGreaterThan(2000);
    for (const alert of summary.alerts) {
      expect(alert.message).not.toMatch(/mg\s*\/\s*dL|mm\s*Hg|\d/i);
    }
  });
});
```

- [ ] **Step 2: Run the Task 3 E2E test**

```powershell
npx vitest run tests/e2e-flows.test.ts -t "Task 3"
```

Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```powershell
git add -- tests/e2e-flows.test.ts
git commit -m "test(e2e): cover medicine photo scan, 1-tap repeat, and condition cautions"
```

---

## Task 4: End-to-End Flow — `7d`/`30d` Analytics, Quantity Edit, Undo & Logout

**Files:**
- Modify: `tests/e2e-flows.test.ts`

- [ ] **Step 1: Append the Analytics, Quantity Edit, Undo & Logout E2E test** to `tests/e2e-flows.test.ts`

```ts
describe("Task 4: E2E 7d/30d analytics, quantity edit, Undo deletion, and logout", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

  beforeEach(async () => {
    cookieJar.clear();
    vi.setSystemTime(new Date("2026-11-26T10:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network fetch")));
    fixture = await createTestDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  afterEach(() => {
    cookieJar.clear();
    fixture?.client.close();
    fixture = undefined;
    vi.mocked(getDb).mockReset();
  });

  it("handles quantity edits, Undo deletion clearing a caution, 7d vs 30d analytics rollups, and logout revocation", async () => {
    const { POST: createTracker, GET: listTrackers } = await import("@/app/api/trackers/route");
    const { GET: searchFoods } = await import("@/app/api/foods/search/route");
    const { POST: saveMedicine } = await import("@/app/api/medicines/route");
    const { GET: listLogs, POST: addLog } = await import("@/app/api/trackers/[id]/logs/route");
    const { PATCH: editLog, DELETE: deleteLog } = await import("@/app/api/trackers/[id]/logs/[logId]/route");
    const { GET: getSummary } = await import("@/app/api/trackers/[id]/summary/route");
    const { GET: getAnalytics } = await import("@/app/api/trackers/[id]/analytics/route");
    const { POST: logout } = await import("@/app/api/auth/logout/route");

    await signupAndSeed(fixture!);

    const trackerRes = await createTracker(
      jsonReq("/api/trackers", {
        name: "Analytics & Undo Care",
        healthFlags: ["hypertension"],
        nutrients: [
          { nutrientKey: "protein", customDailyTarget: 20 },
          { nutrientKey: "vitaminD" },
          { nutrientKey: "sodium" },
        ],
      }),
    );
    expect(trackerRes.status).toBe(201);
    const { tracker } = (await trackerRes.json()) as { tracker: { id: string } };

    const findFood = async (q: string, exactName: string) => {
      const res = await searchFoods(getReq(`/api/foods/search?q=${encodeURIComponent(q)}`));
      const rows = (await res.json()).foods as Array<{ id: string; name: string }>;
      const match = rows.find((row) => row.name === exactName);
      expect(match, exactName).toBeDefined();
      return match!.id;
    };

    const yogurtId = await findFood("dahi", "Plain whole-milk yogurt");
    const cheddarId = await findFood("cheddar", "Cheddar cheese");
    const breadId = await findFood("white bread", "White sandwich bread");

    const suppRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: "Daily D3",
        category: "supplement",
        defaultDoseLabel: "1 softgel",
        nutrientsPerDose: { vitaminD: 20 },
        source: "manual",
      }),
    );
    expect(suppRes.status).toBe(201);
    const { medicine: dailyD3 } = await suppRes.json();

    const rxRes = await saveMedicine(
      jsonReq("/api/medicines", {
        brandName: "Amlodipine",
        category: "prescription",
        defaultDoseLabel: "1 tablet",
        nutrientsPerDose: {},
        notes: "Take at the same time each morning.",
        source: "manual",
      }),
    );
    expect(rxRes.status).toBe(201);
    const { medicine: amlodipine } = await rxRes.json();

    const logFood = async (foodId: string, quantity: number, logDate: string) => {
      const res = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "food",
          foodId,
          quantity,
          unit: "g",
          logDate,
        }),
        idParams(tracker.id),
      );
      expect(res.status).toBe(201);
      return (await res.json()).log as {
        id: string;
        quantity: number;
        displayName: string;
        computedNutrientsJson: Record<string, number>;
      };
    };

    const logMed = async (medicineId: string, logDate: string) => {
      const res = await addLog(
        jsonReq(`/api/trackers/${tracker.id}/logs`, {
          entryType: "medicine",
          medicineId,
          quantity: 1,
          unit: "dose",
          logDate,
        }),
        idParams(tracker.id),
      );
      expect(res.status).toBe(201);
      return (await res.json()).log;
    };

    // Day inside 30d window ONLY (2026-11-05)
    await logFood(yogurtId, 200, "2026-11-05");
    await logMed(amlodipine.id, "2026-11-05");

    // Caution day inside 7d window (2026-11-25): 200 g cheddar (1306 mg) + 200 g bread (980 mg) = 2286 mg sodium
    await logFood(cheddarId, 200, "2026-11-25");
    await logFood(breadId, 200, "2026-11-25");
    await logMed(dailyD3.id, "2026-11-25");
    await logMed(amlodipine.id, "2026-11-25");

    // Today (2026-11-26): test quantity edit + Undo clearing an accidental high-sodium log
    const yogurtLog = await logFood(yogurtId, 100, "2026-11-26");
    expect(yogurtLog.computedNutrientsJson.protein).toBeCloseTo(3.47, 6);

    // Edit quantity 100 g -> 200 g and verify proportional immutable snapshot rescale
    const editRes = await editLog(
      jsonReq(`/api/trackers/${tracker.id}/logs/${yogurtLog.id}`, { quantity: 200 }, "PATCH"),
      logParams(tracker.id, yogurtLog.id),
    );
    expect(editRes.status).toBe(200);
    const editedLog = (await editRes.json()).log;
    expect(editedLog.quantity).toBe(200);
    expect(editedLog.computedNutrientsJson.protein).toBeCloseTo(6.94, 6);
    expect(editedLog.computedNutrientsJson.calcium).toBeCloseTo(242, 6);

    // Add accidental high-sodium food on 2026-11-26 -> triggers caution -> Undo deletes it and clears caution
    const accidentalCheddar = await logFood(cheddarId, 350, "2026-11-26");
    const preUndoSummary = await (
      await getSummary(getReq(`/api/trackers/${tracker.id}/summary?date=2026-11-26`), idParams(tracker.id))
    ).json();
    expect(preUndoSummary.alerts.map((a: { healthFlag: string }) => a.healthFlag)).toEqual(["hypertension"]);

    const undoRes = await deleteLog(
      deleteReq(`/api/trackers/${tracker.id}/logs/${accidentalCheddar.id}`),
      logParams(tracker.id, accidentalCheddar.id),
    );
    expect(undoRes.status).toBe(200);
    expect(await undoRes.json()).toEqual({ ok: true });

    // Repeating Undo returns 404
    const repeatUndo = await deleteLog(
      deleteReq(`/api/trackers/${tracker.id}/logs/${accidentalCheddar.id}`),
      logParams(tracker.id, accidentalCheddar.id),
    );
    expect(repeatUndo.status).toBe(404);

    const postUndoLogs = (
      await (await listLogs(getReq(`/api/trackers/${tracker.id}/logs?date=2026-11-26`), idParams(tracker.id))).json()
    ).logs;
    expect(postUndoLogs.map((l: { id: string }) => l.id)).toEqual([yogurtLog.id]);

    const postUndoSummary = await (
      await getSummary(getReq(`/api/trackers/${tracker.id}/summary?date=2026-11-26`), idParams(tracker.id))
    ).json();
    expect(postUndoSummary.alerts).toEqual([]);

    await logMed(dailyD3.id, "2026-11-26");

    // 7d analytics (2026-11-20 .. 2026-11-26)
    const weekRes = await getAnalytics(
      getReq(`/api/trackers/${tracker.id}/analytics?range=7d&endDate=2026-11-26`),
      idParams(tracker.id),
    );
    expect(weekRes.status).toBe(200);
    const { analytics: week } = await weekRes.json();
    expect(week).toMatchObject({
      range: "7d",
      startDate: "2026-11-20",
      endDate: "2026-11-26",
      activeDays: 2,
      cautionDays: ["2026-11-25"],
      cautionDayCount: 1,
    });
    expect(week.days).toHaveLength(7);
    expect(week.trends.map((t: { nutrientKey: string }) => t.nutrientKey)).toEqual([
      "protein",
      "vitaminD",
      "sodium",
    ]);
    expect(week.needsAttention).toEqual(
      expect.arrayContaining([
        { nutrientKey: "protein", reason: "lowCompletion" },
        { nutrientKey: "vitaminD", reason: "lowCompletion" },
        { nutrientKey: "sodium", reason: "upperExceeded" },
      ]),
    );
    expect(week.medicineAdherence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          medicineId: dailyD3.id,
          displayName: "Daily D3",
          loggedDays: 2,
          rangeDays: 7,
        }),
        expect.objectContaining({
          medicineId: amlodipine.id,
          displayName: "Amlodipine",
          loggedDays: 1,
          rangeDays: 7,
        }),
      ]),
    );

    // 30d analytics (2026-10-28 .. 2026-11-26) includes 2026-11-05
    const monthRes = await getAnalytics(
      getReq(`/api/trackers/${tracker.id}/analytics?range=30d&endDate=2026-11-26`),
      idParams(tracker.id),
    );
    expect(monthRes.status).toBe(200);
    const { analytics: month } = await monthRes.json();
    expect(month).toMatchObject({
      range: "30d",
      startDate: "2026-10-28",
      endDate: "2026-11-26",
      activeDays: 3,
      cautionDays: ["2026-11-25"],
      cautionDayCount: 1,
    });
    expect(month.days).toHaveLength(30);
    expect(month.medicineAdherence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          medicineId: amlodipine.id,
          loggedDays: 2,
          rangeDays: 30,
        }),
        expect.objectContaining({
          medicineId: dailyD3.id,
          loggedDays: 2,
          rangeDays: 30,
        }),
      ]),
    );

    // Logout revokes session and blocks subsequent tracker reads
    const logoutRes = await logout(jsonReq("/api/auth/logout", {}));
    expect(logoutRes.status).toBe(200);
    expect((await listTrackers()).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the entire E2E test file**

```powershell
npx vitest run tests/e2e-flows.test.ts
```

Expected: PASS (5 tests across Tasks 1–4).

- [ ] **Step 3: Commit**

```powershell
git add -- tests/e2e-flows.test.ts
git commit -m "test(e2e): cover 7d/30d analytics, quantity edits, and Undo"
```

---

## Task 5: Author `README.md` (Local SQLite, Turso, OpenRouter, PWA & Medical Safety)

**Files:**
- Create: `README.md`
- Modify: `tests/e2e-flows.test.ts`

- [ ] **Step 1: Append a failing README contract test** to `tests/e2e-flows.test.ts`

```ts
describe("Task 5: README setup, Turso, OpenRouter, PWA, and medical safety documentation", () => {
  it("documents local SQLite, Turso, OpenRouter vision config, PWA install steps, and medical disclaimer", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    for (const required of [
      "24.15",
      "file:local.db",
      "npm run db:push",
      "npm run db:seed",
      "libsql://",
      "DATABASE_AUTH_TOKEN",
      "OPENROUTER_API_KEY",
      "OPENROUTER_VISION_MODEL",
      "google/gemini-2.5-flash",
      "USDA_FDC_API_KEY",
      "NEXT_PUBLIC_APP_URL",
      "Add to Home Screen",
      "Open Food Facts",
      "not medical advice",
    ]) {
      expect(readme, `README missing: ${required}`).toContain(required);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/e2e-flows.test.ts -t "Task 5"
```

Expected: FAIL with `ENOENT` reading `README.md`.

- [ ] **Step 3: Create `README.md`**

````markdown
# Vitals & Nutrient Care Tracker

A calm, mobile-first Progressive Web App (PWA) for tracking daily vitamins, minerals, essential nutrients, and medicines—designed for older adults and family caregivers.

## Highlights

- **Guided Custom Trackers:** Create focused trackers (Vitamins, Minerals, Essential Nutrients) with optional Blood Sugar Watch (`diabetes`) and Blood Pressure Watch (`hypertension`) cautions.
- **Fast Food Logging (`g` / `ml`):** Search 129 curated everyday staples and regional home-cooked dishes (with common aliases such as *roti*, *dahi*, *dal*, *idli*, *doodh*, and *palak*), or look up unlisted dishes via Open Food Facts, optional USDA FoodData Central, and OpenRouter AI estimation (clearly labeled *Estimated*).
- **Medicine Photo Scan & 1-Tap "My Medicines":** Snap or upload a medicine strip/bottle for server-side OpenRouter Vision extraction (with an explicit local Tesseract.js OCR retry option). Every scan opens a **Confirm Card** before saving; confirmed medicines stay in **My Medicines** for 1-tap daily repeat logging without re-scanning.
- **Per-Tracker Analytics (`7d` / `30d`):** Dual-chromatic Light/Dark trend charts, **Needs Attention** vs. **On Track** summaries, caution-day indicators, and medicine consistency.
- **Accessible Dual-Chromatic PWA:** Light / Dark / System theme persistence, `18px+` body text, tabular numerals, `≥48px` touch targets, and forgiving 8-second Undo.

---

## Prerequisites

- **Node.js `>=24.15.0`** (required by `jsdom@31` and Node 24's native TypeScript seed runner)
- **npm `12+`**

Verify your runtime:

```powershell
node --version
npm --version
```

---

## Quick Start — Local SQLite Setup

1. **Install dependencies:**

   ```powershell
   npm install
   ```

2. **Create `.env.local` from `.env.example`:**

   ```powershell
   Copy-Item .env.example .env.local
   ```

   *(On macOS/Linux: `cp .env.example .env.local`)*

   By default, `.env.example` uses a local SQLite database file (gitignored):

   ```dotenv
   DATABASE_URL=file:local.db
   DATABASE_AUTH_TOKEN=
   OPENROUTER_API_KEY=
   OPENROUTER_VISION_MODEL=google/gemini-2.5-flash
   USDA_FDC_API_KEY=
   NEXT_PUBLIC_APP_URL=
   ```

3. **Create the database schema:**

   ```powershell
   npm run db:push
   ```

   *(For versioned SQL migrations instead of `db:push`, run `npm run db:generate` followed by `npm run db:migrate`.)*

4. **Seed the curated food and medicine catalogs (safe to run repeatedly):**

   ```powershell
   npm run db:seed
   ```

   This idempotently inserts **129 curated foods** and **6 starter medicine templates** without duplicating rows or modifying user-owned records.

5. **Start the development server:**

   ```powershell
   npm run dev
   ```

   Open `http://localhost:3000`, create an account at `/signup`, and build your first tracker at `/trackers/new`.

---

## Production Database — Turso (`libsql://`)

Vitals Tracker uses Drizzle ORM + `@libsql/client`, so the same codebase runs on local SQLite (`file:local.db`) and hosted [Turso](https://turso.tech/) (`libsql://`).

1. Create a Turso database and auth token using the Turso CLI or dashboard.
2. Set these server-only environment variables in `.env.local` (or your hosting platform's secret manager):

   ```dotenv
   DATABASE_URL=libsql://your-db-your-org.turso.io
   DATABASE_AUTH_TOKEN=your-turso-auth-token
   ```

   > `DATABASE_AUTH_TOKEN` is required whenever `DATABASE_URL` starts with `libsql://` and must never be prefixed with `NEXT_PUBLIC_`.

3. Push or migrate the schema and run the idempotent seed against Turso:

   ```powershell
   npm run db:push
   npm run db:seed
   ```

   > **Upgrading an older pre-P6 database?** If an existing database predates the `tracker_nutrients.is_custom_target` column, inspect `PRAGMA table_info(tracker_nutrients)` and apply `drizzle/legacy/p6-target-provenance.sql` once after backing up your database. Fresh schemas created from `src/db/schema.ts` already include this column.

---

## OpenRouter API Key, Vision Models & Optional Food APIs

All AI and external food requests execute strictly on the server (Node.js runtime). Credentials are never bundled into client JavaScript.

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes (defaults to `file:local.db`) | Local SQLite (`file:...`) or Turso (`libsql://...`) connection URL. |
| `DATABASE_AUTH_TOKEN` | Turso only | Auth token required when `DATABASE_URL` uses `libsql://`. |
| `OPENROUTER_API_KEY` | Optional (needed for Vision scan & AI food estimate) | Server-only [OpenRouter](https://openrouter.ai/) API key. Without it, local food search, Open Food Facts, manual entry, and local OCR fallback still work. |
| `OPENROUTER_VISION_MODEL` | Optional (defaults to `google/gemini-2.5-flash`) | Default vision/OCR model used for medicine photo scanning. |
| `USDA_FDC_API_KEY` | Optional | [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide) API key. Skipped automatically when unset. |
| `NEXT_PUBLIC_APP_URL` | Optional (recommended in production) | Your deployment origin (e.g., `https://vitals.example.com`), sent as OpenRouter's `HTTP-Referer` and Open Food Facts' `User-Agent` contact URL. |

### Selecting a Vision Model

- The default server model is `google/gemini-2.5-flash`.
- Built-in Settings presets include `google/gemini-2.5-flash`, `google/gemini-3-flash-preview`, `anthropic/claude-sonnet-5`, `anthropic/claude-sonnet-5.5`, `anthropic/claude-haiku-5.5`, `openai/gpt-4o`, `openai/gpt-4.1-mini`, and `qwen/qwen3-vl-235b-a22b-instruct`.
- Signed-in users can also pick a preset or enter a custom OpenRouter model ID on `/settings` without exposing the server API key.
- **Zero local photo storage:** Uploaded medicine photos are compressed client-side, validated server-side (`image/jpeg`, `image/png`, `image/webp`; max `2 MB`), sent in memory to OpenRouter (or explicit local Tesseract.js OCR when requested), and discarded immediately. Only user-confirmed structured medicine metadata is stored in the database.

---

## Installing as a Mobile PWA (Home Screen App)

Deploy over **HTTPS** (required by mobile browsers for PWA installation; `http://localhost` works for local testing).

### iPhone / iPad (Safari, iOS 16.4+)
1. Open the deployed app URL in **Safari** and sign in.
2. Tap the **Share** button (square with upward arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name (**Vitals Tracker**) and tap **Add**.

### Android (Chrome / Edge)
1. Open the deployed app URL in **Chrome** or **Edge** and sign in.
2. Tap the browser menu (`⋮`) and choose **Install app** or **Add to Home screen**.
3. Confirm **Install** to place the full-screen icon on your home screen.

> **Caching scope:** The service worker (`public/sw.js`) caches static app shell icons and `/_next/static/*` assets only. All `/api/*` requests and HTML navigations remain network-live so authentication sessions and daily logs stay fresh, and medicine photos are never cached.

---

## Data Sources & Attribution

- **Curated local staples:** Derived from [USDA ARS Standard Reference Release 28 (SR28)](https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/dnload/sr28abbr.zip) (public domain), plus app reference recipes for everyday regional home-cooked dishes (approximate references—household recipes vary).
- **Open Food Facts:** Used on deliberate online food lookup via [Open Food Facts](https://world.openfoodfacts.org/). Open Food Facts data is licensed under the Open Database License (ODbL); set `NEXT_PUBLIC_APP_URL` to a real contact URL and review Open Food Facts API usage terms before public distribution.
- **USDA FoodData Central:** Optional fallback when `USDA_FDC_API_KEY` is configured.

---

## Available Scripts & Verification

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Create production Next.js PWA build |
| `npm run start` | Serve production build |
| `npm test` | Run all Vitest unit, UI, and in-memory/CLI integration tests |
| `npm run typecheck` | Run `next typegen && tsc --noEmit` |
| `npm run lint` | Run ESLint across the repository |
| `npm run db:push` | Push Drizzle schema directly to `DATABASE_URL` |
| `npm run db:generate` | Generate Drizzle SQL migrations into `drizzle/` |
| `npm run db:migrate` | Apply generated Drizzle migrations to `DATABASE_URL` |
| `npm run db:seed` | Run idempotent food + medicine seed runner |

---

## Medical Safety Disclaimer

**Vitals & Nutrient Care Tracker is a daily awareness and logging companion. It is not medical advice and does not replace your doctor, pharmacist, blood sugar meter (glucometer), or blood pressure monitor.**

- Condition cautions (such as Blood Sugar Watch and Blood Pressure Watch) are simple nutritional threshold reminders based strictly on logged intake totals. The app **never** diagnoses conditions, recommends medication changes, or predicts/displays simulated clinical readings (`mg/dL` or `mmHg`).
- Always verify scanned medicine/supplement labels and AI-estimated food values against the physical package before tapping **Confirm**, and consult a qualified healthcare professional for medical decisions.
````

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/e2e-flows.test.ts
```

Expected: PASS (all 6 tests in `tests/e2e-flows.test.ts`).

- [ ] **Step 5: Commit**

```powershell
git add -- README.md tests/e2e-flows.test.ts
git commit -m "docs: add setup, Turso, OpenRouter, PWA, and safety README"
```

---

## Task 6: Final Full-Project Verification Gate

**Files:** None (verification only; do not modify files unless a P9-owned file fails a check).

- [ ] **Step 1: Run the complete automated test suite**

```powershell
npm test
```

Expected: Exit code `0`; all test files (`tests/db-schema.test.ts`, `src/components/ui/foundation.test.tsx`, `tests/auth.test.ts`, `tests/nutrients.test.ts`, `tests/impact-engine.test.ts`, `tests/food-resolver.test.ts`, `tests/medicine-recognizer.test.ts`, `tests/medicines-api.test.ts`, `tests/trackers-api.test.ts`, `tests/analytics.test.ts`, `tests/tracker-ui.test.tsx`, `tests/analytics-ui.test.tsx`, `tests/e2e-flows.test.ts`) pass.

- [ ] **Step 2: Run strict TypeScript typecheck**

```powershell
npm run typecheck
```

Expected: Exit code `0` (`next typegen && tsc --noEmit` with zero errors).

- [ ] **Step 3: Run ESLint**

```powershell
npm run lint
```

Expected: Exit code `0` with zero errors (the pre-existing P1 `postcss.config.mjs` anonymous-default-export warning is non-blocking; do not modify `postcss.config.mjs`).

- [ ] **Step 4: Run production Next.js PWA build**

```powershell
npm run build
```

Expected: Exit code `0` with clean App Router route compilation and zero build errors.

- [ ] **Step 5: Confirm clean working tree and strict file ownership**

```powershell
git status --short
git log --oneline -n 6
```

Expected: Clean working tree (no untracked `local.db`, `.env.local`, or stray files), and P9 commits touch only `src/db/seed.ts`, `tests/e2e-flows.test.ts`, and `README.md`.
