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
