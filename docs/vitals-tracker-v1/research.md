# Technical Research: `vitals-tracker-v1`

Checked 2026-11-26 against npm registry latest tags and official docs. Node on this machine: `v24.18.0` / npm `12.0.1`. Greenfield except `docs/`.

---

## 1. Verified decisions (contracts for planners/workers)

1. **Framework:** Next.js **16.4.6** App Router + React **19.3.1** + TypeScript **7.0.2**. Node engines: Next `>=20.9.0`; jsdom 31 needs `^24.15.0`. Pin `"engines": { "node": ">=24.15.0" }`.
2. **Styling:** Tailwind **v4.3.5** (not v3). No `tailwind.config.js`. Theme tokens live in `src/app/globals.css` via `@theme` + class-based dark mode.
3. **DB:** Stable **drizzle-orm 0.45.4** + **drizzle-kit 0.31.11** + **@libsql/client 0.18.0**. Do **not** adopt drizzle v1 RC or `@tursodatabase/*` for P1. Dialect `turso` in `drizzle.config.ts`. Runtime: `drizzle-orm/libsql` + `createClient` from `@libsql/client`.
4. **Validation:** **zod 4.6.7** (`import * as z from "zod"`). Not zod 3.
5. **OpenRouter:** Server-only `fetch` to `POST https://openrouter.ai/api/v1/chat/completions` (Chat Completions, not Responses API). Vision via `image_url` **data URLs**. Structured output via `response_format.json_schema`. 20s `AbortController`. Key never `NEXT_PUBLIC_*`.
6. **Food waterfall:** local saved/curated → Open Food Facts (no key) → USDA FDC (`USDA_FDC_API_KEY`, skip if unset) → OpenRouter estimate. Cache confirmed foods per `userId`.
7. **Tesseract.js 7.0.0:** **Keep in P1 dependencies.** Implement as lazy server-only fallback in P5. Mock in tests. Do not initialize at import time.
8. **PWA:** Keep DAG files `public/manifest.json` + `public/sw.js` (goal). Next also supports `app/manifest.ts`; do not add a second manifest. Icons 192 + 512 PNG (+ 180 apple-touch).
9. **Auth:** Node `crypto.scrypt` + SHA-256 session tokens + 90-day `HttpOnly` / `SameSite=Lax` cookies via `await cookies()` in route handlers. `secure: process.env.NODE_ENV === "production"`.
10. **Tests:** Vitest **5.1.2** + jsdom **31.0.1**. Dual env: `node` for db/lib, `jsdom` for `*.tsx`. In-memory libSQL `:memory:` per test.
11. **Recharts 3.11.1** is React 19 compatible. Charts are Client Components only (`"use client"`).
12. **create-next-app in this repo will refuse a non-empty directory.** P1 must write the scaffold files (or generate in a temp dir and copy). Do not run `create-next-app .` against the docs-containing root.

---

## 2. Version matrix (install these exact versions)

Install with npm 12. Use exact versions in `package.json` (`"next": "16.4.6"`) so parallel workers never drift. **No `overrides` required** if this matrix is followed.

### Runtime / app

| Package | Version | Role |
| :--- | :--- | :--- |
| `next` | **16.4.6** | App Router. Peer: `react`/`react-dom` `^18.2 \|\| ^19`. Engines: Node `>=20.9.0`. |
| `react` | **19.3.1** | |
| `react-dom` | **19.3.1** | Peer: `react@^19.3.1`. |
| `server-only` | **0.0.1** | Guard OpenRouter/auth/db modules. |
| `drizzle-orm` | **0.45.4** | Optional peer `@libsql/client >=0.10.0`. |
| `@libsql/client` | **0.18.0** | Native `libsql@^0.5.28`. |
| `zod` | **4.6.7** | Env, API bodies, AI JSON. |
| `recharts` | **3.11.1** | Peer `react`/`react-dom`/`react-is` `^19`. |
| `react-is` | **19.3.1** | **Required** recharts peer — install explicitly. |
| `lucide-react` | **1.81.0** | Peer `react ^16.5–^19`. |
| `tesseract.js` | **7.0.0** | OCR fallback. Pulls `tesseract.js-core@7`. |

