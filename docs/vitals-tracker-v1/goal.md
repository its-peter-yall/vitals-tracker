# Goal Specification: Vitals & Nutrient Care Tracker (`vitals-tracker-v1`)

> **Workflow:** MAW (`workflow: maw`)  
> **Scope:** Phase 1 — Core Foundation (MVP)  
> **Status:** Approved Design Specification (Paused after Goal & DAG construction)

---

## 1. Purpose & Vision

Build a calm, ultra-simple, mobile-first Progressive Web Application (PWA) that helps people on daily medication—especially non-tech-savvy older adults and family caregivers—effortlessly track the vitamins, minerals, essential nutrients, and medicines they take every day.

The primary design lens is **radical simplicity for someone completely new to technology**:
- Guided setup that hides everything irrelevant so the daily screen stays uncluttered.
- Minimal typing via quick-tap presets, saved repetitive medicines, and camera-based medicine recognition.
- Calm, modern, minimalistic dual-chromatic UI with Light & Dark modes, large legible typography, and forgiving Undo actions.
- Safe, plain-language condition-aware nutritional alerts (e.g., high sugar caution for diabetes, high sodium caution for high blood pressure) without ever fabricating medical readings.

---

## 2. Scope Boundaries & Phased Roadmap

### In Scope — Phase 1 (`vitals-tracker-v1`)
1. **Lightweight Accounts & Persistent Sessions:** Simple signup/login with long-lived `HttpOnly` sessions so a mother stays signed in after opening the home-screen icon, while a family member can log in remotely to set up trackers or check daily logs.
2. **Guided Custom Tracker Creation Wizard:** Step-by-step creation of multiple trackers (`Name & Health Focus` → `Vitamins` → `Minerals` → `Essential Nutrients`) with editable daily reference targets.
3. **Daily Tracker Home Screen:** Shows only the selected nutrients for that tracker, local-date switcher, condition caution banner, big **+ Add Food** and **+ Add Medicine** actions, and Today's Log with 8-second Undo toast + 1-tap edit/delete.
4. **Food Logging (`g` / `ml`) & Hybrid Lookup:** Fast search across saved/recent foods and a curated local catalog (regional home-cooked + global staples with common aliases), with 1-tap fallback to open food APIs (OpenFoodFacts / USDA) and OpenRouter AI estimation (clearly labeled *Estimated*), automatically caching confirmed foods.
5. **Medicine & Supplement Logging (Photo Scan, Name, & 1-Tap "My Medicines"):**
   - Upload or snap a photo of a medicine strip/bottle → server-side **OpenRouter Vision AI** (user-configured API key & selectable vision model) with optional **Tesseract.js OCR fallback** behind a pluggable interface.
   - Explicit **1-tap Confirm Card** (never silently auto-logged) displaying detected name, category (`supplement`, `prescription`, or `both`), extracted vitamin/mineral amounts or dose/food notes, and confidence label.
   - Confirmed supplements add vitamin/mineral quantities directly into daily tracker totals; confirmed prescription medicines log doses taken and display plain-language food/nutrient notes.
   - Every confirmed or manually logged medicine is saved in **My Medicines**, allowing 1-tap repeat logging on future days without taking photos again.
6. **Safe Condition-Aware Impact Alerts:** Deterministic rules engine flagging nutritional load cautions (e.g., high sugar/glycemic load when `diabetes` flag is active; high sodium when `hypertension` flag is active) strictly framed as nutritional guidance.
7. **Per-Tracker Analytics Page:** Clean `7d` / `30d` view per tracker showing dual-chromatic trend charts for tracked nutrients, average goal completion, **Needs Attention** vs. **On Track** highlights, caution-day indicators, and medicine adherence summary.
8. **Modern Minimalistic Dual-Chromatic PWA UI:** High-contrast dual-chromatic theme tokens with persisted Light / Dark / System mode, 18px+ base body text, ≥48px touch targets, installable PWA manifest & service worker.

