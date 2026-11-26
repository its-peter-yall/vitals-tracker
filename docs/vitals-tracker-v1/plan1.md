# P1 — Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable Next.js PWA foundation, a verified seven-table libSQL schema, a server-only OpenRouter client, and accessible Light/Dark/System UI primitives.

**Architecture:** Keep database and provider access behind lazy Node.js server modules, generate real SQLite DDL from the Drizzle schema for isolated tests, and expose reusable UI via an App Router shell and Tailwind v4 semantic tokens. Keep the installable start URL usable without creating or reserving P7's `src/app/page.tsx`.

**Tech Stack:** Node ≥24.15, npm 12, Next 16.4.6, React 19.3.1, TypeScript 7.0.2, Tailwind 4.3.5, Drizzle 0.45.4 + libSQL 0.18.0/Turso, Zod 4.6.7, Vitest 5.1.2, Testing Library.

---

## Ownership and execution notes

- `package.json`, `package-lock.json`: all workspace dependencies and scripts; no downstream edits required to install the approved matrix. `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`: Next, type checking, Tailwind, lint. `.gitignore` and `.env.example`: generated outputs and secret-safe setup.
- `vitest.config.ts`, `vitest.setup.ts`, `tests/db-schema.test.ts`: Node harness and P1 server/scaffold/PWA assertions. `src/components/ui/foundation.test.tsx`: colocated jsdom coverage for P1 UI. The boundary mock is for Vitest only.
- `src/lib/env.ts`: lazy Zod parsing; `src/lib/openrouter/models.ts`, `src/lib/openrouter/client.ts`: server-only model policy and transport. `drizzle.config.ts`, `src/db/schema.ts`, `src/db/index.ts`, `src/db/test-utils.ts`: CLI config, schema, runtime connection, ephemeral test migration.
- `src/app/layout.tsx`, `src/app/globals.css`, `src/components/theme-provider.tsx`, `src/components/ui/{theme-init.ts,button.tsx,card.tsx,undo-toast.tsx}`: theme shell, palette, preference, controls, notification. `public/manifest.json`, `public/sw.js`, `public/icons/{icon-192.png,icon-512.png,maskable-512.png,apple-touch-icon.png,foundation.html}`: install assets and a static fallback at `/`.
- Work from the checkout root in Windows PowerShell 5.1. Commands are separate lines; stop on a nonzero exit unless the step explicitly expects RED. Stage only the paths listed in each task and serialize commits. Do not run `create-next-app .`, write `src/app/page.tsx`, seed data, add routes/features owned by other plans, or commit secrets, `next-env.d.ts`, `.next/`, or SQLite files.
- Next APIs for downstream handoff: `await cookies()` and `await ctx.params`; only set/delete cookies in handlers/actions. Node runtime only; no `/web` libSQL imports. For SDK details see [research.md](research.md) §§3.1–3.5, 3.7–3.9. For conflicts, the state/explicit file ownership and pinned versions take precedence over research examples.
- No committed `drizzle/` output is in P1 ownership. `db:generate`, `db:migrate` and `db:push` are wired, but the P1 gate uses Drizzle Kit's real SQLite migration generator directly with no migration files or disk DB. A committed migration journal/history requires the orchestrator to assign ownership separately; do not create one in P1.

## Task 1: Manually bootstrap dependencies and tooling

**Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`, `tests/db-schema.test.ts`.

- [ ] **Bootstrap the runner.** Check `node --version` and `npm --version` (expected `v24.18.0`/`12.0.1` in this checkout). Write `package.json` exactly as follows, then run `npm install` to create `package-lock.json`, followed by `npm ls --depth=0`. Expect no missing or invalid peers. No overrides, additional packages, registry substitution, or `--legacy-peer-deps`; stop and report a registry/peer/native install problem.

```json
{
  "name": "vitals-tracker",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=24.15.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "db:generate": "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local ./node_modules/drizzle-kit/bin.cjs generate",
    "db:migrate": "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local ./node_modules/drizzle-kit/bin.cjs migrate",
    "db:push": "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local ./node_modules/drizzle-kit/bin.cjs push",
    "db:seed": "node --conditions=react-server --env-file-if-exists=.env --env-file-if-exists=.env.local src/db/seed.ts"
  },
  "dependencies": {
    "@libsql/client": "0.18.0",
    "drizzle-orm": "0.45.4",
    "lucide-react": "1.81.0",
    "next": "16.4.6",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "react-is": "19.3.1",
    "recharts": "3.11.1",
    "server-only": "0.0.1",
    "tesseract.js": "7.0.0",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.5",
    "@testing-library/dom": "10.4.2",
    "@testing-library/jest-dom": "8.0.0",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.13",
    "@types/node": "24.19.4",
    "@types/react": "19.3.3",
    "@types/react-dom": "19.3.0",
    "drizzle-kit": "0.31.11",
    "eslint": "9.39.5",
    "eslint-config-next": "16.4.6",
    "jsdom": "31.0.1",
    "postcss": "8.5.33",
    "tailwindcss": "4.3.5",
    "typescript": "7.0.2",
    "vite": "8.3.8",
    "vitest": "5.1.2"
  }
}
```

`db:seed` reserves only the script name; P1 does not create its entry point or run the script. The explicit `react-server` Node condition lets trusted CLI code load the guarded schema; normal app/client resolution is unchanged. No Drizzle RC, `@tursodatabase/*`, React Vite plugin, Tailwind v3 plugins, or PWA libraries.

- [ ] **Add the RED test** in `tests/db-schema.test.ts` (later tasks append in this owned file).

```ts
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("bootstraps Node-only Next and Tailwind with strict TypeScript", async () => {
  const { default: config } = await import("../next.config");
  expect(config.serverExternalPackages).toEqual(expect.arrayContaining([
    "@libsql/client", "libsql", "tesseract.js",
  ]));
  const readJson = (relativePath: string) =>
    JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
  expect(readJson("tsconfig.json").compilerOptions).toMatchObject({
    strict: true, paths: { "@/*": ["./src/*"] },
  });
  expect(readFileSync(new URL("../postcss.config.mjs", import.meta.url), "utf8"))
    .toContain("@tailwindcss/postcss");
});
```

- [ ] **Run RED:** `npx vitest run tests/db-schema.test.ts` → fails resolving `../next.config`, not an install error.
- [ ] **Implement configs.** `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "tesseract.js", "tesseract.js-core"],
};

export default nextConfig;
```

`tesseract.js-core` is also externalized per research §3.7's worker/WASM note; it remains transitive. Next 16.4.6 defaults to its CLI checker for TypeScript 7; do not disable build type checking.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`postcss.config.mjs`:

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
]);
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", setupFiles: ["./vitest.setup.ts"] },
});
```

`vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_AUTH_TOKEN", undefined);
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_VISION_MODEL", undefined);
  vi.stubEnv("USDA_FDC_API_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
```

Use `// @vitest-environment jsdom` on UI test files; Vitest 5 does not support the research example's `environmentMatchGlobs`. Each test starts with a safe memory URL and no external credentials; provider tests explicitly opt into fake env values and mock fetch.

`.gitignore`:

```gitignore
/node_modules/
/.next/
/out/
/coverage/
/next-env.d.ts
*.tsbuildinfo
.env*
!.env.example
*.db
*.db-*
*.sqlite
*.sqlite-*
*.sqlite3
*.sqlite3-*
*.log
```

- [ ] **Run GREEN:** `npx vitest run tests/db-schema.test.ts` → one passing test. Build/typegen begin once `src/app/layout.tsx` exists.
- [ ] **Commit:**

```powershell
git add -- package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs vitest.config.ts vitest.setup.ts .gitignore tests/db-schema.test.ts
git commit -m "chore: scaffold pinned Next tooling and test runner"
```

## Task 2: Define the lazy environment and model policy

**Files:** `.env.example`, `src/lib/env.ts`, `src/lib/openrouter/models.ts`, `tests/db-schema.test.ts`.

- [ ] **Add the RED test** to `tests/db-schema.test.ts`.

```ts
it("validates database configuration, optional keys, and vision model selection", async () => {
  const { readEnv } = await import("@/lib/env");
  const { VISION_MODELS, resolveVisionModel } = await import("@/lib/openrouter/models");
  expect(readEnv({})).toMatchObject({
    DATABASE_URL: "file:local.db", OPENROUTER_VISION_MODEL: "google/gemini-2.5-flash",
  });
  expect(readEnv({ DATABASE_URL: ":memory:", OPENROUTER_API_KEY: " " }).OPENROUTER_API_KEY)
    .toBeUndefined();
  expect(() => readEnv({ DATABASE_URL: "https://db.example", DATABASE_AUTH_TOKEN: "secret" }))
    .toThrow("DATABASE_URL");
  expect(() => readEnv({ DATABASE_URL: "libsql://db.example" })).toThrow("DATABASE_AUTH_TOKEN");
  expect(readEnv({ DATABASE_URL: "libsql://db.example", DATABASE_AUTH_TOKEN: "fixture" }))
    .toMatchObject({ DATABASE_AUTH_TOKEN: "fixture" });
  expect(VISION_MODELS).toContain("openai/gpt-4o");
  expect(resolveVisionModel("openai/gpt-4o", "google/gemini-2.5-flash")).toBe("openai/gpt-4o");
  expect(resolveVisionModel("custom/model:free", "google/gemini-2.5-flash")).toBe("custom/model:free");
  expect(resolveVisionModel(null, "google/gemini-2.5-flash")).toBe("google/gemini-2.5-flash");
  expect(() => resolveVisionModel("bad model", "google/gemini-2.5-flash")).toThrow("model");
});
```

- [ ] **Run RED:** `npx vitest run tests/db-schema.test.ts -t "validates database configuration"` → missing env/model module.
- [ ] **Implement** `src/lib/openrouter/models.ts`:

```ts
import "server-only";
import * as z from "zod";

export const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash";
export const VISION_MODELS = [
  DEFAULT_VISION_MODEL,
  "google/gemini-3-flash-preview",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
  "openai/gpt-4o",
  "openai/gpt-4.1-mini",
  "qwen/qwen3-vl-235b-a22b-instruct",
] as const;

export const modelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:/-]{0,127}$/i);

export function resolveVisionModel(userModel: string | null | undefined, defaultModel: string) {
  const result = modelIdSchema.safeParse(userModel ?? defaultModel);
  if (!result.success) throw new Error("Invalid OpenRouter model ID.");
  return result.data;
}
```

`src/lib/env.ts`:

```ts
import "server-only";
import * as z from "zod";
import { DEFAULT_VISION_MODEL, modelIdSchema } from "./openrouter/models";

const optionalText = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || undefined : value,
  z.string().min(1).optional(),
);
const envSchema = z.object({
  DATABASE_URL: z.string().refine((value) =>
    value === ":memory:" || /^file:.+$/.test(value) ||
    (value.startsWith("libsql://") && URL.canParse(value) && !!new URL(value).hostname),
  ).default("file:local.db"),
  DATABASE_AUTH_TOKEN: optionalText,
  OPENROUTER_API_KEY: optionalText,
  OPENROUTER_VISION_MODEL: modelIdSchema.default(DEFAULT_VISION_MODEL),
  USDA_FDC_API_KEY: optionalText,
  NEXT_PUBLIC_APP_URL: optionalText.refine((value) =>
    value === undefined || (/^https?:\/\//.test(value) && URL.canParse(value)),
  ),
}).superRefine((env, ctx) => {
  if (env.DATABASE_URL.startsWith("libsql://") && !env.DATABASE_AUTH_TOKEN) {
    ctx.addIssue({ code: "custom", path: ["DATABASE_AUTH_TOKEN"], message: "Required for Turso" });
  }
});

export function readEnv(source: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${keys.join(", ")}`);
  }
  return parsed.data;
}
```

`.env.example`:

```dotenv
# Local SQLite; for Turso use DATABASE_URL=libsql://your-db-your-org.turso.io
DATABASE_URL=file:local.db
# Required only for Turso. Save real values in ignored .env.local.
DATABASE_AUTH_TOKEN=
OPENROUTER_API_KEY=
OPENROUTER_VISION_MODEL=google/gemini-2.5-flash
USDA_FDC_API_KEY=
# Optional public origin, used as OpenRouter's HTTP-Referer.
NEXT_PUBLIC_APP_URL=
```

Settings may pass `VISION_MODELS` from a server boundary to client props and accept regex-valid custom IDs on the server. Never import these guarded modules into a client component. No configuration is read at import time; no raw env values in validation errors.

- [ ] **Run GREEN:** `npx vitest run tests/db-schema.test.ts` → both tests pass.
- [ ] **Commit:**

```powershell
git add -- .env.example src/lib/env.ts src/lib/openrouter/models.ts tests/db-schema.test.ts
git commit -m "feat: validate server environment and vision model selection"
```

## Task 3: Migrate and round-trip the seven-table schema in memory

**Files:** `drizzle.config.ts`, `src/db/schema.ts`, `src/db/index.ts`, `src/db/test-utils.ts`, `tests/db-schema.test.ts`.

- [ ] **Add the RED tests.** Add `import { eq } from "drizzle-orm";` to `tests/db-schema.test.ts`; append:

```ts
const iso = "2026-11-26T03:15:00.000Z";
const localDate = "2026-11-25";

async function dbFixture() {
  const schema = await import("@/db/schema");
  const { createTestDb } = await import("@/db/test-utils");
  const connection = await createTestDb();
  return { ...connection, ...schema };
}

it("migrates seven tables and round-trips typed JSON, timestamps and both local-date log kinds", async () => {
  const f = await dbFixture();
  try {
    const results = await f.client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(results.rows.map((row) => row.name)).toEqual([
      "foods", "intake_logs", "medicines", "sessions", "tracker_nutrients", "trackers", "users",
    ]);
    const [user] = await f.db.insert(f.users).values({
      email: "test@example.test", name: "Test", passwordHash: "fixture", createdAt: iso,
    }).returning();
    expect(user).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i), theme: "system", visionModel: null, createdAt: iso,
    });
    const [session] = await f.db.insert(f.sessions).values({
      userId: user.id, tokenHash: "session-hash", expiresAt: "2027-02-24T03:15:00.000Z", createdAt: iso,
    }).returning();
    expect(session).toMatchObject({ userId: user.id, tokenHash: "session-hash" });
    const [tracker] = await f.db.insert(f.trackers).values({
      userId: user.id, name: "Daily", healthFlagsJson: ["diabetes"], createdAt: iso, updatedAt: iso,
    }).returning();
    expect(tracker.healthFlagsJson).toEqual(["diabetes"]);
    const [nutrient] = await f.db.insert(f.trackerNutrients).values({
      trackerId: tracker.id, nutrientKey: "protein", dailyTarget: 52.5, sortOrder: 0,
    }).returning();
    expect(nutrient).toMatchObject({ dailyTarget: 52.5, sortOrder: 0 });
    const [food] = await f.db.insert(f.foods).values({
      name: "Milk", aliasesJson: ["Doodh"], defaultUnit: "ml",
      nutrientsPer100Json: { protein: 3.4, totalSugars: 5 }, source: "curated", createdAt: iso,
    }).returning();
    expect(food).toMatchObject({ userId: null, aliasesJson: ["Doodh"], nutrientsPer100Json: { protein: 3.4, totalSugars: 5 } });
    const [medicine] = await f.db.insert(f.medicines).values({
      userId: user.id, brandName: "Example", category: "supplement", defaultDoseLabel: "1 tablet",
      nutrientsPerDoseJson: { calcium: 100 }, source: "manual", createdAt: iso,
    }).returning();
    expect(medicine).toMatchObject({ genericName: null, scheduleHint: null, notes: null });
    const common = { trackerId: tracker.id, userId: user.id, logDate: localDate, loggedAt: iso };
    await f.db.insert(f.intakeLogs).values([
      { ...common, entryType: "food", foodId: food.id, displayName: "Milk", quantity: 50,
        unit: "ml", computedNutrientsJson: { protein: 1.7, totalSugars: 2.5 } },
      { ...common, entryType: "medicine", medicineId: medicine.id, displayName: "Example", quantity: 1,
        unit: "dose", computedNutrientsJson: { calcium: 100 } },
    ]);
    const logs = await f.db.select().from(f.intakeLogs).where(eq(f.intakeLogs.logDate, localDate));
    expect(logs).toHaveLength(2);
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ loggedAt: iso, logDate: localDate, foodId: food.id,
        computedNutrientsJson: { protein: 1.7, totalSugars: 2.5 } }),
      expect.objectContaining({ medicineId: medicine.id, unit: "dose", computedNutrientsJson: { calcium: 100 } }),
    ]));
    await f.db.delete(f.medicines).where(eq(f.medicines.id, medicine.id));
    expect(await f.db.select().from(f.intakeLogs).where(eq(f.intakeLogs.entryType, "medicine")))
      .toEqual([expect.objectContaining({ medicineId: null, displayName: "Example", computedNutrientsJson: { calcium: 100 } })]);
    await f.db.delete(f.users).where(eq(f.users.id, user.id));
    for (const table of [f.sessions, f.trackers, f.trackerNutrients, f.intakeLogs]) {
      expect(await f.db.select().from(table)).toEqual([]);
    }
    expect(await f.db.select().from(f.foods)).toHaveLength(1);
  } finally {
    f.client.close();
  }
});

it("enforces uniqueness, enums and foreign keys, has both date indexes, and isolates each client", async () => {
  const f = await dbFixture();
  try {
    const userInput = { email: "unique@example.test", name: "Test", passwordHash: "fixture", createdAt: iso };
    const [user] = await f.db.insert(f.users).values(userInput).returning();
    await expect(f.db.insert(f.users).values(userInput).run()).rejects.toThrow();
    await expect(f.client.execute({
      sql: "UPDATE users SET theme = ? WHERE id = ?", args: ["invalid", user.id],
    })).rejects.toThrow(/CHECK/i);
    const session = { userId: user.id, tokenHash: "unique", createdAt: iso, expiresAt: iso };
    await f.db.insert(f.sessions).values(session);
    await expect(f.db.insert(f.sessions).values(session).run()).rejects.toThrow();
    await expect(f.client.execute({
      sql: "UPDATE sessions SET user_id = ? WHERE token_hash = ?", args: ["missing", session.tokenHash],
    })).rejects.toThrow(/FOREIGN KEY/i);
    const [tracker] = await f.db.insert(f.trackers).values({
      userId: user.id, name: "Daily", healthFlagsJson: [], createdAt: iso, updatedAt: iso,
    }).returning();
    const nutrient = { trackerId: tracker.id, nutrientKey: "sodium", dailyTarget: 2000, sortOrder: 0 };
    await f.db.insert(f.trackerNutrients).values(nutrient);
    await expect(f.db.insert(f.trackerNutrients).values(nutrient).run()).rejects.toThrow();
    for (const [name, key] of [
      ["intake_logs_tracker_date_idx", "tracker_id"], ["intake_logs_user_date_idx", "user_id"],
    ]) {
      const result = await f.client.execute(`PRAGMA index_info('${name}')`);
      expect(result.rows.map((row) => row.name)).toEqual([key, "log_date"]);
    }
    const other = await dbFixture();
    try {
      expect(await other.db.select().from(other.users)).toEqual([]);
    } finally {
      other.client.close();
    }
  } finally {
    f.client.close();
  }
});
```

- [ ] **Run RED:** `npx vitest run tests/db-schema.test.ts -t "migrates seven|enforces uniqueness"` → missing schema/test harness; no connection to `.env.local` or SQLite files.
- [ ] **Implement the schema** in `src/db/schema.ts`. Use camelCase TypeScript keys and snake_case SQL columns. Timestamps and local dates are explicit caller inputs; JSON maps use strings until consumed by the nutrient catalog. Snapshots are independent of catalog changes; the schema intentionally does not add a trigger blocking the log-quantity edit contract. Row ownership checks belong in consumer queries, not in this harness.

```ts
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
```

Delete actions lock in source removal without touching historical log snapshots (`SET NULL`), deletion of a user with their tenant-owned catalog (`CASCADE`), and survival of global catalog items (`userId = NULL`). Validate JSON contents, positive quantities, timestamps/dates, and tenant relation consistency in the consuming modules; typed JSON does not make SQLite validate object contents.

- [ ] **Wire connections** in `src/db/index.ts`:

```ts
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
```

`src/db/test-utils.ts` (test-only; never import from a route):

```ts
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
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
```

The worker must not run `db:push`/`db:migrate` against the user's environment. `getDb()` and `createDb(url, authToken?)` are async (local FK setup completes before use); `createTestDb()` returns `{client, db}` after applying the migration, and each test owns `client.close()`. Cache only generated SQL, not connections. Tests never call the runtime singleton or touch a real file.

- [ ] **Run GREEN:** `npx vitest run tests/db-schema.test.ts` → all four tests pass. `node --conditions=react-server ./node_modules/drizzle-kit/bin.cjs generate --help` → command available without provisioning a database.
- [ ] **Commit:**

```powershell
git add -- drizzle.config.ts src/db/schema.ts src/db/index.ts src/db/test-utils.ts tests/db-schema.test.ts
git commit -m "feat: add Drizzle schema and isolated libSQL migrations"
```

## Task 4: Implement structured OpenRouter text and vision requests

**Files:** `src/lib/openrouter/client.ts`, `tests/db-schema.test.ts`.

- [ ] **Add the RED tests.** Add `import * as z from "zod";` to `tests/db-schema.test.ts`; append:

````ts
const completionInput = {
  prompt: "Read the label",
  schemaName: "label",
  jsonSchema: {
    type: "object", properties: { name: { type: "string" } },
    required: ["name"], additionalProperties: false,
  },
  output: z.object({ name: z.string() }),
};
const modelText = (content: string) => Response.json({ choices: [{ message: { content } }] });

it("posts a text-first data-URL vision completion and validates fenced JSON", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(modelText("```json\n{\"name\":\"Label\"}\n```"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  await expect(completeJson({
    ...completionInput, model: "openai/gpt-4o", system: "Extract only visible text.",
    image: { mime: "image/jpeg", bytes: Uint8Array.of(0xff, 0xd8, 0xff) },
  })).resolves.toEqual({ name: "Label" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(init).toMatchObject({
    method: "POST", headers: { Authorization: "Bearer fixture-key", "HTTP-Referer": "https://app.example.test" },
    signal: expect.any(AbortSignal),
  });
  expect(JSON.parse(String(init?.body))).toEqual({
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: "Extract only visible text." },
      { role: "user", content: [
        { type: "text", text: completionInput.prompt },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/", detail: "auto" } },
      ] },
    ],
    response_format: { type: "json_schema", json_schema: {
      name: "label", strict: true, schema: completionInput.jsonSchema,
    } },
    temperature: 0,
  });
});

it("falls back to JSON object once only for unsupported structured output", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ error: { message: "json_schema is not supported" } }, { status: 400 }))
    .mockResolvedValueOnce(modelText('{"name":123}'));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash");
  await expect(completeJson(completionInput)).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(body).toMatchObject({
    model: "google/gemini-2.5-flash", response_format: { type: "json_object" },
    messages: [{ role: "user", content: completionInput.prompt }],
  });
});

it("maps embedded, authentication and configuration errors without exposing provider details", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ choices: [{ error: { code: 503, message: "private detail" } }] }))
    .mockResolvedValueOnce(Response.json({ error: { message: "private key detail" } }, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  await expect(completeJson(completionInput)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  await expect(completeJson(completionInput)).rejects.toMatchObject({ code: "PROVIDER" });
  await expect(completeJson(completionInput)).rejects.toMatchObject({
    code: "AUTH", message: "AI access could not be verified.",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("honors a short Retry-After within the one-request retry budget", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": "0" } }))
    .mockResolvedValueOnce(modelText('{"name":"Recovered"}'));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  await expect(completeJson(completionInput)).resolves.toEqual({ name: "Recovered" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1]?.signal).toBe(fetchMock.mock.calls[1][1]?.signal);
});

it("aborts a pending OpenRouter request at 20 seconds", async () => {
  const { completeJson } = await import("@/lib/openrouter/client");
  vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
  const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);
  const result = expect(completeJson(completionInput)).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(19_999);
  const signal = fetchMock.mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal?.aborted).toBe(true);
  await result;
});
````

- [ ] **Run RED:** `npx vitest run tests/db-schema.test.ts -t "vision completion|unsupported structured output|configuration errors|Retry-After|pending OpenRouter"` → missing client module.
- [ ] **Implement** `src/lib/openrouter/client.ts` (contract details: [research.md](research.md) §3.5).

````ts
import "server-only";
import { Buffer } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import * as z from "zod";
import { readEnv } from "@/lib/env";
import { resolveVisionModel } from "./models";

const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const errors = {
  NOT_CONFIGURED: "AI is not set up. You can continue manually.",
  BAD_REQUEST: "AI could not read this request. Try again or continue manually.",
  AUTH: "AI access could not be verified.",
  PAYMENT: "AI credits are unavailable. You can continue manually.",
  FORBIDDEN: "AI could not process this request. You can continue manually.",
  TIMEOUT: "AI is taking too long. Try again or continue manually.",
  RATE_LIMIT: "AI is busy. Try again shortly or continue manually.",
  PROVIDER: "AI is temporarily unavailable. You can continue manually.",
  INVALID_OUTPUT: "AI did not return a usable result. Try again or continue manually.",
} as const;

export type OpenRouterErrorCode = keyof typeof errors;

export class OpenRouterError extends Error {
  constructor(public readonly code: OpenRouterErrorCode) {
    super(errors[code]);
    this.name = "OpenRouterError";
  }
}

export type CompleteJsonInput<T> = {
  model?: string | null;
  system?: string;
  prompt: string;
  image?: { mime: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array };
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  output: z.ZodType<T>;
};

const errorShape = z.object({ code: z.union([z.string(), z.number()]).optional(), message: z.string().optional() });
const envelope = z.object({
  error: errorShape.nullish(),
  choices: z.array(z.object({
    error: errorShape.nullish(),
    message: z.object({ content: z.string().nullish() }).nullish(),
  })).optional(),
});

function statusCode(status: number): OpenRouterErrorCode {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "AUTH";
    case 402: return "PAYMENT";
    case 403: return "FORBIDDEN";
    case 408:
    case 504: return "TIMEOUT";
    case 429: return "RATE_LIMIT";
    default: return "PROVIDER";
  }
}

function retryDelay(header: string | null) {
  if (!header?.trim()) return undefined;
  const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms <= 5_000 ? Math.max(ms, 0) : undefined;
}

export async function completeJson<T>(input: CompleteJsonInput<T>): Promise<T> {
  let env: ReturnType<typeof readEnv>;
  try { env = readEnv(); } catch { throw new OpenRouterError("NOT_CONFIGURED"); }
  if (!env.OPENROUTER_API_KEY) throw new OpenRouterError("NOT_CONFIGURED");
  let model: string;
  try { model = resolveVisionModel(input.model, env.OPENROUTER_VISION_MODEL); }
  catch { throw new OpenRouterError("BAD_REQUEST"); }
  const messages = [
    ...(input.system ? [{ role: "system", content: input.system }] : []),
    { role: "user", content: input.image ? [
      { type: "text", text: input.prompt },
      { type: "image_url", image_url: {
        url: `data:${input.image.mime};base64,${Buffer.from(input.image.bytes).toString("base64")}`,
        detail: "auto",
      } },
    ] : input.prompt },
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let format: "json_schema" | "json_object" = "json_schema";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Vitals Tracker",
          ...(env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": env.NEXT_PUBLIC_APP_URL } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
        body: JSON.stringify({
          model, messages, temperature: 0,
          response_format: format === "json_schema" ? {
            type: format, json_schema: { name: input.schemaName, strict: true, schema: input.jsonSchema },
          } : { type: format },
        }),
      });
      const parsed = envelope.safeParse(await response.json().catch(() => undefined));
      controller.signal.throwIfAborted();
      const choice = parsed.data?.choices?.[0];
      const replyError = parsed.data?.error ?? choice?.error;
      if (!response.ok || replyError) {
        const status = response.ok ? Number(replyError?.code) : response.status;
        const message = replyError?.message ?? "";
        if (attempt === 0 && [400, 422].includes(status) &&
            /json_schema|response_format|structured outputs?/i.test(message) &&
            /unsupported|not support/i.test(message)) {
          format = "json_object";
          continue;
        }
        const wait = attempt === 0 && [429, 503].includes(response.status)
          ? retryDelay(response.headers.get("Retry-After")) : undefined;
        if (wait !== undefined) {
          if (wait > 0) await delay(wait, undefined, { signal: controller.signal });
          continue;
        }
        throw new OpenRouterError(statusCode(status));
      }
      if (!choice?.message?.content) throw new OpenRouterError("INVALID_OUTPUT");
      const content = choice.message.content.trim()
        .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
      let raw: unknown;
      try { raw = JSON.parse(content); } catch { throw new OpenRouterError("INVALID_OUTPUT"); }
      const result = input.output.safeParse(raw);
      if (!result.success) throw new OpenRouterError("INVALID_OUTPUT");
      return result.data;
    }
    throw new OpenRouterError("PROVIDER");
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new OpenRouterError("TIMEOUT");
    }
    if (error instanceof OpenRouterError) throw error;
    throw new OpenRouterError("PROVIDER");
  } finally {
    clearTimeout(timer);
  }
}
````

The shared 20-second timer covers fetch, body reads and any retry; the retry budget is one total (not one per retry reason). HTTP and embedded errors are sanitized. The caller supplies its structured JSON schema and synchronous Zod validator; the caller also validates image size/signature before supplying bytes. This transport neither writes images nor logs outbound content, provider bodies, or secrets.

- [ ] **Run GREEN:** `npx vitest run tests/db-schema.test.ts` → nine passing tests; no network requests.
- [ ] **Commit:**

```powershell
git add -- src/lib/openrouter/client.ts tests/db-schema.test.ts
git commit -m "feat: add bounded server-only OpenRouter JSON transport"
```

## Task 5: Build the Light/Dark/System shell and accessible primitives

**Files:** `src/app/layout.tsx`, `src/app/globals.css`, `src/components/theme-provider.tsx`, `src/components/ui/theme-init.ts`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/foundation.test.tsx`, `tests/db-schema.test.ts`.

- [ ] **Write the RED jsdom tests** in `src/components/ui/foundation.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider, ThemeSelect } from "@/components/theme-provider";
import { Button } from "./button";
import { Card } from "./card";
import { themeInitScript, THEME_STORAGE_KEY } from "./theme-init";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("style");
});

it("uses the saved theme, persists explicit choices, and follows system changes", () => {
  const listeners = new Set<() => void>();
  const system = {
    matches: true,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => system));
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  Function(themeInitScript)();
  expect(document.documentElement).not.toHaveClass("dark");
  render(<ThemeProvider><ThemeSelect /></ThemeProvider>);
  const select = screen.getByRole("combobox", { name: "Appearance" });
  expect(select).toHaveValue("light");
  fireEvent.change(select, { target: { value: "dark" } });
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.change(select, { target: { value: "system" } });
  expect(document.documentElement).toHaveClass("dark");
  act(() => {
    system.matches = false;
    for (const listener of listeners) listener();
  });
  expect(document.documentElement).not.toHaveClass("dark");
});

it("renders a named native button with a large target and no accidental form submit", () => {
  const action = vi.fn();
  render(<Card><Button onClick={action}>Save</Button><Button disabled>Unavailable</Button></Card>);
  const button = screen.getByRole("button", { name: "Save" });
  expect(button).toHaveAttribute("type", "button");
  expect(button).toHaveClass("min-h-12", "min-w-12");
  fireEvent.click(button);
  expect(action).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
});
```

Add a file-based token check in Node (not jsdom's partial CSS engine) to `tests/db-schema.test.ts`:

```ts
function luminance(hex: string) {
  const channels = (hex.match(/[0-9a-f]{2}/gi) ?? []).map((part) => {
    const value = Number.parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

it("sets 18px tabular typography and AA text colors in both palettes", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  expect(css).toContain("--text-base: 1.125rem");
  expect(css).toContain("font-variant-numeric: tabular-nums");
  for (const selector of [":root", "html.dark"]) {
    const palette = css.split(`${selector} {`)[1]?.split("}")[0] ?? "";
    const color = (name: string) => palette.match(new RegExp(`--vt-${name}: (#\\w{6});`))?.[1] ?? "";
    for (const [fg, bg] of [
      ["text", "canvas"], ["text", "surface"], ["muted", "canvas"], ["muted", "surface"],
      ["primary-fg", "primary"], ["primary", "canvas"], ["primary", "surface"],
      ["accent-fg", "accent"], ["accent", "canvas"], ["accent", "surface"],
      ["caution-fg", "caution"], ["focus", "surface"], ["focus", "canvas"],
    ]) {
      const values = [luminance(color(fg)), luminance(color(bg))];
      expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05))
        .toBeGreaterThanOrEqual(4.5);
    }
  }
});
```

- [ ] **Run RED:** `npx vitest run tests/db-schema.test.ts src/components/ui/foundation.test.tsx` → missing CSS/UI modules; pre-existing tests pass.
- [ ] **Implement tokens** in `src/app/globals.css`. Keep `@theme inline` aliases pointing to variables resolved on `<html>`; porting `@theme` as static Light literals would not theme all utilities.

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
  color-scheme: light;
  --vt-canvas: #f7faf8;
  --vt-surface: #ffffff;
  --vt-text: #172625;
  --vt-muted: #475e58;
  --vt-border: #738881;
  --vt-primary: #07594f;
  --vt-primary-fg: #ffffff;
  --vt-accent: #8a3915;
  --vt-accent-fg: #ffffff;
  --vt-caution: #fff0d8;
  --vt-caution-fg: #71350f;
  --vt-focus: #07594f;
}

html.dark {
  color-scheme: dark;
  --vt-canvas: #111c1a;
  --vt-surface: #1a2a27;
  --vt-text: #ecf6f3;
  --vt-muted: #abc4bd;
  --vt-border: #76958c;
  --vt-primary: #65e0c4;
  --vt-primary-fg: #102421;
  --vt-accent: #ffbc75;
  --vt-accent-fg: #331b0d;
  --vt-caution: #412814;
  --vt-caution-fg: #ffd3a1;
  --vt-focus: #65e0c4;
}

@theme {
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --text-base: 1.125rem;
  --text-base--line-height: 1.55;
}

@theme inline {
  --color-canvas: var(--vt-canvas);
  --color-surface: var(--vt-surface);
  --color-text: var(--vt-text);
  --color-muted: var(--vt-muted);
  --color-border: var(--vt-border);
  --color-primary: var(--vt-primary);
  --color-primary-fg: var(--vt-primary-fg);
  --color-accent: var(--vt-accent);
  --color-accent-fg: var(--vt-accent-fg);
  --color-caution: var(--vt-caution);
  --color-caution-fg: var(--vt-caution-fg);
  --color-focus: var(--vt-focus);
}

body {
  @apply min-h-dvh bg-canvas font-sans text-base text-text;
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 3px solid var(--vt-focus);
  outline-offset: 3px;
}
```

- [ ] **Implement preference and shell.** `src/components/ui/theme-init.ts`:

```ts
export const THEME_STORAGE_KEY = "vitals-tracker-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
export type ThemeMode = "system" | "light" | "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export const themeInitScript = `(() => {
  let mode = "system";
  try { mode = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "system"; } catch {}
  if (mode !== "light" && mode !== "dark") mode = "system";
  const dark = mode === "dark" || (mode === "system" && !!window.matchMedia?.(${JSON.stringify(DARK_QUERY)}).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
})();`;
```

`src/components/theme-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DARK_QUERY, isThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/components/ui/theme-init";

const changed = "vitals-tracker-theme-change";
let volatileMode: ThemeMode | undefined;
const ThemeContext = createContext<{ mode: ThemeMode; setMode: (value: ThemeMode) => void } | null>(null);

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changed, listener);
  };
}

function getPreference(): ThemeMode {
  if (volatileMode) return volatileMode;
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : "system";
  } catch {
    return "system";
  }
}

const serverPreference = (): ThemeMode => "system";

function setMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    volatileMode = undefined;
  } catch {
    volatileMode = mode;
  }
  window.dispatchEvent(new Event(changed));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getPreference, serverPreference);
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    const apply = () => {
      const preference = getPreference();
      const dark = preference === "dark" || (preference === "system" && !!query?.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    query?.addEventListener("change", apply);
    return () => query?.removeEventListener("change", apply);
  }, [mode]);
  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme requires ThemeProvider");
  return context;
}

export function ThemeSelect() {
  const { mode, setMode: applyMode } = useTheme();
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span>Appearance</span>
      <select className="min-h-12 min-w-12 rounded-lg border border-border bg-surface px-3"
        value={mode} onChange={(event) => {
          if (isThemeMode(event.currentTarget.value)) applyMode(event.currentTarget.value);
        }}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider, ThemeSelect } from "@/components/theme-provider";
import { themeInitScript } from "@/components/ui/theme-init";
import "./globals.css";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Vitals Tracker", description: "Daily nutrient and medicine tracking" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <ThemeProvider>
          <header className="border-b border-border bg-surface">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold text-primary">Vitals Tracker</span>
              <ThemeSelect />
            </div>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

The inline script is a static build-time string without dynamic user input and must execute before paint. No account calls or route-specific navigation are added here; consumers can call `useTheme().setMode(savedMode)` when loading account preferences and persist their Settings choices server-side.

- [ ] **Implement primitives.** `src/components/ui/button.tsx`:

```tsx
import type { ComponentProps } from "react";

const variants = {
  primary: "bg-primary text-primary-fg",
  secondary: "bg-accent text-accent-fg",
  outline: "border border-border bg-surface text-text",
};

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof variants };

export function Button({ type = "button", variant = "primary", className = "", ...props }: ButtonProps) {
  return <button {...props} type={type} className={[
    "inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center rounded-xl px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant], className,
  ].join(" ")} />;
}
```

`src/components/ui/card.tsx`:

```tsx
import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`rounded-2xl border border-border bg-surface p-4 sm:p-6 ${className}`} />;
}
```

- [ ] **Run GREEN:** `npx vitest run tests/db-schema.test.ts src/components/ui/foundation.test.tsx` → twelve passing tests; `npm run typecheck` → no diagnostics. If Next reports an App Router build issue later, do not create a root `page.tsx` or disable type checking.
- [ ] **Commit:**

```powershell
git add -- src/app/layout.tsx src/app/globals.css src/components/theme-provider.tsx src/components/ui/theme-init.ts src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/foundation.test.tsx tests/db-schema.test.ts
git commit -m "feat: add AA dual-chromatic theme and accessible primitives"
```

## Task 6: Add the eight-second Undo notification

**Files:** `src/components/ui/undo-toast.tsx`, `src/components/ui/foundation.test.tsx`.

- [ ] **Add the RED test.** Add `import { UndoToast } from "./undo-toast";` to `src/components/ui/foundation.test.tsx`; append:

```tsx
it("announces an undoable action, settles once, and expires after eight seconds", () => {
  vi.useFakeTimers();
  const onUndo = vi.fn();
  const onExpire = vi.fn();
  const done = render(<UndoToast message="Food logged" onUndo={onUndo} onExpire={onExpire} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByRole("status")).toHaveTextContent("Food logged");
  act(() => vi.advanceTimersByTime(7_899));
  const button = screen.getByRole("button", { name: "Undo" });
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  fireEvent.click(button);
  act(() => vi.advanceTimersByTime(1));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(onExpire).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  done.unmount();
  const firstExpire = vi.fn();
  const next = render(<UndoToast message="Medicine logged" onUndo={onUndo} onExpire={firstExpire} />);
  act(() => vi.advanceTimersByTime(7_999));
  next.rerender(<UndoToast message="Medicine logged" onUndo={onUndo} onExpire={onExpire} />);
  act(() => vi.advanceTimersByTime(1));
  expect(onExpire).toHaveBeenCalledOnce();
  expect(firstExpire).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
});
```

- [ ] **Run RED:** `npx vitest run src/components/ui/foundation.test.tsx -t "expires after eight seconds"` → missing `./undo-toast`.
- [ ] **Implement** `src/components/ui/undo-toast.tsx`:

```tsx
"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "./button";

export const UNDO_WINDOW_MS = 8_000;

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onExpire?: () => void;
};

export function UndoToast({ message, onUndo, onExpire }: UndoToastProps) {
  const [visible, setVisible] = useState(true);
  const [live, setLive] = useState(false);
  const settled = useRef(false);
  const expire = useEffectEvent(() => onExpire?.());
  useEffect(() => {
    const announcement = window.setTimeout(() => setLive(true), 100);
    return () => window.clearTimeout(announcement);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      setVisible(false);
      expire();
    }, UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={visible
      ? "fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg"
      : "sr-only"}>
      <span role="status" className="sr-only">{visible && live ? message : ""}</span>
      {visible && <span>{message}</span>}
      {visible && <Button variant="outline" onClick={() => {
        if (settled.current) return;
        settled.current = true;
        setVisible(false);
        onUndo();
      }}>Undo</Button>}
    </div>
  );
}
```

Mount a new instance keyed by the log ID. The toast neither moves focus on entry nor owns networking. Its live region is initially empty so assistive technology can observe the message change; it does not delay the visible button or start of the timer. The consumer starts/handles the DELETE and announces any failure; no compensating persistence is implemented in P1.

- [ ] **Run GREEN:** `npx vitest run src/components/ui/foundation.test.tsx` → three passing UI tests.
- [ ] **Commit:**

```powershell
git add -- src/components/ui/undo-toast.tsx src/components/ui/foundation.test.tsx
git commit -m "feat: add accessible eight-second undo toast"
```

## Task 7: Add the PWA and non-blocking root bridge

**Files:** `public/manifest.json`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/apple-touch-icon.png`, `public/icons/foundation.html`, `next.config.ts`, `src/app/layout.tsx`, `src/components/theme-provider.tsx`, `src/components/ui/foundation.test.tsx`, `tests/db-schema.test.ts`.

- [ ] **Add the RED tests.** Add `import { runInNewContext } from "node:vm";` to `tests/db-schema.test.ts`; append:

```ts
it("publishes a standalone manifest, real install icons, and a fallback that does not shadow a real root page", async () => {
  const publicFile = (path: string) => readFileSync(new URL(`../public${path}`, import.meta.url));
  const manifest = JSON.parse(publicFile("/manifest.json").toString());
  expect(manifest).toMatchObject({ start_url: "/", scope: "/", display: "standalone" });
  expect(manifest.icons).toEqual([
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  for (const [path, size] of [
    ["/icons/icon-192.png", 192], ["/icons/icon-512.png", 512],
    ["/icons/maskable-512.png", 512], ["/icons/apple-touch-icon.png", 180],
  ] as const) {
    const png = publicFile(path);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  }
  const { default: config } = await import("../next.config");
  await expect(config.headers?.()).resolves.toContainEqual({
    source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store" }],
  });
  await expect(config.rewrites?.()).resolves.toEqual({
    beforeFiles: [], afterFiles: [], fallback: [{ source: "/", destination: "/icons/foundation.html" }],
  });
  expect(publicFile("/icons/foundation.html").toString()).toContain("Vitals Tracker");
});

it("only caches allow-listed same-origin static GETs, not navigations, API or photos", async () => {
  type Event = {
    request: { url: string; method: string; mode: string; headers: Headers };
    respondWith: (response: Promise<Response>) => void;
  };
  const listeners: Record<string, (event: Event) => void> = {};
  const cache = {
    match: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(new Response("cached")),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const network = vi.fn().mockResolvedValue(new Response("fresh"));
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: {
      location: { origin: "https://app.example.test" },
      addEventListener: (name: string, listener: (event: Event) => void) => { listeners[name] = listener; },
    },
    caches: { open: vi.fn().mockResolvedValue(cache) }, fetch: network, URL,
  });
  function request(url: string, mode = "cors", method = "GET") {
    const respondWith = vi.fn<Event["respondWith"]>();
    listeners.fetch({
      request: { url: new URL(url, "https://app.example.test").href, method, mode, headers: new Headers() },
      respondWith,
    });
    return respondWith;
  }
  for (const [url, mode, method] of [
    ["/api/medicines/scan", "cors", "POST"], ["/api/settings", "cors", "GET"],
    ["/", "navigate", "GET"], ["/icons/foundation.html", "cors", "GET"],
    ["/uploads/medicine.jpg", "cors", "GET"], ["https://other.example.test/manifest.json", "cors", "GET"],
    ["/manifest.json", "cors", "POST"], ["/icons/icon-192.png?private=fixture", "cors", "GET"],
  ]) {
    expect(request(url, mode, method)).not.toHaveBeenCalled();
  }
  expect(network).not.toHaveBeenCalled();
  const fresh = request("/_next/static/example.js");
  expect(await (await fresh.mock.calls[0][0]).text()).toBe("fresh");
  const cached = request("/_next/static/example.js");
  expect(await (await cached.mock.calls[0][0]).text()).toBe("cached");
  expect(network).toHaveBeenCalledOnce();
  expect(cache.put).toHaveBeenCalledOnce();
});
```

Append to `src/components/ui/foundation.test.tsx`:

```tsx
it("registers the root-scope service worker from the client", () => {
  const register = vi.fn().mockResolvedValue(undefined);
  const prior = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  try {
    render(<ThemeProvider><div>Shell</div></ThemeProvider>);
    expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js", { scope: "/" });
  } finally {
    if (prior) Object.defineProperty(navigator, "serviceWorker", prior);
    else Reflect.deleteProperty(navigator, "serviceWorker");
  }
});
```

- [ ] **Run RED:** `npx vitest run tests/db-schema.test.ts src/components/ui/foundation.test.tsx -t "standalone manifest|allow-listed same-origin|root-scope service worker"` → missing static paths and no registration.
- [ ] **Add install metadata and icons.** Create `public/manifest.json`:

```json
{
  "id": "/",
  "name": "Vitals Tracker",
  "short_name": "Vitals",
  "description": "Daily nutrient and medicine tracking",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f7faf8",
  "theme_color": "#07594f",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Generate the four checked-in PNGs with Windows PowerShell 5.1 and built-in `System.Drawing`; no image package or generator source file. The lighter mark and warm dot both fit inside the maskable central safe circle.

```powershell
New-Item -ItemType Directory -Force -Path 'public/icons' | Out-Null
Add-Type -AssemblyName System.Drawing
$icons = [ordered]@{ 'icon-192.png' = 192; 'icon-512.png' = 512; 'maskable-512.png' = 512; 'apple-touch-icon.png' = 180 }
foreach ($entry in $icons.GetEnumerator()) {
  $size = [int]$entry.Value
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $warm = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#FFBC75'))
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#07594F'))
    $graphics.FillRectangle([System.Drawing.Brushes]::White, (0.29 * $size), (0.45 * $size), (0.42 * $size), (0.10 * $size))
    $graphics.FillRectangle([System.Drawing.Brushes]::White, (0.45 * $size), (0.29 * $size), (0.10 * $size), (0.42 * $size))
    $graphics.FillEllipse($warm, (0.61 * $size), (0.30 * $size), (0.10 * $size), (0.10 * $size))
    $file = Join-Path (Get-Location).Path ('public/icons/' + $entry.Key)
    $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $warm.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}
```

In `src/app/layout.tsx` replace the metadata declaration (keep `runtime` and the script):

```tsx
export const metadata: Metadata = {
  title: "Vitals Tracker",
  description: "Daily nutrient and medicine tracking",
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Vitals Tracker", statusBarStyle: "default" },
};
```

- [ ] **Implement `public/sw.js`.** Do not precache HTML, APIs, snapshots, scans or user media. Let every non-allow-listed request use the browser's normal network path rather than calling `respondWith` for it.

```js
const prefix = "vitals-tracker-static-";
const version = `${prefix}v1`;
const installAssets = new Set([
  "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/maskable-512.png", "/icons/apple-touch-icon.png",
]);

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== version)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode === "navigate" || request.headers.has("Range") ||
      url.origin !== self.location.origin || url.search ||
      (!installAssets.has(url.pathname) && !url.pathname.startsWith("/_next/static/"))) return;

  event.respondWith((async () => {
    const cache = await caches.open(version).catch(() => undefined);
    const existing = await cache?.match(request).catch(() => undefined);
    if (existing) return existing;
    const response = await fetch(request);
    if (cache && response.ok && !response.redirected &&
        !/\bno-store\b/i.test(response.headers.get("Cache-Control") ?? "")) {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  })());
});
```

In `src/components/theme-provider.tsx`, add this effect immediately after `const mode = useSyncExternalStore(...)`:

```tsx
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
```

- [ ] **Implement the owned static start-URL bridge.** Without an App Router homepage, `/` would otherwise be a 404 even if the framework can build. Put the small HTML fallback in the sole owned public subdirectory; it is not a feature page and is not in the worker cache allow-list. `src/app/page.tsx` is still uncreated. Next's fallback rewrite runs after resolving real routes, so P7's root page takes precedence without modifying P1 files.

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "tesseract.js", "tesseract.js-core"],
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: "/", destination: "/icons/foundation.html" }] };
  },
};

export default nextConfig;
```

`public/icons/foundation.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#07594f">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <title>Vitals Tracker</title>
  <style>
    body { margin: 0; padding: 2rem 1rem; background: #f7faf8; color: #172625; font: 1.125rem/1.55 system-ui, sans-serif; }
    main { max-width: 34rem; margin-inline: auto; }
    @media (prefers-color-scheme: dark) { body { color-scheme: dark; background: #111c1a; color: #ecf6f3; } }
  </style>
</head>
<body>
  <main><h1>Vitals Tracker</h1><p>Your daily care tracker is being set up.</p></main>
  <script>
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  </script>
</body>
</html>
```

- [ ] **Run GREEN:** `npx vitest run tests/db-schema.test.ts src/components/ui/foundation.test.tsx` → sixteen passing tests. Then run `npm run build`; expect exit 0 with no root page file. The static `/` rewrite is smoke-tested below rather than inferred from a Next route table. If build fails, diagnose the actual compiler/Next error and report any ownership or pin blocker; do not bypass the gate or write any unowned route.
- [ ] **Commit:**

```powershell
git add -- public/manifest.json public/sw.js public/icons/icon-192.png public/icons/icon-512.png public/icons/maskable-512.png public/icons/apple-touch-icon.png public/icons/foundation.html next.config.ts src/app/layout.tsx src/components/theme-provider.tsx src/components/ui/foundation.test.tsx tests/db-schema.test.ts
git commit -m "feat: add PWA install assets and safe static caching"
```

## Final verification gate (read-only; no additional commit)

- [ ] **Run on the committed P1 worktree:**

```powershell
npm run typecheck
npm run build
npx vitest run tests/db-schema.test.ts
npx vitest run src/components/ui/foundation.test.tsx
npm run lint
git status --short
```

Expected: exit 0 for all checks, twelve Node tests (including real migration + seven-table round trips), four jsdom tests, clean lint and no new tracked or untracked P1 artifacts. Existing orchestrator edits are not P1 artifacts. Confirm `src/app/page.tsx` is absent at the P1 commit, and no secrets, generated `drizzle/`, SQLite files, `next-env.d.ts` or `.next/` are staged.

- [ ] **Smoke-test the production server** with `npm run start -- --hostname 127.0.0.1 --port 3017` in a separate terminal, then run this in the checkout's PowerShell:

```powershell
$base = 'http://127.0.0.1:3017'
$home = Invoke-WebRequest -UseBasicParsing "$base/"
$manifest = Invoke-WebRequest -UseBasicParsing "$base/manifest.json"
$worker = Invoke-WebRequest -UseBasicParsing "$base/sw.js"
if ($home.StatusCode -ne 200 -or $home.Content -notmatch '<h1>Vitals Tracker</h1>') { throw 'Missing root fallback' }
if (($manifest.Content | ConvertFrom-Json).start_url -ne '/') { throw 'Invalid manifest start URL' }
if ($worker.Headers['Cache-Control'] -notmatch 'no-store') { throw 'Missing worker no-store header' }
```

Stop the server you started with Ctrl+C. In a local browser if available, check the Application panel for a root-scoped `/sw.js` and the manifest/icon sizes; localhost is a secure-context exception. Real OpenRouter and Turso calls are not part of the gate.

- [ ] **Report evidence and handoff contracts** to the orchestrator: commit hashes and gate output; `await getDb()`/`await createTestDb()`, nullable source references and snapshots, `completeJson()` plus the typed errors/model policy, theme hook/local-storage behavior, keyed `UndoToast`, and static fallback precedence. Call out that migration history ownership is still outside P1 and that P1 verification does not validate real provider credentials or the hosted Turso connection.