### Tooling / CSS / test

| Package | Version | Role |
| :--- | :--- | :--- |
| `typescript` | **7.0.2** | Next 16.4 documents “Using TypeScript 7”; `next build` uses project-local `tsc`. |
| `@types/node` | **24.19.4** | Match Node 24 — **do not** install latest `@types/node@26`. |
| `@types/react` | **19.3.3** | |
| `@types/react-dom` | **19.3.0** | Peer `@types/react@^19.3.0`. |
| `tailwindcss` | **4.3.5** | |
| `@tailwindcss/postcss` | **4.3.5** | PostCSS plugin (replaces `tailwindcss` + `autoprefixer` v3 plugins). |
| `postcss` | **8.5.33** | Next already depends on PostCSS 8.5.x; keep as direct dep for `postcss.config.mjs`. |
| `drizzle-kit` | **0.31.11** | CLI generate/migrate/push. No peer deps. |
| `eslint` | **9.39.5** | Pin **9.x**, not latest 10.15.0. `eslint-config-next` peer is `eslint >=9`; 10 is unproven with this Next patch. |
| `eslint-config-next` | **16.4.6** | Match Next minor. |
| `vitest` | **5.1.2** | Peer `vite ^6.4 \|\| ^7 \|\| ^8`. Engines: `^22.12 \|\| ^24 \|\| >=26`. |
| `vite` | **8.3.8** | Install as **devDependency** to satisfy Vitest peer (even if unused as bundler). |
| `jsdom` | **31.0.1** | Engines `^22.22.2 \|\| ^24.15.0 \|\| >=26`. Optional peer `@napi-rs/canvas` — skip. |
| `@testing-library/react` | **16.3.3** | Peer React 18/19 + `@testing-library/dom ^10`. |
| `@testing-library/dom` | **10.4.2** | Install explicitly (jest-dom 8 requires `>=10 <11`). |
| `@testing-library/jest-dom` | **8.0.0** | Peer `vitest >=5 <6`. Import `@testing-library/jest-dom/vitest`. |
| `@testing-library/user-event` | **14.6.13** | Optional but useful for P7/P8. |

**Do not install:** `@vitejs/plugin-react` (v6 peers `vite ^8` *and* optional oxc/rolldown plugins — unnecessary; Vitest esbuild already transforms TSX). `autoprefixer`, `postcss-import`, `tailwindcss` v3 plugin, `drizzle-orm@rc`, `@tursodatabase/serverless`.

**No type packages needed for:** `zod`, `drizzle-orm`, `lucide-react`, `recharts` (ships types).

### Peer / pin notes

- `react-dom@19.3.1` requires exact `react@^19.3.1` — keep them in lockstep.
- jsdom 31 **will not install/run on Node <24.15**. Document this in README (P9).
- ESLint 10.15.0 is latest and peer-legal; **do not use it in P1** unless `eslint-config-next` later advertises ESLint 10. If a worker hits a flat-config clash, stay on 9.39.5.
- TypeScript 5.9.3 and 6.0.3 still exist; Next 16.4 prefers TS 7 CLI typecheck. Do not mix majors.

---

## 3. Per-area integration notes

### 3.1 Next.js App Router (P1, all API plans)

**Scaffold files P1 must create:** `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (placeholder; P7 overwrites), `.gitignore`, `.env.example`.

**`next.config.ts` (required):**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "tesseract.js", "tesseract.js-core"],
  // @libsql/client + libsql are already on Next's auto-external list; still declare them.
};

export default nextConfig;
```

**Gotchas:**