### Out of Scope — Reserved for Later Phases
- **Phase 2:** Direct body-vitals measurement logging (BP cuff readings, glucometer blood sugar logs, pulse, weight, SpO2), push notification medication reminders, voice food entry, and multi-language localization.
- **Phase 3:** Dedicated multi-role Caregiver portal with family invite links, doctor-ready weekly PDF reports, and comprehensive clinical drug–drug / drug–nutrient interaction databases.

---

## 3. User Experience & Visual Design System

### Aesthetic & Accessibility Rules
- **Style:** Modern, minimalistic, uncluttered, generous whitespace, card-based hierarchy.
- **Color Palette (Dual-Chromatic):** Two harmonious chromatic accents on crisp neutral surfaces—specifically a calm **Deep Teal / Emerald** primary accent (growth, wellness, on-track progress) paired with a warm **Amber / Terracotta** secondary accent (gentle attention, condition cautions, medicine highlights)—strictly maintaining WCAG AA (≥4.5:1) contrast in both **Light** and **Dark** modes.
- **Typography & Ergonomics:** Clean sans-serif (`Inter` / system UI fallback), `18px` base body font size, tabular numerals for quantities and progress percentages, ≥48px minimum touch targets on mobile.
- **Navigation:** Simple persistent top bar (`Trackers`, `Settings` with quick Light/Dark toggle) and inside any tracker a clear two-tab switch (`Today` | `Analytics`).

### Core User Flows
1. **Create Tracker Wizard (`/trackers/new`):**
   - Step 1: Enter tracker name (e.g., *"Amma's Daily Care"*) and toggle optional health flags (`Diabetes / Blood Sugar Watch`, `High Blood Pressure / Sodium Watch`).
   - Step 2: Select **Vitamins** from clear tap-cards (`A, B1, B2, B3, B6, B9/Folate, B12, C, D, E, K`).
   - Step 3: Select **Minerals** (`Calcium, Iron, Magnesium, Potassium, Sodium, Zinc, Iodine, Selenium, Phosphorus`).
   - Step 4: Select **Essential Nutrients** (`Protein, Fiber, Total Sugars, Added Sugars, Carbohydrates, Healthy Fats, Water`) and optionally adjust daily targets (defaults pre-filled from standard adult daily guidelines; note that enabling `diabetes` recommends including `Total Sugars`/`Added Sugars`/`Carbohydrates`, and `hypertension` recommends `Sodium`/`Potassium`, while still keeping selection user-controlled).
2. **Tracker Today View (`/trackers/[id]`):**
   - Date switcher (`Yesterday` / `Today` / date picker using local `YYYY-MM-DD`).
   - Condition Caution Banner (shown only when `impact-engine` flags a caution).
   - Progress cards exclusively for selected `tracker_nutrients` showing `logged / target unit` and subtle progress bar.
   - Sticky dual bottom action bar: **+ Add Food** and **+ Add Medicine**.
   - Today's Log list with timestamps, source icons, and 1-tap edit/delete.
3. **Add Food Sheet:**
   - Shows frequent/recent foods + live search input → pick a food or tap **Search Online / AI Estimate** for unlisted dishes.
   - Enter quantity in `g` or `ml` (with quick-tap chips: `50`, `100`, `150`, `250`).
   - Live nutrient preview for this tracker's selected nutrients → **Save** → 8-second Undo toast.
4. **Add Medicine Sheet:**
   - Top section: **My Medicines** (saved 1-tap cards showing name, category badge, default dose—tap once to log immediately).
   - Action buttons: **Scan Medicine Photo** (mobile camera / image upload), **Search / Type Name**, or **Add Manually**.
   - Scan flow opens **Medicine Confirm Card** showing extracted `brandName`, `genericName`, `category` (`Supplement` / `Prescription` / `Both`), confidence badge (`High` / `Medium` / `Low — Please Double-Check`), editable nutrient amounts (for supplements) or dose/schedule & plain-language food/nutrient notes (for prescriptions), plus **Confirm & Log**, **Retake Photo**, or **Try Local OCR**.