- **`cookies()` is async.** `const store = await cookies()`. Sync access is deprecated. `.set` / `.delete` only in Route Handlers or Server Actions — never in Server Components.
- **Route `params` are `Promise<>`.** Pages, layouts, and route handlers:

```ts
type Params = Promise<{ id: string }>;
export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
}
```

  Nested `[id]/logs/[logId]` → `Promise<{ id: string; logId: string }>`.

- **Node runtime** for scan/OCR/db: `export const runtime = "nodejs"` on those route files. Default is already nodejs; **do not** set `edge`.
- **Env:** `OPENROUTER_API_KEY`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `USDA_FDC_API_KEY` are server-only. Never prefix `NEXT_PUBLIC_`. Read them in modules that start with `import "server-only"`. Optional: `await connection()` from `next/server` before reading runtime env in prerendered pages (not needed in Route Handlers).
- **Client/server boundary:** `src/lib/openrouter/*`, `src/lib/auth/*`, `src/db/*`, `src/lib/medicines/ocr-fallback.ts` must `import "server-only"`. UI that uses `useState` / Recharts / camera must `"use client"`. Pass serializable props only across the boundary.
- **Metadata:** root `layout.tsx` `export const metadata` + `<link rel="manifest" href="/manifest.json" />` (or Next file convention). PWA icons via `metadata.icons` and `appleWebApp`.
- **Service worker registration:** client-only `useEffect` in `theme-provider` or a tiny `src/components/pwa-register.tsx` (P1 UI primitive). Register `/sw.js` with `{ scope: "/" }`. HTTPS required for install (localhost exempt).
- **`next-env.d.ts`:** generated; Next 16 docs say gitignore it. Include it in `tsconfig.include`.
- **Scripts P1 should define:** `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `db:generate`, `db:migrate`, `db:push`, `db:seed` (P9 implements seed).

### 3.2 Tailwind v4 + dual-chromatic tokens (P1)

**Install:** `tailwindcss@4.3.5` `@tailwindcss/postcss@4.3.5` `postcss@8.5.33`.

**`postcss.config.mjs`:**

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

No `autoprefixer`, no `tailwind.config.js`.

**`src/app/globals.css`:**

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --text-base: 1.125rem; /* 18px */
  --color-primary: /* deep teal */;
  --color-primary-fg: /* on-primary */;
  --color-accent: /* amber/terracotta */;
  --color-surface: /* light neutrals */;
  --color-caution: /* amber */;
  /* map to utilities: bg-primary, text-accent, etc. */
}

html.dark {
  /* redefine the same --color-* tokens for dark */
}
```

`@custom-variant dark` is required for Light/Dark/System toggle (class on `<html>`, not `prefers-color-scheme` alone). Theme provider: inline blocking script in `layout.tsx` to avoid FOUC; persist via user `theme` column (P2) with `localStorage` fallback before login.

Touch targets: utility `min-h-12 min-w-12` (48px). Tabular nums: `tabular-nums`.

### 3.3 Drizzle + libSQL / Turso (P1, P9)

**`src/db/index.ts`:**

```ts
import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  return { client, db: drizzle(client, { schema }) };
}
```

- Local: `DATABASE_URL=file:local.db` (**`file:` prefix required**). No auth token.
- Prod: `DATABASE_URL=libsql://<db>-<org>.turso.io` + `DATABASE_AUTH_TOKEN`.
- Tests: `createClient({ url: ":memory:" })`. Each client is an isolated DB.

**`drizzle.config.ts`:** `dialect: "turso"`, `schema: "./src/db/schema.ts"`, `out: "./drizzle"`, `dbCredentials: { url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN }`. drizzle-kit loads `.env` / `.env.local`.

**Workflow:** `drizzle-kit generate` → commit SQL under `drizzle/` → `drizzle-kit migrate` for local/Turso. `push` is fine for local iteration only; P9 seed and CI must use generated migrations so schema is identical.

**Schema patterns (`drizzle-orm/sqlite-core`):**

- PKs: `text("id").primaryKey()` — values from `crypto.randomUUID()`.
- Timestamps: `text("created_at").notNull()` ISO-8601. Dates: `text("log_date")` `YYYY-MM-DD`.
- Reals: `real("daily_target")`, `real("quantity")`.
- JSON: `text("health_flags_json", { mode: "json" }).$type<("diabetes"|"hypertension")[]>().notNull()`.
- FKs: `.references(() => users.id, { onDelete: "cascade" })`.
- Unique: `uniqueIndex("tracker_nutrients_tracker_id_nutrient_key_uidx").on(t.trackerId, t.nutrientKey)` in table callback. Same for `users.email`, `sessions.tokenHash`.
- Indexes: `(trackerId, logDate)`, `(userId, logDate)` on `intake_logs`.

**Foreign keys:** SQLite/libSQL does **not** always enforce FKs unless `PRAGMA foreign_keys = ON`. Test factory must `await client.execute("PRAGMA foreign_keys = ON")` immediately after connect. Turso generally enforces FKs; still keep cascade in schema.

**Transactions:** `await db.transaction(async (tx) => { ... })`. libSQL interactive tx lock ~5s on remote — keep signup (user+session) and log-create short. Prefer `client.batch([...], "write")` for seed. Nested `tx.transaction` = savepoints.

**In-memory test harness (`src/db/test-utils.ts`):** create client → pragma FK on → `drizzle` → apply migrations with `drizzle-orm/libsql/migrator` `migrate(db, { migrationsFolder: "drizzle" })` **or** execute generated SQL files. Do not share one `:memory:` client across tests. Close client in `afterEach`.

**`@libsql/client` exports:** Node default is `./node` (supports `:memory:` and `file:`). Next bundling to edge/web would switch to `./web`, which **does not support local files**. Force Node via `serverExternalPackages` + `runtime = "nodejs"`. Never import `@libsql/client/web` in this app.

### 3.4 Auth (P2)

**Password (`src/lib/auth/password.ts`):**

- `crypto.randomBytes(16)` salt.
- `crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })` (Node 24 supports this; do not use `scryptSync` in the request path if you can avoid blocking — `scrypt` callback/promisify is fine for auth routes).
- Store `saltHex:hashHex` (or PHC). Never store raw password.
- Verify: decode salt, scrypt candidate, `crypto.timingSafeEqual`. **Buffers must be equal length** — always compare 64-byte hashes, never variable-length strings.

**Session:**

- Token: `crypto.randomBytes(32).toString("base64url")`. Cookie stores **raw token**.
- DB stores `sha256(token)` hex (`crypto.createHash("sha256")`). Unique index on `tokenHash`.
- Cookie name e.g. `vt_session`. Options: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 90 * 24 * 60 * 60`, `secure: process.env.NODE_ENV === "production"`.
- `requireUser()`: `await cookies()` → hash → select session join user where `expiresAt > now`. Missing/expired → `null`; route handlers return `401` JSON. Never leak whether email exists on login beyond a generic message (signup duplicate-email **is** explicit per AC).

**Gotcha:** Setting cookies in a GET handler is legal but prefer POST login/signup/logout. Do not put the session token in JSON responses.

### 3.5 OpenRouter (P1 client, P4/P5 consumers)

**Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`  
**Auth:** `Authorization: Bearer ${OPENROUTER_API_KEY}`; `Content-Type: application/json`; optional `HTTP-Referer` / `X-Title` (app name).

**Vision body (text first, then image — OpenRouter parses in that order):**

```ts
{
  model,
  messages: [
    { role: "system", content: "..." },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "auto" } },
      ],
    },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "medicine_scan", strict: true, schema: { ... } },
  },
  temperature: 0,
}
```

Supported image types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`. We only accept jpeg/png/webp.

If a model rejects `json_schema`, retry once with `{ type: "json_object" }` then `JSON.parse` + zod. Always zod-parse model text (strip ``` fences).