5. **Per-Tracker Analytics (`/trackers/[id]/analytics`):**
   - Range toggle: `7 Days` | `30 Days`.
   - Summary strip: Average daily target completion, active days logged, caution days count.
   - **Needs Attention** & **On Track** cards highlighting tracked nutrients consistently low or crossing caution limits.
   - Clean dual-chromatic trend chart per selected nutrient (selectable chip strip to focus any tracked nutrient without visual clutter).
   - **Medicine Consistency** section showing logged days for saved medicines used in this tracker.

---

## 4. Technical Architecture & Isolated Modules

### Stack
- **Framework:** Next.js (App Router, React, TypeScript)
- **Styling & Charts:** Tailwind CSS with CSS custom property theme tokens (Light/Dark dual-chromatic system) + Recharts for accessible analytics charts
- **PWA:** Web App Manifest (`public/manifest.json`), app icons, and lightweight Service Worker (`public/sw.js`) for installability and static asset caching
- **Database:** Drizzle ORM + `@libsql/client`
  - Development: local SQLite file (`file:local.db`)
  - Production: **Turso** (`libsql://...` + `DATABASE_AUTH_TOKEN`)
- **Validation:** `zod` for all API request payloads, environment variables, and AI JSON outputs
- **Testing:** Vitest + Testing Library (unit & in-memory libSQL integration tests)

### Module Boundaries (`src/lib/*`)
Every module owns one focused responsibility and exposes a clean typed contract:

| Module | Path | Responsibility | Dependencies |
| :--- | :--- | :--- | :--- |
| **Database** | `src/db/` | Drizzle schema, libSQL client factory (local SQLite / Turso), in-memory test DB factory, seed modules | `@libsql/client`, `drizzle-orm` |
| **OpenRouter Client** | `src/lib/openrouter/` | Server-only HTTP wrapper for OpenRouter chat/vision completions with 20s timeout, structured JSON extraction, model allow-list, and typed error codes | Node `fetch`, `zod` |
| **Auth** | `src/lib/auth/` | Salted `scrypt` password hashing, cryptographic session tokens, 90-day `HttpOnly` cookie management, `requireUser()` guard | `src/db/`, Node `crypto` |
| **Nutrients** | `src/lib/nutrients/` | Canonical catalog of vitamins, minerals, and essential nutrients (units, labels, daily targets) + pure `g`/`ml` scaling and summation math | None (pure TypeScript) |
| **Impact Engine** | `src/lib/impact/` | Pure deterministic rules computing safe directional cautions from daily nutrient totals and tracker `healthFlags` | `src/lib/nutrients/` |
| **Food Resolver** | `src/lib/foods/` | Hybrid waterfall lookup (user saved → local curated with aliases → OpenFoodFacts/USDA → OpenRouter fallback), Zod validation, confirmed-food caching | `src/db/`, `src/lib/openrouter/`, `src/lib/nutrients/` |
| **Medicine Recognizer** | `src/lib/medicines/` | Pluggable `MedicineRecognizer` interface with `OpenRouterVisionProvider` (primary) and `OcrFallbackProvider` (Tesseract.js fallback), image validation, confidence scoring, saved medicine CRUD | `src/db/`, `src/lib/openrouter/`, `src/lib/nutrients/`, `tesseract.js` |
| **Trackers & Analytics** | `src/lib/trackers/`, `src/lib/analytics/` | Tracker CRUD, intake log persistence with immutable nutrient snapshots, local-date daily summary, 7d/30d analytics aggregation | `src/db/`, `src/lib/nutrients/`, `src/lib/impact/` |

---

## 5. Data Model (SQLite / Turso via Drizzle)

All 7 tables use string UUID primary keys and ISO timestamps (or `YYYY-MM-DD` local dates for daily logs):