**Timeout:** `AbortController` + `setTimeout(..., 20_000)`. Map `AbortError` → typed `TIMEOUT` (user message, not stack).

**HTTP / typed errors to map:**

| Code | Meaning | App code |
| :--- | :--- | :--- |
| 400 | bad params / `invalid_image` | `BAD_REQUEST` |
| 401 | bad key | `AUTH` |
| 402 | credits | `PAYMENT` |
| 403 | policy / guardrail | `FORBIDDEN` |
| 408 / 504 | timeout | `TIMEOUT` |
| 429 | rate limit; honor `Retry-After` | `RATE_LIMIT` |
| 502 / 503 | provider down | `PROVIDER` |

A **200 body can still contain `error`** or `choices[0].error`. Check both. Do **not** retry 401/402/403 blindly. One retry on 429/503 if `Retry-After` ≤ 5s; otherwise fail to UI fallback.

**Vision allow-list (Settings picker + default).** Default env `OPENROUTER_VISION_MODEL=google/gemini-2.5-flash` (cheap OCR). Allow-list (verified vision/OCR-capable slugs as of 2026-11; catalog moves — keep this constant in `src/lib/openrouter/models.ts`):

- `google/gemini-2.5-flash` — default, batch OCR
- `google/gemini-3-flash-preview` — low-latency screenshots
- `anthropic/claude-sonnet-5` / `anthropic/claude-sonnet-5.5` — denser labels
- `anthropic/claude-haiku-5.5` — cheaper Claude vision
- `openai/gpt-4o` / `openai/gpt-4.1-mini` — stable OpenAI vision
- `qwen/qwen3-vl-235b-a22b-instruct` — multilingual OCR

Custom model ID allowed (goal) but **server-side only**: `/^[a-z0-9][a-z0-9._:/-]{0,127}$/i`. Never echo the API key. User `visionModel` column overrides env default.

**Food estimate** uses the same client with text-only messages + json_schema. Label output `source: "ai_confirmed"` / UI *Estimated*.

### 3.6 Open Food Facts + USDA (P4)

**OFF — no API key.** Always send `User-Agent: VitalsTracker/1.0 (contact@example.com)` (replace with a real contact in README). Generic browser UAs get **503**.

| Use | URL | Limit |
| :--- | :--- | :--- |
| Product by barcode | `GET https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=product_name,brands,nutriments,quantity` | **15 req/min/IP** |
| Full-text name search | Legacy `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={q}&search_simple=1&action=process&json=1&page_size=8` | **10 req/min/IP** |
| Structured filter search | `GET /api/v2/search` — **no full text** | 10 req/min |

v3 is current for product read (`/api/v3.6/product/{barcode}.json`); v2 search still required for filters. **Do not** use OFF as search-as-you-type (will ban). Cache 24h. On 503, retry once then fall through to USDA.

Nutriments (per 100g): `sugars_100g`, `sugars`, `salt_100g` (NaCl; sodium mg ≈ salt_g × 400), `sodium_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`, `fiber_100g`, `energy-kcal_100g`. Values are often noisy floats — round to 4 decimals. `status: 0` = not found.

Staging `world.openfoodfacts.net` needs HTTP basic `off:off` — production app must use `.org`.

**USDA FoodData Central** — **requires `USDA_FDC_API_KEY`** (data.gov). Add to `.env.example`. If unset, skip this step.

- Search: `GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key=KEY&query=...&pageSize=8&dataType=Foundation,SR Legacy`
- Details: `GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}?api_key=KEY`
- Rate: **1000 req/hour/IP**; `429` when exceeded. Headers `X-RateLimit-Limit` / `Remaining`.
- Shape: `foods[].description`, `foodNutrients[]` with `nutrient.number` + `amount` (per 100g for Foundation/SR).

Map FDC nutrient numbers → catalog keys (P3/P4):

| FDC # | Name | App key / unit |
| :--- | :--- | :--- |
| 1003 | Protein | protein g |
| 1005 | Carbohydrate | carbohydrates g |
| 1079 | Fiber | fiber g |
| 2000 | Total sugars | totalSugars g |
| 1235 | Added sugars | addedSugars g |
| 1093 | Sodium | sodium mg |
| 1087 Calcium / 1089 Iron / 1090 Magnesium / 1092 Potassium / 1095 Zinc | minerals mg |
| 1051 | Water | water g |
| 1162 Vit C / 1114 Vit D / 1106 Vit A RAE / 1178 B12 / 1177 Folate DFE | vitamins |

**Fallback order (strict):** user saved (`foods.userId = session`) → curated (`userId IS NULL`) with alias match → OFF → USDA (if key) → OpenRouter *Estimated*. Never call OFF/USDA/AI if local hit.

### 3.7 Tesseract.js (P1 install, P5 implement)

**Keep in P1 `package.json`.** AC4/P5 require the pluggable OCR provider; P1 is the only owner of lockfiles.

**Server usage:**

```ts
import { createWorker } from "tesseract.js";
const worker = await createWorker("eng", 1, {
  cachePath: join(tmpdir(), "vt-tess"), // language data only — not user photos
  cacheMethod: "write",
});
const { data: { text } } = await worker.recognize(uint8); // Buffer/Uint8Array, never a file path of an upload
```

**Gotchas:**

- First `createWorker` downloads `eng.traineddata.gz` (network). Cold start 5–15s — **lazy singleton**, not per request. Idle-terminate after ~5 min.
- WASM + `worker_threads`. Next will break this unless `serverExternalPackages` includes `tesseract.js` and `tesseract.js-core`.
- Windows path/corePath issues: do **not** set `corePath` to a single `.js` file; let the package pick SIMD vs LSTM builds.
- Memory: one worker ~50–100MB. Fine for a single-user/family app; do not spawn a pool.
- Node 24: no published engines field; 7.0.0 uses worker threads (supported). If spawn fails, return typed `OCR_UNAVAILABLE` and keep Vision + manual entry.
- **Zero photo disk writes:** pass in-memory `Uint8Array` to `recognize`. Language cache in `os.tmpdir()` is allowed (not user PII).
- Tests: `vi.mock("tesseract.js")` — never run real WASM in CI.

### 3.8 Recharts + Testing Library (P8, P7, P1 harness)

- Recharts 3.11.1 peers include React 19. `accessibilityLayer` is on by default — keep it. Use `title`/`desc` on charts. Prefer `responsive` prop or `ResponsiveContainer` inside a **client** component with a **fixed height** (e.g. 280px). SSR: ResizeObserver is gated; first paint width may be 0 — acceptable if height is set.
- Always `"use client"` on `src/components/analytics/nutrient-trend-chart.tsx`.
- Install `react-is@19.3.1`.

**Vitest (`vitest.config.ts`):**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    environmentMatchGlobs: [["tests/**/*.tsx", "jsdom"]],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`vitest.setup.ts`: `import "@testing-library/jest-dom/vitest"`.

**Mocks:**

```ts
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/trackers/test",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "test" }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
}));
```

Stub `globalThis.fetch` with `vi.fn()`. Do not mock libSQL in `tests/db-schema.test.ts` — use `:memory:`.

### 3.9 PWA (P1)