1. **`users`**: `id`, `email` (unique), `name`, `passwordHash`, `theme` (`"system" | "light" | "dark"`), `visionModel` (nullable string overriding default env vision model), `createdAt`.
2. **`sessions`**: `id`, `userId` (FK → `users.id` cascade), `tokenHash` (unique), `expiresAt`, `createdAt`.
3. **`trackers`**: `id`, `userId` (FK → `users.id` cascade), `name`, `healthFlagsJson` (JSON array of `"diabetes" | "hypertension"`), `createdAt`, `updatedAt`.
4. **`tracker_nutrients`**: `id`, `trackerId` (FK → `trackers.id` cascade), `nutrientKey`, `dailyTarget` (real), `sortOrder` (integer). Unique index on `(trackerId, nutrientKey)`.
5. **`foods`**: `id`, `userId` (nullable FK → `users.id`; `NULL` = curated global staple), `name`, `aliasesJson` (JSON string array), `defaultUnit` (`"g" | "ml"`), `nutrientsPer100Json` (JSON map of `nutrientKey → number`), `source` (`"curated" | "open_api" | "ai_confirmed" | "manual"`), `createdAt`.
6. **`medicines`**: `id`, `userId` (nullable FK → `users.id`; `NULL` = curated global item, non-null = user's "My Medicines" cabinet), `brandName`, `genericName` (nullable), `category` (`"supplement" | "prescription" | "both"`), `defaultDoseLabel`, `nutrientsPerDoseJson` (JSON map of `nutrientKey → number`), `notes` (nullable plain-language food/nutrient guidance), `scheduleHint` (nullable), `source` (`"curated" | "vision_confirmed" | "ocr_confirmed" | "manual"`), `createdAt`.
7. **`intake_logs`**: `id`, `trackerId` (FK → `trackers.id` cascade), `userId` (FK → `users.id` cascade), `logDate` (`YYYY-MM-DD` user-local date), `loggedAt`, `entryType` (`"food" | "medicine"`), `foodId` (nullable FK), `medicineId` (nullable FK), `displayName` (immutable snapshot), `quantity` (real), `unit` (`"g" | "ml" | "dose"`), `computedNutrientsJson` (immutable snapshot storing all computed nutrients from the food/supplement, not only the tracker's display subset, so condition alerts remain accurate even if sugar/sodium is not pinned as a display card). Indexed on `(trackerId, logDate)` and `(userId, logDate)`.

> **Unit Conversion Rule:** Foods store baseline values per `100 g` or `100 ml` according to `defaultUnit`. Users default to `defaultUnit` and may switch between `g` and `ml` using a `1 ml = 1 g` baseline approximation so everyday logging stays effortless and predictable.

---

## 6. Error Handling, Medical Safety & Security

### Error Handling
- **Unreadable / Glare-Heavy Photos:** Low-confidence or unreadable Vision responses never error harshly; the UI displays plain-language lighting tips with 1-tap **Retake Photo**, **Try Local OCR**, or **Enter Manually**.
- **OpenRouter Timeouts / Failures / Invalid JSON:** Enforced 20-second timeout + strict `zod` parsing. Failures return typed user-friendly messages and direct fallback to local search, OCR fallback, or manual entry.
- **Accidental Logs:** Every newly logged item displays an 8-second **Undo** toast backed by `DELETE /api/trackers/[id]/logs/[logId]`.

### Medical Safety Guardrails
- **Explicit 1-Tap Confirmation:** Neither Vision-scanned medicines nor AI-estimated foods are ever auto-logged without user review on a Confirm Card displaying source and confidence (`Verified`, `AI High Confidence`, `AI Medium Confidence`, or `Low — Please Double-Check`).
- **Safe Directional Impact Alerts:** `impact-engine` evaluates transparent nutritional thresholds across the day's full `computedNutrientsJson` totals (e.g., for `diabetes`: Total Sugars > 35g or Added Sugars > 25g triggers a warning; for `hypertension`: Sodium > 2000mg triggers a warning; using custom tracker targets when explicitly set) and surfaces calm nutritional guidance (*"High sugar logged today — may raise blood sugar. Consider checking your reading."*). It **never** predicts or displays simulated mg/dL or mmHg medical readings.
- **Visible Scope Notice:** Plain-language disclaimer on onboarding and Settings clarifying the app is a daily awareness companion, not medical advice or a substitute for doctors, pharmacists, glucometers, or BP monitors.

### Security & Privacy
- **Server-Only Credentials:** `OPENROUTER_API_KEY` and `DATABASE_AUTH_TOKEN` live strictly in server environment variables and are never bundled into client JavaScript.
- **Zero Photo Persistence:** Uploaded medicine images are compressed client-side (~1024px JPEG, <400KB), validated server-side (`image/jpeg`, `image/png`, `image/webp`; ≤ 2 MB), forwarded in-memory to OpenRouter, and immediately discarded; only user-confirmed structured medicine metadata is stored in SQLite/Turso.
- **Strict Tenant Isolation:** Every database query for trackers, logs, settings, and user-owned foods/medicines filters by the authenticated `session.userId`.

---

## 7. Acceptance Criteria

- **AC1 (Lightweight Auth & Persistent Access):** Users can sign up, log in, log out, stay signed in via persistent `HttpOnly` cookie, configure theme/vision model in Settings, and never access another user's data.
- **AC2 (Guided Custom Tracker Wizard):** Users can create multiple trackers via the step-by-step wizard (Name & Health Flags → Vitamins → Minerals → Essential Nutrients) with customizable targets; each tracker displays only its selected nutrients.
- **AC3 (Food Logging by `g` / `ml` & Hybrid Resolver):** Users can search local curated staples (including everyday aliases) or trigger open-API / OpenRouter AI fallback, scale nutrients accurately by `g` or `ml` with quick-tap presets, and cache newly confirmed foods automatically.
- **AC4 (Medicine Photo Scan via OpenRouter Vision + OCR Fallback):** Users can upload/capture a medicine photo validated server-side (≤ 2 MB, in-memory only), receive structured extraction via the configured OpenRouter Vision model (or optional OCR fallback), and review a Confirm Card with confidence indicators before saving.
- **AC5 (Supplements & Prescription Medicines):** Confirmed supplements add extracted vitamin/mineral amounts into daily tracker totals; prescription medicines log doses taken and display plain-language food/nutrient notes; combined (`both`) entries handle both behaviors.
- **AC6 (1-Tap Repetitive Medicines — "My Medicines"):** Any confirmed or manually added medicine is stored in the user's personal "My Medicines" list and can be re-logged in 1 tap on subsequent days without re-scanning or calling OpenRouter.
- **AC7 (Condition-Aware Impact Alerts):** Trackers with `diabetes` or `hypertension` flags display plain-language directional caution banners when daily sugar or sodium thresholds are exceeded, without generating simulated clinical measurements.
- **AC8 (Local-Date Logs & Forgiving Undo):** Logs group strictly by local `YYYY-MM-DD`, compute immutable nutrient snapshots, support immediate Undo toast deletion, and allow 1-tap quantity editing or deletion from Today's Log.
- **AC9 (Per-Tracker Analytics Page):** Each tracker provides a `7d` / `30d` Analytics view displaying nutrient trend charts, average goal completion, Needs Attention vs. On Track highlights, caution-day indicators, and medicine adherence consistency.
- **AC10 (Dual-Chromatic Minimalistic Accessible PWA):** Installable PWA (`manifest.json` + service worker) with dual-chromatic Light & Dark themes, 18px+ readable typography, ≥48px touch targets, and clean mobile/desktop layouts.
- **AC11 (Graceful Failure Recovery & Medical Safety):** Unreadable photos, OpenRouter failures/timeouts, and malformed AI JSON recover gracefully into Retake / OCR Fallback / Manual Entry without crashes or raw error output; disclaimer is visible.
- **AC12 (Turso Readiness & Automated Verification):** Drizzle + `@libsql/client` works seamlessly with local SQLite and Turso (`libsql://`), and all Vitest unit/integration tests, TypeScript checks, lint checks, and production build pass cleanly.