**`public/manifest.json`:** `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `background_color` / `theme_color` (teal), icons:

- `192x192` PNG `any`
- `512x512` PNG `any`
- `512x512` PNG `maskable` (Android)

Also `public/icons/apple-touch-icon.png` 180×180. Installability: HTTPS + manifest + icon 192/512. iOS 16.4+ needs Share → Add to Home Screen (document in README). `beforeinstallprompt` is Chromium-only — optional; do not rely on it.

**`public/sw.js`:** cache-first for `/icons/*`, `/manifest.json`, `/_next/static/*`. Network-only for `/api/*` and HTML navigations (avoid stale auth). **Never cache medicine images** (none should be stored). Version the cache name. Next PWA guide sets `Cache-Control: no-store` on `/sw.js` via `headers()` in `next.config.ts` — do that.

### 3.10 Security / medical safety

**Images (P5 + P7 compress):**

- Client: resize longest side ~1024px JPEG quality ~0.7, target <400KB.
- Server: reject if `byteLength > 2 * 1024 * 1024`. Allow MIME `image/jpeg|png|webp` **and** magic bytes (`FF D8 FF`, `89 50 4E 47`, `RIFF....WEBP`). Reject SVG/GIF/HEIC.
- Hold `Uint8Array` in RAM → data URL → OpenRouter → drop references. No `writeFile`, no `FormData` disk middleware.

**Secrets:** only server env. Settings page lists **model ids**, never the key.

**Tenant isolation:** every select/update/delete on trackers, logs, user foods/meds, settings **must** `eq(table.userId, session.userId)`. Curated rows (`userId IS NULL`) are readable by all authenticated users, never writable via user APIs.

**Impact engine (P3):** directional copy only. Never emit mg/dL, mmHg, or predicted readings. Thresholds from goal (sugar 35g / added 25g, sodium 2000mg) unless custom tracker targets override.

---

## 4. Test-harness notes

| Area | Recipe |
| :--- | :--- |
| DB | `createClient({ url: ":memory:" })` + `PRAGMA foreign_keys=ON` + migrate + drizzle. New client per test. |
| Auth | Hash with real `scrypt` (slow but OK for a handful of cases) or inject a test hasher. Cookie store: fake `cookies()` mock. |
| OpenRouter / OFF / USDA | `vi.stubGlobal("fetch", ...)` returning fixture JSON. Never hit network in unit tests. |
| Tesseract | `vi.mock("tesseract.js")`. |
| UI | jsdom + Testing Library. Recharts: set container width/height; may need `ResizeObserver` stub. |
| Env | `vitest.setup.ts` sets dummy `DATABASE_URL=:memory:`, dummy OpenRouter key for schema tests that import env. Parse env with zod; tests provide `process.env`. |

P9 e2e-flows: still Vitest + in-memory DB walking API handlers directly (no Playwright in the DAG).

---

## 5. Risks / unknowns / mitigations

| Risk | Mitigation |
| :--- | :--- |
| TypeScript 7 is new; Next CLI typecheck diagnostics differ from the old JS API checker | P1 runs `npm run typecheck` and `next build` before exit. Fallback pin: `typescript@5.9.3` only if TS 7 breaks Next — report in P1. |
| ESLint 10 vs 9 | Stay on 9.39.5. |
| `@libsql/client` native binary on Windows | `serverExternalPackages`; if install fails, check Visual C++ runtime. In-memory tests still need the native `libsql` package. |
| Turso interactive transactions latency | Short tx; batch seeds. |
| OFF 10/min search ban | Local catalog first; debounce; cache; no typeahead against OFF. |
| USDA key not in original goal env list | Add `USDA_FDC_API_KEY`; skip USDA when unset. |
| Vision model slugs churn | Allow-list + custom id; default Gemini 2.5 Flash. |
| Tesseract WASM in Next 16 / Node 24 | Externalize packages; lazy worker; typed unavailable fallback. **Do not block AC4** on OCR if Vision works. |
| Recharts SSR width 0 | Client-only + explicit height. |
| create-next-app vs existing `docs/` | Manual scaffold. |
| Drizzle v1 RC advertised on docs site | Ignore RC; stay 0.45.4 / kit 0.31.11. |

No blockers for starting P1.

---

## 6. DAG reconciliation

**Plan graph (P1→P9) is unchanged.** Keep tesseract.js in P1 deps. Keep `public/manifest.json` + `public/sw.js`.

**Add to P1 owned files** (currently missing; workers will otherwise have nowhere to put them):

- `postcss.config.mjs`
- `eslint.config.mjs`
- `vitest.setup.ts`
- `src/lib/env.ts` (zod env schema; server-only)
- `src/components/pwa-register.tsx` (or fold SW registration into `theme-provider.tsx` — pick one in P1 plan)

**Add env keys in P1 `.env.example`:** `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `OPENROUTER_API_KEY`, `OPENROUTER_VISION_MODEL`, `USDA_FDC_API_KEY` (optional), `NEXT_PUBLIC_APP_URL` (optional, for OpenRouter referer).

**P4:** USDA key optional; document skip behavior.

**P5:** OCR is best-effort; Vision is the AC4 primary path.

**Do not** add Playwright, Serwist, `@tursodatabase/serverless`, or a second manifest file.

Orchestrator: set `dag_status: research-reconciled` after applying the P1 file-list additions above. No edge changes in the mermaid graph.

---

## 7. Sources

### npm (2026-11-26)

`npm view` latest: `next@16.4.6`, `react@19.3.1`, `react-dom@19.3.1`, `typescript@7.0.2` (5.9.3 last 5.x; 6.0.3 last 6.x), `tailwindcss@4.3.5`, `@tailwindcss/postcss@4.3.5`, `postcss@8.5.33`, `vitest@5.1.2`, `vite@8.3.8`, `jsdom@31.0.1`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@8.0.0`, `@testing-library/dom@10.4.2`, `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `@libsql/client@0.18.0`, `zod@4.6.7`, `recharts@3.11.1`, `lucide-react@1.81.0`, `tesseract.js@7.0.0`, `eslint@9.39.5` / latest `10.15.0`, `eslint-config-next@16.4.6`, `@types/node@24.19.4` (latest 26.x unused), `@types/react@19.3.3`, `@types/react-dom@19.3.0`, `react-is@19.3.1`, `create-next-app@16.4.6`.

### Official docs

- Next.js 16.4: cookies, async params, `serverExternalPackages` (includes `@libsql/client` + `libsql`), PWA guide, TypeScript 7, route `runtime` — https://nextjs.org/docs/app/api-reference/functions/cookies · https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages · https://nextjs.org/docs/app/guides/progressive-web-apps · https://nextjs.org/docs/app/api-reference/config/typescript · https://nextjs.org/docs/app/guides/upgrading/version-15
- Tailwind v4 PostCSS + dark variant — https://tailwindcss.com/docs/installation/using-postcss · https://tailwindcss.com/docs/dark-mode
- Drizzle Turso / libsql / json text / kit dialect — https://orm.drizzle.team/docs/get-started/turso-new · https://orm.drizzle.team/docs/sqlite/drizzle-config-file · https://orm.drizzle.team/docs/indexes-constraints
- Turso `@libsql/client` `:memory:` / `file:` / transactions — https://docs.turso.tech/sdk/ts/reference
- Zod 4 — https://github.com/colinhacks/zod (v4.6.7 docs)
- Vitest jsdom + jest-dom — https://vitest.dev
- Recharts 3 React 19 peers — https://github.com/recharts/recharts
- OpenRouter Chat Completions, structured outputs, errors, image inputs — https://openrouter.ai/docs/api_reference/overview · https://openrouter.ai/docs/guides/features/structured-outputs · https://openrouter.ai/docs/api-reference/errors · https://openrouter.ai/docs/guides/overview/multimodal/image-understanding · https://openrouter.ai/blog/tutorials/send-image-to-llm/
- Open Food Facts API — https://openfoodfacts.github.io/openfoodfacts-server/api/ (15/min product, 10/min search, User-Agent required)
- USDA FDC API — https://fdc.nal.usda.gov/api-guide (key required, 1000/hour)
- Tesseract.js API — https://github.com/naptha/tesseract.js/blob/master/docs/api.md
