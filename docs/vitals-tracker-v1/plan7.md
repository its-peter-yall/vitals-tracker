# P7 — Trackers Home, Guided Wizard, Daily View, Food/Medicine Logging & Confirm Card UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete mother-first, mobile-first dual-chromatic UI for the Trackers Home dashboard, 4-step Guided Tracker Wizard, Tracker Today View with local-date switching and 8-second Undo, Food `g`/`ml` Logging sheet, and Medicine Photo Scan + Confirm Card + 1-Tap "My Medicines" sheet.

**Architecture:** Build focused client components over the already-implemented P1 theme primitives, P2 auth/settings routes, P3 nutrient catalog/scaling math, P4 food resolver APIs, P5 medicine scan/cabinet APIs, and P6 tracker/log/summary APIs. Keep `src/app/trackers/[id]/layout.tsx` as a thin Next.js 16 async Server Component hosting the `Today` | `Analytics` tabs (shared with P8), while keeping all interactive pages and sheets as `"use client"` components with strict local-calendar date math, explicit confirmation before saving AI/scanned drafts, and retry-safe two-step persistence.

**Tech Stack:** Next.js 16.4.6 App Router, React 19.3.1, TypeScript 7.0.2 (`strict`), Tailwind CSS v4.3.5 (dual-chromatic CSS tokens), `lucide-react` 1.81.0, Vitest 5.1.2, jsdom 31.0.1, `@testing-library/react` 16.3.3, `@testing-library/jest-dom` 8.0.0. No new dependencies.

---

## Owned Files & Responsibility Map

Do **not** modify any files outside this list, do **not** edit backend routes/schemas/services, and do **not** plan or create P8 analytics page files.

| File | Responsibility |
| --- | --- |
| `src/components/trackers/local-date.ts` | Local-calendar `YYYY-MM-DD` formatter, day stepper, and plain-language date labels (`Today`, `Yesterday`, formatted date). |
| `src/components/trackers/tracker-tabs.tsx` | Sub-navigation bar (`← Trackers`, `Settings`) + `Today` \| `Analytics` tab switcher (`usePathname()`). |
| `src/components/trackers/caution-banner.tsx` | Condition-aware nutritional caution banner rendered only when `alerts.length > 0`. |
| `src/components/trackers/nutrient-progress-card.tsx` | Selected-only nutrient progress card distinguishing `goal` vs. `upper` references and unreported vs. zero values. |
| `src/components/trackers/daily-log-list.tsx` | Today's Log list with timestamps, source icons, `medicineNotes`, inline quantity edit, and remove trigger. |
| `src/components/wizard/nutrient-picker.tsx` | Reusable selectable tap-card grid for Vitamins, Minerals, and Essential Nutrients with health-flag recommendation hints. |
| `src/components/wizard/tracker-wizard.tsx` | 4-step Guided Create Tracker Wizard preserving `customDailyTarget` provenance. |
| `src/components/logging/image-compress.ts` | Client-side JPEG/PNG/WebP validation, ≤1024px dimension scaling, and `<400 KB` JPEG compression (hard cap `2 MB`). |
| `src/components/logging/food-log-modal.tsx` | Food Logging sheet: recent/local search, deliberate Online/AI resolve, *Estimated* review, manual entry fallback, `g`/`ml` + `50/100/150/250` presets, live selected-nutrient preview. |
| `src/components/logging/medicine-confirm-card.tsx` | Explicit Confirm Card with confidence badge, editable brand/generic/category/dose/notes/nutrients, Retake/OCR/Manual actions. |
| `src/components/logging/medicine-log-modal.tsx` | Medicine Logging sheet: top 1-tap **My Medicines** list, compressed photo scan (`POST /api/medicines/scan` + optional `?mode=ocr`), curated picker, manual entry, retry-safe save & log. |
| `src/app/page.tsx` | Trackers Home dashboard, account theme reconciliation, signed-out welcome + care notice, inline tracker delete. |
| `src/app/trackers/new/page.tsx` | Wizard host page with `← Trackers` link and post-create navigation to `/trackers/[id]`. |
| `src/app/trackers/[id]/layout.tsx` | Async Server Component layout awaiting `params` and rendering `<TrackerTabs trackerId={id} />` around `{children}`. |
| `src/app/trackers/[id]/page.tsx` | Daily Tracker Today view wiring date switcher, caution banner, progress cards, Today's Log, sticky dual action bar, modals, and 8-second `<UndoToast>`. |
| `tests/tracker-ui.test.tsx` | Complete jsdom + Testing Library test suite for all P7 components and flows. |

---

## Upstream Contracts (Self-Contained Reference)

Work from the repository root in **Windows PowerShell 5.1**. Run commands on separate lines (avoid bash `&&` chaining unless explicitly shown). Stop on any nonzero exit except expected RED steps. Stage only the files listed in each task.

### 1. P1 Design Tokens & UI Primitives (Do Not Edit)
- **Theme tokens (`src/app/globals.css`):** `bg-canvas`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `bg-primary`, `text-primary`, `text-primary-fg`, `border-primary`, `bg-accent`, `text-accent`, `text-accent-fg`, `border-accent`, `bg-caution`, `text-caution-fg`. Body defaults to `18px` (`--text-base: 1.125rem`) and `tabular-nums`. All interactive controls must use `min-h-12` (≥48px touch targets).
- **`@/components/ui/button`:** `Button` (`variant?: "primary" | "secondary" | "outline"`, defaults `type="button"` and `min-h-12 min-w-12`).
- **`@/components/ui/card`:** `Card` (`rounded-2xl border border-border bg-surface p-4 sm:p-6`).
- **`@/components/ui/undo-toast`:** `UndoToast({ message, onUndo, onExpire })` and `UNDO_WINDOW_MS = 8_000`. Note: `UndoToast` uses internal `visible` state initialized on mount, so mount each new toast with a unique React `key` (e.g., `key={toast.id}`).
- **`@/components/theme-provider`:** `ThemeProvider`, `useTheme()` → `{ mode, setMode }`.
- **`@/components/ui/theme-init`:** `THEME_STORAGE_KEY = "vitals-tracker-theme"`, `isThemeMode(v)`, `type ThemeMode = "system" | "light" | "dark"`.
- **Next.js root rewrite:** `next.config.ts` has a `fallback` rewrite `/` → `/icons/foundation.html`. Creating `src/app/page.tsx` automatically supersedes it; do not edit `next.config.ts`.

### 2. P2 Auth & Settings APIs
- `GET /api/auth/me` → `200 { user: { id, email, name, theme: "system" | "light" | "dark", visionModel: string | null } }` or `401 { error }`.
- Unauthenticated responses (`401`) on `/trackers/new` and `/trackers/[id]` redirect via `window.location.replace("/login")`. On `/`, `401` renders a calm signed-out welcome view with links to `/login` and `/signup` plus the "About this tracker" scope notice.
- **Theme reconciliation on `/`:** When `GET /api/auth/me` succeeds and `localStorage.getItem(THEME_STORAGE_KEY)` is `null`, call `setMode(user.theme)` if `isThemeMode(user.theme)` so a new device inherits the user's saved account theme.

### 3. P3 Client-Safe Nutrient Catalog, Calculator & Impact Types
- `@/lib/nutrients/catalog` (client-safe): `NUTRIENT_CATALOG`, `NUTRIENT_KEYS`, `isNutrientKey`.
  - Categories: `vitamin` (11 keys: `vitaminA`, `vitaminB1`, `vitaminB2`, `vitaminB3`, `vitaminB6`, `vitaminB9`, `vitaminB12`, `vitaminC`, `vitaminD`, `vitaminE`, `vitaminK`), `mineral` (9 keys: `calcium`, `iron`, `magnesium`, `potassium`, `sodium`, `zinc`, `iodine`, `selenium`, `phosphorus`), `essential` (7 keys: `protein`, `fiber`, `totalSugars`, `addedSugars`, `carbohydrates`, `healthyFats`, `water`).
- `@/lib/nutrients/calculator` (client-safe):
  - `scaleFoodNutrients({ defaultUnit, nutrientsPer100 }, quantity, unit)` → `NutrientMap` (`1 ml = 1 g` approximation when unit differs from `defaultUnit`; returns `{}` for `quantity === 0`).
  - `roundNutrientForDisplay(amount)` → `number` rounded to 4 decimals (for display only; never persist rounded values).
- `@/lib/nutrients/types`: `NutrientKey`, `NutrientCategory`, `NutrientUnit`, `NutrientMap`, `FoodQuantityUnit`.
- `@/lib/impact/types`: `HealthFlag` (`"diabetes" | "hypertension"`), `ImpactAlert` (`{ healthFlag, message, triggers }`), `ImpactTrigger` (`{ nutrientKey, total, threshold, unit }`).

### 4. P4 Food APIs (`@/lib/foods/schemas` types are client-safe)
- `GET /api/foods/search?q=...` → `200 { foods: SavedFood[] }` (max 20; empty `q` returns recently logged visible foods + saved foods; local-only, never calls external providers).
  - `SavedFood`: `{ id, name, aliases: string[], defaultUnit: "g" | "ml", nutrientsPer100: NutrientMap, source: "curated" | "open_api" | "ai_confirmed" | "manual", estimated: boolean }`.
- `POST /api/foods/resolve` (`Content-Type: application/json`, body `{ query: string }`):
  - `200 { kind: "saved" | "curated", food: SavedFood }`
  - `200 { kind: "draft", draft: FoodDraft }` where `FoodDraft` has `{ name, aliases, defaultUnit, nutrientsPer100, provider: "open_food_facts" | "usda" | "openrouter", label: "Open Food Facts" | "USDA FoodData Central" | "Estimated", estimated: boolean }` (no `id`).
  - `404 | 422 | 503 { error: string }` → show calm message and offer manual entry.
- `POST /api/foods` (`Content-Type: application/json`, **strict object** — send ONLY these fields):
  - Body: `{ confirmed: true, source: "open_api" | "ai_confirmed" | "manual", name, aliases, defaultUnit, nutrientsPer100 }`.
  - **Validation constraints:** `nutrientsPer100` must have **at least 1** canonical key with a finite non-negative number; `addedSugars <= totalSugars` when both present; values bounded by `100g` (for `g`) or `150g` (for `ml`) per 100 units.
  - Returns `201 { food: SavedFood }` (or `200 { food: SavedFood }` on same-user normalized name+unit replay, first confirmation wins).

### 5. P5 Medicine APIs (`@/lib/medicines/types` is client-safe)
- `GET /api/medicines` → `200 { medicines: CabinetMedicine[], curated: CabinetMedicine[] }`.
  - `CabinetMedicine`: `{ id, brandName, genericName, category: "supplement" | "prescription" | "both", defaultDoseLabel, nutrientsPerDose: NutrientMap, notes, scheduleHint, source, createdAt }`.
- `POST /api/medicines` (`Content-Type: application/json`, **strict object**):
  - Body: `{ brandName, genericName?: string | null, category, defaultDoseLabel, nutrientsPerDose, notes?: string | null, scheduleHint?: string | null, source?: "manual" | "vision_confirmed" | "ocr_confirmed" }`.
  - **CRITICAL:** Optional text fields (`genericName`, `notes`, `scheduleHint`) reject empty string `""` (`min(1)`). Always normalize blank strings to `null`.
  - Returns `201 { medicine: CabinetMedicine }`.
- `DELETE /api/medicines/[id]` → `200 { ok: true }` or `404`.
- `POST /api/medicines/scan` (default Vision) and `POST /api/medicines/scan?mode=ocr` (explicit user-triggered OCR fallback only):
  - **CRITICAL:** Send the compressed `Blob` as the **raw request body** with header `Content-Type: image/jpeg | image/png | image/webp` (no `FormData`, no base64 JSON). Max `2 MB`.
  - `200 ScanResult`: `{ requiresConfirmation: true, source: "vision" | "ocr", code: "REVIEW" | "UNREADABLE" | "VISION_UNAVAILABLE" | "OCR_UNAVAILABLE", draft: MedicineScanDraft | null, confidence: { level: "high" | "medium" | "low", score: number | null }, message: string | null, actions: ("retake" | "ocr" | "manual")[] }`.
  - `400 | 413 | 415 { code, error }`.
  - Scan **never** saves a medicine or logs intake.

### 6. P6 Tracker, Log & Summary APIs (Use `import type` from `@/lib/trackers/service`)
- `GET /api/trackers` → `200 { trackers: Tracker[] }`.
- `POST /api/trackers` → body `{ name, healthFlags?: HealthFlag[], nutrients: { nutrientKey: NutrientKey, customDailyTarget?: number }[] }` → `201 { tracker: Tracker }`.
  - **Target provenance:** Omit `customDailyTarget` for untouched/reset defaults; include `customDailyTarget` whenever the user explicitly edited the value (even if numerically equal to catalog default).
- `GET /api/trackers/[id]` → `200 { tracker: Tracker }` or `404`.
- `DELETE /api/trackers/[id]` → `200 { ok: true }`.
- `GET /api/trackers/[id]/summary?date=YYYY-MM-DD` → `200 { date, progress, alerts }` (`DailySummary`).
  - Each `progress` item: `{ nutrientKey, dailyTarget, isCustomTarget, sortOrder, label, unit, targetKind: "goal" | "upper", amount: number, hasAmount: boolean }`.
- `GET /api/trackers/[id]/logs?date=YYYY-MM-DD` → `200 { logs: IntakeLog[] }` (newest first).
  - `IntakeLog`: `{ id, trackerId, logDate, loggedAt, entryType: "food" | "medicine", foodId, medicineId, displayName, quantity, unit: "g" | "ml" | "dose", computedNutrientsJson, medicineNotes }`.
- `POST /api/trackers/[id]/logs`:
  - Food: `{ entryType: "food", foodId, quantity, unit: "g" | "ml", logDate }` → `201 { log: IntakeLog }`.
  - Medicine: `{ entryType: "medicine", medicineId, quantity, unit: "dose", logDate }` → `201 { log: IntakeLog }`.
- `PATCH /api/trackers/[id]/logs/[logId]` → `{ quantity }` (`0.000001`–`1_000_000`) → `200 { log: IntakeLog }`.
- `DELETE /api/trackers/[id]/logs/[logId]` → `200 { ok: true }` or `404`.

### 7. Documented API Gaps & Contract Risks (Handled in P7 UI Without Backend Changes)
1. **No global nav links in `src/app/layout.tsx` (P1-owned):** P1's header only renders `Vitals Tracker` text + `<ThemeSelect />`. P7 therefore places accessible `Trackers` and `Settings` links in `/`, `/trackers/new`, and `/trackers/[id]/layout.tsx`.
2. **No backend restore/undelete endpoint for existing log deletions:** `DELETE /api/trackers/[id]/logs/[logId]` permanently removes the log. P7 provides 8-second `<UndoToast>` for **newly added** logs (calls `DELETE` on Undo) AND a client-side 8-second **deferred delete** with `<UndoToast>` for removing an existing log (hides row optimistically, cancels on Undo, commits `DELETE` on expire, unmount, or before a subsequent mutation).
3. **`IntakeLog` omits medicine `defaultDoseLabel` and `category`:** Today's Log formats medicine quantities as `1 dose` / `2 doses`, displays `medicineNotes` when non-null, and shows supplement nutrient contributions when `computedNutrientsJson` is non-empty.
4. **`PATCH /api/trackers/[id]/logs/[logId]` edits `quantity` only:** Inline edit in Today's Log updates `quantity` while displaying `unit` read-only.
5. **`POST /api/foods` requires ≥1 nutrient in `nutrientsPer100`:** For medicine-only trackers (`nutrients: []`), manual food entry falls back to common nutrient fields (`protein`, `carbohydrates`, `totalSugars`, `sodium`) and validates at least one entered amount.
6. **`POST /api/medicines` rejects `""` for optional strings:** Confirm Card normalizes blank `genericName`, `notes`, and `scheduleHint` to `null`.
7. **Header `ThemeSelect` updates `localStorage` only:** `/` reconciles account DB theme via `useTheme().setMode(user.theme)` only when `localStorage.getItem(THEME_STORAGE_KEY)` is absent, avoiding fighting local header toggles.

---

## Task 1: Local-Date Helpers, Tracker Tabs & Shared Tracker Layout

**Files:**
- Create: `src/components/trackers/local-date.ts`
- Create: `src/components/trackers/tracker-tabs.tsx`
- Create: `src/app/trackers/[id]/layout.tsx`
- Create: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** in `tests/tracker-ui.test.tsx` (include the shared jsdom test harness and `next/navigation` mocks used by all subsequent tasks).

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  pathname: "/trackers/t-1",
  params: { id: "t-1" } as Record<string, string>,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, prefetch: vi.fn(), refresh: nav.refresh }),
  usePathname: () => nav.pathname,
  useParams: () => nav.params,
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.refresh.mockReset();
  nav.pathname = "/trackers/t-1";
  nav.params = { id: "t-1" };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("style");
});

describe("Task 1: local-date helpers and tracker layout tabs", () => {
  it("formats local calendar dates without UTC drift and steps days across month boundaries", async () => {
    const { addLocalDays, formatLocalDate, formatFriendlyDate } = await import(
      "@/components/trackers/local-date"
    );
    const localMorning = new Date(2026, 2, 1, 0, 15, 0); // Mar 1, 2026 00:15 local
    expect(formatLocalDate(localMorning)).toBe("2026-03-01");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addLocalDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(formatFriendlyDate("2026-03-01", "2026-03-01")).toBe("Today");
    expect(formatFriendlyDate("2026-02-28", "2026-03-01")).toBe("Yesterday");
    expect(formatFriendlyDate("2026-02-20", "2026-03-01")).toContain("2026");
  });

  it("renders Today and Analytics tabs with active state and Trackers/Settings links in layout", async () => {
    const { default: TrackerLayout } = await import("@/app/trackers/[id]/layout");
    nav.pathname = "/trackers/t-1";
    const element = await TrackerLayout({
      params: Promise.resolve({ id: "t-1" }),
      children: <div>Daily Body</div>,
    });
    render(element);

    expect(screen.getByRole("link", { name: /trackers/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
    const todayTab = screen.getByRole("link", { name: "Today" });
    const analyticsTab = screen.getByRole("link", { name: "Analytics" });
    expect(todayTab).toHaveAttribute("href", "/trackers/t-1");
    expect(todayTab).toHaveAttribute("aria-current", "page");
    expect(todayTab).toHaveClass("min-h-12");
    expect(analyticsTab).toHaveAttribute("href", "/trackers/t-1/analytics");
    expect(analyticsTab).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Daily Body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 1"`
Expected: FAIL resolving `@/components/trackers/local-date` and `@/app/trackers/[id]/layout`.

- [ ] **Step 3: Implement `src/components/trackers/local-date.ts`, `src/components/trackers/tracker-tabs.tsx`, and `src/app/trackers/[id]/layout.tsx`**

`src/components/trackers/local-date.ts`:

```ts
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatLocalDate(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isLocalDateString(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(year, month - 1, day);
  return (
    check.getFullYear() === year &&
    check.getMonth() === month - 1 &&
    check.getDate() === day
  );
}

export function addLocalDays(localDate: string, deltaDays: number): string {
  const match = ISO_DATE.exec(localDate);
  if (!match) return formatLocalDate();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDate(date);
}

export function formatFriendlyDate(localDate: string, today: string = formatLocalDate()): string {
  if (localDate === today) return "Today";
  if (localDate === addLocalDays(today, -1)) return "Yesterday";
  const match = ISO_DATE.exec(localDate);
  if (!match) return localDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatLocalTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
```

`src/components/trackers/tracker-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, Settings } from "lucide-react";

type TrackerTabsProps = {
  trackerId: string;
};

export function TrackerTabs({ trackerId }: TrackerTabsProps) {
  const pathname = usePathname();
  const todayHref = `/trackers/${trackerId}`;
  const analyticsHref = `/trackers/${trackerId}/analytics`;
  const onAnalytics = pathname === analyticsHref || pathname.startsWith(`${analyticsHref}/`);

  const tabBase =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition-colors";
  const activeTab = "bg-primary text-primary-fg";
  const inactiveTab = "text-text hover:bg-canvas";

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span>Trackers</span>
        </Link>
        <Link
          href="/settings"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 font-semibold text-text"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </div>
      <nav
        aria-label="Tracker views"
        className="flex gap-2 rounded-2xl border border-border bg-surface p-1.5"
      >
        <Link
          href={todayHref}
          aria-current={onAnalytics ? undefined : "page"}
          className={`${tabBase} ${onAnalytics ? inactiveTab : activeTab}`}
        >
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          <span>Today</span>
        </Link>
        <Link
          href={analyticsHref}
          aria-current={onAnalytics ? "page" : undefined}
          className={`${tabBase} ${onAnalytics ? activeTab : inactiveTab}`}
        >
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
          <span>Analytics</span>
        </Link>
      </nav>
    </div>
  );
}
```

`src/app/trackers/[id]/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { TrackerTabs } from "@/components/trackers/tracker-tabs";

export default async function TrackerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-4">
      <TrackerTabs trackerId={id} />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 1"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/trackers/local-date.ts src/components/trackers/tracker-tabs.tsx "src/app/trackers/[id]/layout.tsx" tests/tracker-ui.test.tsx
git commit -m "feat(ui): add local-date helpers and shared tracker tabs layout"
```

---

## Task 2: Condition Caution Banner & Selected-Only Nutrient Progress Card

**Files:**
- Create: `src/components/trackers/caution-banner.tsx`
- Create: `src/components/trackers/nutrient-progress-card.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 2: caution banner and nutrient progress cards", () => {
  it("renders nothing when alerts are empty and shows directional caution details when present", async () => {
    const { CautionBanner } = await import("@/components/trackers/caution-banner");
    const empty = render(<CautionBanner alerts={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();

    render(
      <CautionBanner
        alerts={[
          {
            healthFlag: "diabetes",
            message: "Sugar logged today is above the tracker’s reference. Sugary foods and drinks can raise blood sugar.",
            triggers: [{ nutrientKey: "totalSugars", total: 42.34567, threshold: 35, unit: "g" }],
          },
        ]}
      />,
    );
    const region = screen.getByRole("region", { name: /nutritional caution/i });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent(/Sugary foods and drinks can raise blood sugar/i);
    expect(region).toHaveTextContent("Total Sugars: 42.3457 g (reference 35 g)");
    expect(region.textContent).not.toMatch(/mg\/dL|mmHg/i);
  });

  it("renders goal vs upper progress cards and distinguishes unreported amounts from zero", async () => {
    const { NutrientProgressCard } = await import("@/components/trackers/nutrient-progress-card");
    render(
      <div>
        <NutrientProgressCard
          item={{
            nutrientKey: "protein",
            label: "Protein",
            unit: "g",
            dailyTarget: 50,
            isCustomTarget: false,
            sortOrder: 0,
            targetKind: "goal",
            amount: 25.5,
            hasAmount: true,
          }}
        />
        <NutrientProgressCard
          item={{
            nutrientKey: "sodium",
            label: "Sodium",
            unit: "mg",
            dailyTarget: 2000,
            isCustomTarget: true,
            sortOrder: 1,
            targetKind: "upper",
            amount: 2400,
            hasAmount: true,
          }}
        />
        <NutrientProgressCard
          item={{
            nutrientKey: "vitaminD",
            label: "Vitamin D",
            unit: "mcg",
            dailyTarget: 20,
            isCustomTarget: false,
            sortOrder: 2,
            targetKind: "goal",
            amount: 0,
            hasAmount: false,
          }}
        />
      </div>,
    );

    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("25.5 / 50 g")).toBeInTheDocument();
    expect(screen.getByText("51% of daily reference")).toBeInTheDocument();

    expect(screen.getByText("Sodium")).toBeInTheDocument();
    expect(screen.getByText("2400 / 2000 mg")).toBeInTheDocument();
    expect(screen.getByText(/above upper reference/i)).toBeInTheDocument();

    expect(screen.getByText("Vitamin D")).toBeInTheDocument();
    expect(screen.getByText("Not reported yet")).toBeInTheDocument();
    expect(screen.getByText("Reference: 20 mcg")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 2"`
Expected: FAIL resolving `caution-banner` and `nutrient-progress-card`.

- [ ] **Step 3: Implement `caution-banner.tsx` and `nutrient-progress-card.tsx`**

`src/components/trackers/caution-banner.tsx`:

```tsx
"use client";

import { AlertTriangle } from "lucide-react";
import type { ImpactAlert } from "@/lib/impact/types";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import { NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";

type CautionBannerProps = {
  alerts: readonly ImpactAlert[];
};

const flagLabels = {
  diabetes: "Blood Sugar Watch",
  hypertension: "Blood Pressure Watch",
} as const;

export function CautionBanner({ alerts }: CautionBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="Nutritional caution"
      className="space-y-3 rounded-2xl border-2 border-accent bg-caution p-4 text-caution-fg"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="text-lg font-bold">Daily Nutritional Caution</h2>
          {alerts.map((alert) => (
            <div key={alert.healthFlag} className="space-y-1">
              <p className="font-semibold">{flagLabels[alert.healthFlag]}</p>
              <p>{alert.message}</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {alert.triggers.map((trigger) => (
                  <li key={trigger.nutrientKey}>
                    {NUTRIENT_CATALOG[trigger.nutrientKey].label}:{" "}
                    {roundNutrientForDisplay(trigger.total)} {trigger.unit} (reference{" "}
                    {roundNutrientForDisplay(trigger.threshold)} {trigger.unit})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

`src/components/trackers/nutrient-progress-card.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import type { DailySummary } from "@/lib/trackers/service";

export type NutrientProgressItem = DailySummary["progress"][number];

type NutrientProgressCardProps = {
  item: NutrientProgressItem;
};

export function NutrientProgressCard({ item }: NutrientProgressCardProps) {
  const target = roundNutrientForDisplay(item.dailyTarget);
  const amount = item.hasAmount ? roundNutrientForDisplay(item.amount) : null;
  const ratio = item.hasAmount && item.dailyTarget > 0 ? item.amount / item.dailyTarget : 0;
  const percent = Math.round(ratio * 100);
  const barWidth = Math.min(100, Math.max(0, percent));
  const isUpper = item.targetKind === "upper";
  const overUpper = isUpper && item.hasAmount && item.amount > item.dailyTarget;

  return (
    <Card className="space-y-2.5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-text">{item.label}</h3>
        <span className="font-semibold tabular-nums text-text">
          {amount !== null ? `${amount} / ${target} ${item.unit}` : "Not reported yet"}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`${item.label} daily progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={item.hasAmount ? Math.min(100, percent) : 0}
        className="h-3 w-full overflow-hidden rounded-full bg-canvas"
      >
        <div
          className={`h-full rounded-full transition-all ${
            overUpper ? "bg-accent" : isUpper ? "bg-muted" : "bg-primary"
          }`}
          style={{ width: `${item.hasAmount ? barWidth : 0}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
        {!item.hasAmount ? (
          <span>Reference: {target} {item.unit}</span>
        ) : isUpper ? (
          <span className={overUpper ? "font-semibold text-accent" : undefined}>
            {overUpper ? "Above upper reference" : `${percent}% of upper reference`}
          </span>
        ) : (
          <span>{percent}% of daily reference</span>
        )}
        {item.isCustomTarget && <span>Custom target</span>}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 2"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/trackers/caution-banner.tsx src/components/trackers/nutrient-progress-card.tsx tests/tracker-ui.test.tsx
git commit -m "feat(ui): add condition caution banner and nutrient progress cards"
```

---

## Task 3: Today's Log List with Inline Quantity Edit & Delete

**Files:**
- Create: `src/components/trackers/daily-log-list.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 3: daily log list edit and delete", () => {
  it("renders food and medicine logs, displays medicineNotes, edits quantity, and triggers delete", async () => {
    const { DailyLogList } = await import("@/components/trackers/daily-log-list");
    const onEditQuantity = vi.fn().mockResolvedValue(undefined);
    const onDeleteLog = vi.fn();

    render(
      <DailyLogList
        logs={[
          {
            id: "log-1",
            trackerId: "t-1",
            logDate: "2026-11-26",
            loggedAt: "2026-11-26T08:00:00.000Z",
            entryType: "food",
            foodId: "f-1",
            medicineId: null,
            displayName: "Plain whole-milk yogurt",
            quantity: 100,
            unit: "g",
            computedNutrientsJson: { protein: 3.47, calcium: 121 },
            medicineNotes: null,
          },
          {
            id: "log-2",
            trackerId: "t-1",
            logDate: "2026-11-26",
            loggedAt: "2026-11-26T08:15:00.000Z",
            entryType: "medicine",
            foodId: null,
            medicineId: "m-1",
            displayName: "Metformin 500",
            quantity: 1,
            unit: "dose",
            computedNutrientsJson: {},
            medicineNotes: "Take with meals to reduce stomach upset.",
          },
        ]}
        onEditQuantity={onEditQuantity}
        onDeleteLog={onDeleteLog}
      />,
    );

    expect(screen.getByText("Plain whole-milk yogurt")).toBeInTheDocument();
    expect(screen.getByText("100 g")).toBeInTheDocument();
    expect(screen.getByText("Metformin 500")).toBeInTheDocument();
    expect(screen.getByText("1 dose")).toBeInTheDocument();
    expect(screen.getByText("Take with meals to reduce stomach upset.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit plain whole-milk yogurt/i }));
    const qtyInput = screen.getByLabelText(/quantity \(g\)/i);
    fireEvent.change(qtyInput, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onEditQuantity).toHaveBeenCalledWith("log-1", 150));

    fireEvent.click(screen.getByRole("button", { name: /delete metformin 500/i }));
    expect(onDeleteLog).toHaveBeenCalledWith(expect.objectContaining({ id: "log-2" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 3"`
Expected: FAIL resolving `daily-log-list`.

- [ ] **Step 3: Implement `src/components/trackers/daily-log-list.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Pill, Trash2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import { isNutrientKey, NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import type { IntakeLog } from "@/lib/trackers/service";
import { formatLocalTime } from "./local-date";

type DailyLogListProps = {
  logs: readonly IntakeLog[];
  onEditQuantity: (logId: string, quantity: number) => Promise<void>;
  onDeleteLog: (log: IntakeLog) => void;
};

function formatQuantity(quantity: number, unit: IntakeLog["unit"]): string {
  const rounded = roundNutrientForDisplay(quantity);
  if (unit === "dose") return `${rounded} ${rounded === 1 ? "dose" : "doses"}`;
  return `${rounded} ${unit}`;
}

export function DailyLogList({ logs, onEditQuantity, onDeleteLog }: DailyLogListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState("");

  function startEdit(log: IntakeLog) {
    setEditingId(log.id);
    setDraftQty(String(log.quantity));
    setEditError("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, logId: string) {
    event.preventDefault();
    const parsed = Number(draftQty);
    if (!Number.isFinite(parsed) || parsed < 0.000001 || parsed > 1_000_000) {
      setEditError("Enter a valid number greater than 0.");
      return;
    }
    setSavingId(logId);
    setEditError("");
    try {
      await onEditQuantity(logId, parsed);
      setEditingId(null);
    } catch {
      setEditError("Could not update quantity. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (logs.length === 0) {
    return (
      <Card>
        <p className="text-muted">Nothing logged for this day yet. Tap + Add Food or + Add Medicine below.</p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Logged items">
      {logs.map((log) => {
        const isEditing = editingId === log.id;
        const isFood = log.entryType === "food";
        const nutrientHighlights = Object.entries(log.computedNutrientsJson)
          .filter(([key, value]) => isNutrientKey(key) && typeof value === "number" && value > 0)
          .slice(0, 3);

        return (
          <li key={log.id}>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isFood ? "bg-primary text-primary-fg" : "bg-accent text-accent-fg"
                    }`}
                  >
                    {isFood ? (
                      <Utensils className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Pill className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="font-bold text-text">{log.displayName}</p>
                    <p className="text-muted">
                      <span>{formatQuantity(log.quantity, log.unit)}</span>
                      {log.loggedAt && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{formatLocalTime(log.loggedAt)}</span>
                        </>
                      )}
                    </p>
                    {log.medicineNotes && (
                      <p className="rounded-lg border-s-4 border-accent bg-canvas px-3 py-2 text-text">
                        {log.medicineNotes}
                      </p>
                    )}
                    {!isFood && nutrientHighlights.length > 0 && (
                      <p className="text-muted">
                        Adds{" "}
                        {nutrientHighlights
                          .map(([key, value]) => {
                            const meta = NUTRIENT_CATALOG[key as keyof typeof NUTRIENT_CATALOG];
                            return `${meta.label} ${roundNutrientForDisplay(value)} ${meta.unit}`;
                          })
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      aria-label={`Edit ${log.displayName}`}
                      onClick={() => startEdit(log)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      <span className="ms-1.5">Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      aria-label={`Delete ${log.displayName}`}
                      onClick={() => onDeleteLog(log)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="ms-1.5">Delete</span>
                    </Button>
                  </div>
                )}
              </div>

              {isEditing && (
                <form
                  onSubmit={(event) => void saveEdit(event, log.id)}
                  className="flex flex-wrap items-end gap-3 border-t border-border pt-3"
                >
                  <label className="grid min-w-36 flex-1 gap-1">
                    <span>Quantity ({log.unit})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0.000001"
                      max="1000000"
                      required
                      value={draftQty}
                      onChange={(event) => setDraftQty(event.currentTarget.value)}
                      className="min-h-12 w-full rounded-lg border border-border bg-canvas px-3"
                    />
                  </label>
                  <Button type="submit" disabled={savingId === log.id}>
                    {savingId === log.id ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={savingId === log.id}
                    onClick={() => {
                      setEditingId(null);
                      setEditError("");
                    }}
                  >
                    Cancel
                  </Button>
                  {editError && (
                    <p role="alert" className="w-full text-accent">
                      {editError}
                    </p>
                  )}
                </form>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 3"`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/trackers/daily-log-list.tsx tests/tracker-ui.test.tsx
git commit -m "feat(ui): add Today's Log list with inline quantity edit and delete"
```

---

## Task 4: 4-Step Guided Create Tracker Wizard (`/trackers/new`)

**Files:**
- Create: `src/components/wizard/nutrient-picker.tsx`
- Create: `src/components/wizard/tracker-wizard.tsx`
- Create: `src/app/trackers/new/page.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 4: 4-step guided create tracker wizard", () => {
  it("walks all 4 steps, preserves customDailyTarget provenance, and navigates on create", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          tracker: {
            id: "tr-new",
            name: "Amma's Daily Care",
            healthFlags: ["diabetes"],
            createdAt: "2026-11-26T00:00:00.000Z",
            updatedAt: "2026-11-26T00:00:00.000Z",
            nutrients: [],
          },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { default: NewTrackerPage } = await import("@/app/trackers/new/page");
    render(<NewTrackerPage />);

    // Step 1: Name & Health Flags
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/tracker name/i), {
      target: { value: "Amma's Daily Care" },
    });
    fireEvent.click(screen.getByRole("button", { name: /diabetes \/ blood sugar watch/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: Vitamins
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /vitamin d/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3: Minerals
    expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sodium/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 4: Essential Nutrients & Editable Targets
    expect(screen.getByText(/step 4 of 4/i)).toBeInTheDocument();
    // Diabetes recommendation visible
    expect(screen.getByText(/recommended for blood sugar watch/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /protein/i }));

    // Edit Sodium target explicitly; leave Vitamin D and Protein untouched
    const sodiumInput = screen.getByLabelText(/sodium daily target/i);
    fireEvent.change(sodiumInput, { target: { value: "1800" } });

    fireEvent.click(screen.getByRole("button", { name: /create tracker/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trackers");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Amma's Daily Care",
      healthFlags: ["diabetes"],
      nutrients: [
        { nutrientKey: "vitaminD" },
        { nutrientKey: "sodium", customDailyTarget: 1800 },
        { nutrientKey: "protein" },
      ],
    });
    expect(nav.push).toHaveBeenCalledWith("/trackers/tr-new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 4"`
Expected: FAIL resolving `@/app/trackers/new/page`.

- [ ] **Step 3: Implement `nutrient-picker.tsx`, `tracker-wizard.tsx`, and `src/app/trackers/new/page.tsx`**

`src/components/wizard/nutrient-picker.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientCategory, NutrientKey } from "@/lib/nutrients/types";

type NutrientPickerProps = {
  category: NutrientCategory;
  selected: ReadonlySet<NutrientKey>;
  recommended: ReadonlySet<NutrientKey>;
  onToggle: (key: NutrientKey) => void;
};

export function NutrientPicker({
  category,
  selected,
  recommended,
  onToggle,
}: NutrientPickerProps) {
  const keys = NUTRIENT_KEYS.filter((key) => NUTRIENT_CATALOG[key].category === category);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {keys.map((key) => {
        const meta = NUTRIENT_CATALOG[key];
        const isSelected = selected.has(key);
        const isRecommended = recommended.has(key);

        return (
          <button
            key={key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(key)}
            className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-fg"
                : "border-border bg-surface text-text"
            }`}
          >
            <div className="space-y-0.5">
              <span className="block font-semibold">{meta.label}</span>
              <span className={isSelected ? "opacity-90" : "text-muted"}>
                Default: {meta.defaultDailyTarget} {meta.unit}
              </span>
              {isRecommended && (
                <span
                  className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                    isSelected
                      ? "bg-primary-fg/20 text-primary-fg"
                      : "bg-caution text-caution-fg"
                  }`}
                >
                  Recommended
                </span>
              )}
            </div>
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                isSelected
                  ? "border-primary-fg bg-primary-fg text-primary"
                  : "border-border bg-canvas"
              }`}
              aria-hidden="true"
            >
              {isSelected && <Check className="h-5 w-5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/wizard/tracker-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HealthFlag } from "@/lib/impact/types";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientKey } from "@/lib/nutrients/types";
import { NutrientPicker } from "./nutrient-picker";

const STEP_TITLES = [
  "Name & Health Focus",
  "Choose Vitamins",
  "Choose Minerals",
  "Essential Nutrients & Daily Targets",
] as const;

const FLAG_RECOMMENDATIONS: Record<HealthFlag, readonly NutrientKey[]> = {
  diabetes: ["totalSugars", "addedSugars", "carbohydrates"],
  hypertension: ["sodium", "potassium"],
};

export function TrackerWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [healthFlags, setHealthFlags] = useState<HealthFlag[]>([]);
  const [selected, setSelected] = useState<Set<NutrientKey>>(() => new Set());
  // Only present when the user explicitly edited a target; omitted values preserve default provenance.
  const [customTargets, setCustomTargets] = useState<Partial<Record<NutrientKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recommended = new Set<NutrientKey>(
    healthFlags.flatMap((flag) => FLAG_RECOMMENDATIONS[flag]),
  );

  function toggleFlag(flag: HealthFlag) {
    setHealthFlags((current) =>
      current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag],
    );
  }

  function toggleNutrient(key: NutrientKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addRecommended() {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of recommended) next.add(key);
      return next;
    });
  }

  function nextStep() {
    setError("");
    if (step === 0 && !name.trim()) {
      setError("Please enter a name for this tracker.");
      return;
    }
    setStep((value) => Math.min(STEP_TITLES.length - 1, value + 1));
  }

  async function createTracker() {
    if (busy) return;
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStep(0);
      setError("Please enter a name for this tracker.");
      return;
    }

    const orderedKeys = NUTRIENT_KEYS.filter((key) => selected.has(key));
    const nutrients: { nutrientKey: NutrientKey; customDailyTarget?: number }[] = [];
    for (const key of orderedKeys) {
      const customRaw = customTargets[key];
      if (customRaw !== undefined) {
        const parsed = Number(customRaw);
        if (!Number.isFinite(parsed) || parsed < 0.000001 || parsed > 1_000_000) {
          setError(`Enter a valid daily target for ${NUTRIENT_CATALOG[key].label}.`);
          return;
        }
        nutrients.push({ nutrientKey: key, customDailyTarget: parsed });
      } else {
        nutrients.push({ nutrientKey: key });
      }
    }

    setBusy(true);
    try {
      const response = await fetch("/api/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          healthFlags,
          nutrients,
        }),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok || !body?.tracker?.id) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Could not create your tracker. Try again.",
        );
        return;
      }
      router.push(`/trackers/${body.tracker.id}`);
    } catch {
      setError("Could not create your tracker. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const orderedSelected = NUTRIENT_KEYS.filter((key) => selected.has(key));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-semibold text-primary">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <h1 className="text-3xl font-bold text-text">{STEP_TITLES[step]}</h1>
        <div className="flex gap-2" aria-hidden="true">
          {STEP_TITLES.map((title, index) => (
            <span
              key={title}
              className={`h-2 flex-1 rounded-full ${
                index <= step ? "bg-primary" : "bg-border/40"
              }`}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <Card className="space-y-5">
          <label className="grid gap-2">
            <span className="font-semibold">Tracker name</span>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g., Amma's Daily Care"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4"
            />
          </label>

          <div className="space-y-3">
            <div>
              <p className="font-semibold">Optional health focus</p>
              <p className="text-muted">
                Turns on gentle daily nutritional cautions when sugar or sodium runs high.
              </p>
            </div>
            {(
              [
                {
                  flag: "diabetes" as const,
                  title: "Diabetes / Blood Sugar Watch",
                  desc: "Watches daily total sugars and added sugars.",
                },
                {
                  flag: "hypertension" as const,
                  title: "High Blood Pressure / Sodium Watch",
                  desc: "Watches daily sodium intake.",
                },
              ] as const
            ).map(({ flag, title, desc }) => {
              const active = healthFlags.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleFlag(flag)}
                  className={`flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left ${
                    active
                      ? "border-accent bg-caution text-caution-fg"
                      : "border-border bg-canvas text-text"
                  }`}
                >
                  <div>
                    <span className="block font-semibold">{title}</span>
                    <span className={active ? "opacity-90" : "text-muted"}>{desc}</span>
                  </div>
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface"
                    }`}
                    aria-hidden="true"
                  >
                    {active && <Check className="h-5 w-5" />}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-muted">
            Tap only the vitamins you want to see on your daily screen. You can skip this step.
          </p>
          <NutrientPicker
            category="vitamin"
            selected={selected}
            recommended={recommended}
            onToggle={toggleNutrient}
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-muted">
            Tap only the minerals you want to follow each day.
          </p>
          {healthFlags.includes("hypertension") && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent bg-caution p-3 text-caution-fg">
              <span>Recommended for Blood Pressure Watch: Sodium &amp; Potassium.</span>
              <Button variant="secondary" onClick={addRecommended}>
                Add recommended
              </Button>
            </div>
          )}
          <NutrientPicker
            category="mineral"
            selected={selected}
            recommended={recommended}
            onToggle={toggleNutrient}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          {healthFlags.includes("diabetes") && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent bg-caution p-3 text-caution-fg">
              <span>
                Recommended for Blood Sugar Watch: Total Sugars, Added Sugars, Carbohydrates.
              </span>
              <Button variant="secondary" onClick={addRecommended}>
                Add recommended
              </Button>
            </div>
          )}

          <NutrientPicker
            category="essential"
            selected={selected}
            recommended={recommended}
            onToggle={toggleNutrient}
          />

          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Daily reference targets (optional)</h2>
              <p className="text-muted">
                Standard adult references are pre-filled. Edit any number only if you want a custom target.
              </p>
            </div>

            {orderedSelected.length === 0 ? (
              <p className="text-muted">
                No nutrients selected yet — you can still create a medicine-only tracker.
              </p>
            ) : (
              <div className="space-y-3">
                {orderedSelected.map((key) => {
                  const meta = NUTRIENT_CATALOG[key];
                  const isCustom = customTargets[key] !== undefined;
                  const value = isCustom ? customTargets[key]! : String(meta.defaultDailyTarget);

                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-canvas p-3"
                    >
                      <label className="grid min-w-48 flex-1 gap-1">
                        <span className="font-semibold">
                          {meta.label} daily target ({meta.unit})
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0.000001"
                          max="1000000"
                          value={value}
                          onChange={(event) =>
                            setCustomTargets((current) => ({
                              ...current,
                              [key]: event.currentTarget.value,
                            }))
                          }
                          className="min-h-12 w-full rounded-lg border border-border bg-surface px-3"
                        />
                      </label>
                      {isCustom && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setCustomTargets((current) => {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            })
                          }
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          <span className="ms-1.5">Reset</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {error && (
        <p role="alert" className="font-semibold text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {step > 0 ? (
          <Button variant="outline" disabled={busy} onClick={() => setStep((v) => v - 1)}>
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <span className="ms-1.5">Back</span>
          </Button>
        ) : (
          <span />
        )}

        {step < STEP_TITLES.length - 1 ? (
          <Button onClick={nextStep}>
            <span>Next</span>
            <ArrowRight className="ms-1.5 h-5 w-5" aria-hidden="true" />
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void createTracker()}>
            {busy ? "Creating tracker…" : "Create Tracker"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

`src/app/trackers/new/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TrackerWizard } from "@/components/wizard/tracker-wizard";

export default function NewTrackerPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <Link
        href="/"
        className="inline-flex min-h-12 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        <span>Back to Trackers</span>
      </Link>
      <TrackerWizard />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 4"`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/wizard/nutrient-picker.tsx src/components/wizard/tracker-wizard.tsx src/app/trackers/new/page.tsx tests/tracker-ui.test.tsx
git commit -m "feat(ui): add 4-step guided create tracker wizard with target provenance"
```

---

## Task 5: Client-Side Medicine Image Compression (`image-compress.ts`)

**Files:**
- Create: `src/components/logging/image-compress.ts`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 5: client-side medicine image compression", () => {
  it("computes bounded dimensions, rejects unsupported types, and compresses to JPEG under 400KB", async () => {
    const { compressMedicineImage, computeTargetDimensions } = await import(
      "@/components/logging/image-compress"
    );

    expect(computeTargetDimensions(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
    expect(computeTargetDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 });

    const badFile = new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" });
    await expect(compressMedicineImage(badFile)).rejects.toThrow(/JPEG, PNG, or WebP/i);

    const source = new File([new Uint8Array(600_000)], "strip.png", { type: "image/png" });
    const qualities: number[] = [];
    const compressed = await compressMedicineImage(source, {
      decode: async () => ({ width: 2048, height: 1024, close: vi.fn() }),
      encode: async (width, height, quality) => {
        qualities.push(quality);
        expect(width).toBe(1024);
        expect(height).toBe(512);
        // First quality returns >400KB to verify step-down, second returns <400KB
        const size = quality > 0.6 ? 450_000 : 220_000;
        return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
      },
    });

    expect(qualities).toEqual([0.7, 0.55]);
    expect(compressed.type).toBe("image/jpeg");
    expect(compressed.size).toBeLessThanOrEqual(400_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 5"`
Expected: FAIL resolving `@/components/logging/image-compress`.

- [ ] **Step 3: Implement `src/components/logging/image-compress.ts`**

```ts
import { IMAGE_MIMES, type ImageMime } from "@/lib/medicines/types";

export const MAX_SIDE_PX = 1024;
export const TARGET_MAX_BYTES = 400_000;
export const SERVER_MAX_BYTES = 2 * 1024 * 1024;
const QUALITY_STEPS = [0.7, 0.55, 0.4] as const;

export function isSupportedImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIMES as readonly string[]).includes(mime.toLowerCase());
}

export function computeTargetDimensions(
  width: number,
  height: number,
  maxSide: number = MAX_SIDE_PX,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxSide, height: maxSide };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type DecodedImage = {
  width: number;
  height: number;
  source?: CanvasImageSource;
  close?: () => void;
};

type CompressDeps = {
  decode?: (blob: Blob) => Promise<DecodedImage>;
  encode?: (width: number, height: number, quality: number, source?: CanvasImageSource) => Promise<Blob | null>;
};

async function defaultDecode(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read this photo."));
      img.src = url;
    });
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      source: image,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function defaultEncode(
  width: number,
  height: number,
  quality: number,
  source?: CanvasImageSource,
): Promise<Blob | null> {
  if (typeof document === "undefined" || !source) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressMedicineImage(
  file: Blob,
  deps?: CompressDeps,
): Promise<Blob> {
  if (!isSupportedImageMime(file.type)) {
    throw new Error("Please choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size === 0) {
    throw new Error("The selected photo is empty. Please choose another photo.");
  }

  const decode = deps?.decode ?? defaultDecode;
  const encode = deps?.encode ?? defaultEncode;

  // Skip canvas pipeline in non-canvas environments (e.g., jsdom) when no custom encoder is injected.
  if (!deps?.encode) {
    if (typeof document === "undefined") {
      if (file.size <= SERVER_MAX_BYTES) return file;
      throw new Error("This photo is larger than 2 MB. Try taking a closer photo.");
    }
    const probe = document.createElement("canvas");
    if (!probe.getContext || !probe.getContext("2d")) {
      if (file.size <= SERVER_MAX_BYTES) return file;
      throw new Error("This photo is larger than 2 MB. Try taking a closer photo.");
    }
  }

  let decoded: DecodedImage | null = null;
  try {
    decoded = await decode(file);
    const { width, height } = computeTargetDimensions(decoded.width, decoded.height, MAX_SIDE_PX);

    let best: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const candidate = await encode(width, height, quality, decoded.source);
      if (!candidate) break;
      best = candidate;
      if (candidate.size <= TARGET_MAX_BYTES) return candidate;
    }

    if (best && best.size <= SERVER_MAX_BYTES) return best;
  } catch {
    // Fall through to bounded original check if browser lacks canvas/bitmap decode.
  } finally {
    decoded?.close?.();
  }

  if (file.size <= SERVER_MAX_BYTES) {
    return file;
  }
  throw new Error("This photo is larger than 2 MB. Try taking a closer photo.");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 5"`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/logging/image-compress.ts tests/tracker-ui.test.tsx
git commit -m "feat(ui): add client-side medicine photo compression helper"
```

---

## Task 6: Food Logging Modal (Search, AI Estimated Fallback, Presets & Live Preview)

**Files:**
- Create: `src/components/logging/food-log-modal.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 6: food logging modal", () => {
  const trackerNutrients = [
    {
      nutrientKey: "protein" as const,
      label: "Protein",
      unit: "g" as const,
      dailyTarget: 50,
      isCustomTarget: false,
      sortOrder: 0,
      targetKind: "goal" as const,
    },
    {
      nutrientKey: "totalSugars" as const,
      label: "Total Sugars",
      unit: "g" as const,
      dailyTarget: 35,
      isCustomTarget: false,
      sortOrder: 1,
      targetKind: "upper" as const,
    },
  ];

  it("shows recent foods, updates live nutrient preview across presets and g/ml, and logs food", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/foods/search")) {
        return Response.json({
          foods: [
            {
              id: "food-milk",
              name: "Whole cow's milk",
              aliases: ["milk", "doodh"],
              defaultUnit: "ml",
              nutrientsPer100: { protein: 3.2, totalSugars: 5, calcium: 113 },
              source: "curated",
              estimated: false,
            },
          ],
        });
      }
      if (url === "/api/trackers/t-1/logs" && init?.method === "POST") {
        return Response.json(
          {
            log: {
              id: "log-new",
              trackerId: "t-1",
              logDate: "2026-11-26",
              loggedAt: "2026-11-26T09:00:00.000Z",
              entryType: "food",
              foodId: "food-milk",
              medicineId: null,
              displayName: "Whole cow's milk",
              quantity: 250,
              unit: "ml",
              computedNutrientsJson: { protein: 8, totalSugars: 12.5 },
              medicineNotes: null,
            },
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onLogged = vi.fn();
    const { FoodLogModal } = await import("@/components/logging/food-log-modal");
    render(
      <FoodLogModal
        trackerId="t-1"
        logDate="2026-11-26"
        trackerNutrients={trackerNutrients}
        onClose={vi.fn()}
        onLogged={onLogged}
      />,
    );

    const foodButton = await screen.findByRole("button", { name: /whole cow's milk/i });
    fireEvent.click(foodButton);

    // Default quantity 100 ml -> Protein 3.2 g, Total Sugars 5 g; Calcium is NOT selected so hidden
    expect(screen.getByText("3.2 g")).toBeInTheDocument();
    expect(screen.getByText("5 g")).toBeInTheDocument();
    expect(screen.queryByText(/calcium/i)).not.toBeInTheDocument();

    // Tap 250 preset -> Protein 8 g, Total Sugars 12.5 g
    fireEvent.click(screen.getByRole("button", { name: "250 ml" }));
    expect(screen.getByText("8 g")).toBeInTheDocument();
    expect(screen.getByText("12.5 g")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save food/i }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());

    const postCall = fetchMock.mock.calls.find(([u]) => u === "/api/trackers/t-1/logs");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      entryType: "food",
      foodId: "food-milk",
      quantity: 250,
      unit: "ml",
      logDate: "2026-11-26",
    });
  });

  it("resolves AI Estimated food draft, requires explicit confirmation, caches via POST /api/foods, then logs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/foods/search")) {
        return Response.json({ foods: [] });
      }
      if (url === "/api/foods/resolve" && init?.method === "POST") {
        return Response.json({
          kind: "draft",
          draft: {
            name: "Homemade Pongal",
            aliases: ["pongal"],
            defaultUnit: "g",
            nutrientsPer100: { protein: 4.5, totalSugars: 1.2 },
            provider: "openrouter",
            label: "Estimated",
            estimated: true,
          },
        });
      }
      if (url === "/api/foods" && init?.method === "POST") {
        return Response.json(
          {
            food: {
              id: "food-ai-1",
              name: "Homemade Pongal",
              aliases: ["pongal"],
              defaultUnit: "g",
              nutrientsPer100: { protein: 4.5, totalSugars: 1.2 },
              source: "ai_confirmed",
              estimated: true,
            },
          },
          { status: 201 },
        );
      }
      if (url === "/api/trackers/t-1/logs" && init?.method === "POST") {
        return Response.json(
          {
            log: {
              id: "log-ai",
              trackerId: "t-1",
              logDate: "2026-11-26",
              loggedAt: "2026-11-26T09:10:00.000Z",
              entryType: "food",
              foodId: "food-ai-1",
              medicineId: null,
              displayName: "Homemade Pongal",
              quantity: 150,
              unit: "g",
              computedNutrientsJson: { protein: 6.75, totalSugars: 1.8 },
              medicineNotes: null,
            },
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onLogged = vi.fn();
    const { FoodLogModal } = await import("@/components/logging/food-log-modal");
    render(
      <FoodLogModal
        trackerId="t-1"
        logDate="2026-11-26"
        trackerNutrients={trackerNutrients}
        onClose={vi.fn()}
        onLogged={onLogged}
      />,
    );

    const searchInput = screen.getByLabelText(/search food/i);
    fireEvent.change(searchInput, { target: { value: "pongal" } });
    fireEvent.click(screen.getByRole("button", { name: /search online \/ ai estimate/i }));

    expect(await screen.findByText("Homemade Pongal")).toBeInTheDocument();
    expect(screen.getByText("Estimated")).toBeInTheDocument();
    // Resolve must never auto-save or auto-log
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/foods")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "150 g" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm & save food/i }));

    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    const saveFoodCall = fetchMock.mock.calls.find(([u]) => u === "/api/foods");
    expect(JSON.parse(String(saveFoodCall?.[1]?.body))).toEqual({
      confirmed: true,
      source: "ai_confirmed",
      name: "Homemade Pongal",
      aliases: ["pongal"],
      defaultUnit: "g",
      nutrientsPer100: { protein: 4.5, totalSugars: 1.2 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 6"`
Expected: FAIL resolving `@/components/logging/food-log-modal`.

- [ ] **Step 3: Implement `src/components/logging/food-log-modal.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FoodDraft, SavedFood } from "@/lib/foods/schemas";
import { roundNutrientForDisplay, scaleFoodNutrients } from "@/lib/nutrients/calculator";
import { NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import type { FoodQuantityUnit, NutrientKey, NutrientMap } from "@/lib/nutrients/types";
import type { IntakeLog, TrackerNutrient } from "@/lib/trackers/service";

const PRESET_QUANTITIES = [50, 100, 150, 250] as const;
const FALLBACK_MANUAL_KEYS: readonly NutrientKey[] = [
  "protein",
  "carbohydrates",
  "totalSugars",
  "sodium",
];

type SelectedFoodState =
  | { kind: "saved"; food: SavedFood }
  | { kind: "draft"; draft: FoodDraft; cachedFoodId: string | null };

type FoodLogModalProps = {
  trackerId: string;
  logDate: string;
  trackerNutrients: readonly TrackerNutrient[];
  onClose: () => void;
  onLogged: (log: IntakeLog) => void;
};

export function FoodLogModal({
  trackerId,
  logDate,
  trackerNutrients,
  onClose,
  onLogged,
}: FoodLogModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SavedFood[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState<SelectedFoodState | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Portion state
  const [unit, setUnit] = useState<FoodQuantityUnit>("g");
  const [quantityText, setQuantityText] = useState("100");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Manual food creation state
  const [manualName, setManualName] = useState("");
  const [manualUnit, setManualUnit] = useState<FoodQuantityUnit>("g");
  const [manualAmounts, setManualAmounts] = useState<Partial<Record<NutrientKey, string>>>({});
  const [manualCachedFoodId, setManualCachedFoodId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoadingSearch(true);
        try {
          const url = query.trim()
            ? `/api/foods/search?q=${encodeURIComponent(query.trim())}`
            : "/api/foods/search";
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          if (controller.signal.aborted) return;
          if (response.status === 401) {
            window.location.replace("/login");
            return;
          }
          if (!response.ok) throw new Error("search failed");
          const body = await response.json();
          if (!controller.signal.aborted && Array.isArray(body?.foods)) {
            setResults(body.foods);
          }
        } catch {
          if (!controller.signal.aborted) setResults([]);
        } finally {
          if (!controller.signal.aborted) setLoadingSearch(false);
        }
      })();
    }, query.trim() ? 150 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function pickSaved(food: SavedFood) {
    setSelected({ kind: "saved", food });
    setManualMode(false);
    setUnit(food.defaultUnit);
    setQuantityText("100");
    setError("");
  }

  async function resolveOnline() {
    const q = query.trim();
    if (!q || resolving) return;
    setResolving(true);
    setError("");
    try {
      const response = await fetch("/api/foods/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Could not find this food online. You can enter it manually.",
        );
        return;
      }
      if (body.kind === "saved" || body.kind === "curated") {
        pickSaved(body.food);
      } else if (body.kind === "draft" && body.draft) {
        setSelected({ kind: "draft", draft: body.draft, cachedFoodId: null });
        setManualMode(false);
        setUnit(body.draft.defaultUnit);
        setQuantityText("100");
      }
    } catch {
      setError("Could not reach food lookup. You can enter this food manually.");
    } finally {
      setResolving(false);
    }
  }

  async function saveSelectedFood() {
    if (!selected || saving) return;
    const quantity = Number(quantityText);
    if (!Number.isFinite(quantity) || quantity < 0.000001 || quantity > 1_000_000) {
      setError("Enter a valid portion greater than 0.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let foodId: string;
      if (selected.kind === "saved") {
        foodId = selected.food.id;
      } else if (selected.cachedFoodId) {
        foodId = selected.cachedFoodId;
      } else {
        const { draft } = selected;
        const saveRes = await fetch("/api/foods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            source: draft.provider === "openrouter" ? "ai_confirmed" : "open_api",
            name: draft.name,
            aliases: draft.aliases,
            defaultUnit: draft.defaultUnit,
            nutrientsPer100: draft.nutrientsPer100,
          }),
        });
        if (saveRes.status === 401) {
          window.location.replace("/login");
          return;
        }
        const saveBody = await saveRes.json();
        if (!saveRes.ok || !saveBody?.food?.id) {
          setError(
            typeof saveBody?.error === "string"
              ? saveBody.error
              : "Could not save this food profile. Try again.",
          );
          return;
        }
        foodId = saveBody.food.id;
        setSelected({ kind: "draft", draft, cachedFoodId: foodId });
      }

      const logRes = await fetch(`/api/trackers/${trackerId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "food",
          foodId,
          quantity,
          unit,
          logDate,
        }),
      });
      if (logRes.status === 401) {
        window.location.replace("/login");
        return;
      }
      const logBody = await logRes.json();
      if (!logRes.ok || !logBody?.log) {
        setError(
          typeof logBody?.error === "string"
            ? logBody.error
            : "Could not log this food. Try again.",
        );
        return;
      }
      onLogged(logBody.log);
    } catch {
      setError("Could not log this food. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveManualFood() {
    if (saving) return;
    const trimmedName = manualName.trim();
    const quantity = Number(quantityText);
    if (!trimmedName) {
      setError("Enter a food name.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0.000001 || quantity > 1_000_000) {
      setError("Enter a valid portion greater than 0.");
      return;
    }

    const nutrientsPer100: NutrientMap = {};
    for (const [key, raw] of Object.entries(manualAmounts)) {
      if (!raw || !raw.trim()) continue;
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        setError(`Enter a valid non-negative number for ${NUTRIENT_CATALOG[key as NutrientKey].label}.`);
        return;
      }
      nutrientsPer100[key as NutrientKey] = num;
    }
    if (Object.keys(nutrientsPer100).length === 0) {
      setError("Enter at least one nutrient amount per 100 g or ml.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let foodId = manualCachedFoodId;
      if (!foodId) {
        const saveRes = await fetch("/api/foods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            source: "manual",
            name: trimmedName,
            aliases: [],
            defaultUnit: manualUnit,
            nutrientsPer100,
          }),
        });
        if (saveRes.status === 401) {
          window.location.replace("/login");
          return;
        }
        const saveBody = await saveRes.json();
        if (!saveRes.ok || !saveBody?.food?.id) {
          setError(
            typeof saveBody?.error === "string"
              ? saveBody.error
              : "Check the food name and nutrient amounts.",
          );
          return;
        }
        foodId = saveBody.food.id;
        setManualCachedFoodId(foodId);
      }

      const logRes = await fetch(`/api/trackers/${trackerId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "food",
          foodId,
          quantity,
          unit,
          logDate,
        }),
      });
      const logBody = await logRes.json();
      if (!logRes.ok || !logBody?.log) {
        setError(typeof logBody?.error === "string" ? logBody.error : "Could not log this food.");
        return;
      }
      onLogged(logBody.log);
    } catch {
      setError("Could not save this food. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const activeProfile =
    selected?.kind === "saved"
      ? selected.food
      : selected?.kind === "draft"
        ? selected.draft
        : null;
  const parsedQty = Number(quantityText);
  const previewMap =
    activeProfile && Number.isFinite(parsedQty) && parsedQty >= 0
      ? scaleFoodNutrients(
          { defaultUnit: activeProfile.defaultUnit, nutrientsPer100: activeProfile.nutrientsPer100 },
          parsedQty,
          unit,
        )
      : {};

  const manualNutrientKeys: readonly NutrientKey[] =
    trackerNutrients.length > 0
      ? trackerNutrients.map((item) => item.nutrientKey)
      : FALLBACK_MANUAL_KEYS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="food-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
    >
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="food-modal-title" className="text-2xl font-bold text-text">
            Add Food
          </h2>
          <Button variant="outline" aria-label="Close Add Food" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {!selected && !manualMode && (
          <div className="space-y-4">
            <label className="grid gap-1">
              <span className="font-semibold">Search food</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  placeholder="Try roti, curd, banana, milk…"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  className="min-h-12 w-full rounded-xl border border-border bg-canvas pl-10 pr-3"
                />
              </div>
            </label>

            {query.trim().length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={resolving}
                  onClick={() => void resolveOnline()}
                >
                  <Sparkles className="me-1.5 h-5 w-5" aria-hidden="true" />
                  <span>{resolving ? "Looking up…" : "Search Online / AI Estimate"}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setManualMode(true);
                    setManualName(query.trim());
                    setManualCachedFoodId(null);
                    setError("");
                  }}
                >
                  Add manually
                </Button>
              </div>
            )}

            {error && (
              <div role="alert" className="space-y-2 rounded-xl border border-accent bg-caution p-3 text-caution-fg">
                <p>{error}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setManualMode(true);
                    setManualName(query.trim());
                    setManualCachedFoodId(null);
                    setError("");
                  }}
                >
                  Enter food manually
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="font-semibold text-muted">
                {query.trim() ? "Matching foods" : "Recent & saved foods"}
              </p>
              {loadingSearch ? (
                <p role="status" className="text-muted">Loading foods…</p>
              ) : results.length === 0 ? (
                <p className="text-muted">
                  No local matches yet. Tap “Search Online / AI Estimate” or add it manually.
                </p>
              ) : (
                <ul className="space-y-2">
                  {results.map((food) => (
                    <li key={food.id}>
                      <button
                        type="button"
                        onClick={() => pickSaved(food)}
                        className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-canvas px-4 py-3 text-left hover:border-primary"
                      >
                        <div>
                          <span className="block font-semibold text-text">{food.name}</span>
                          {food.aliases.length > 0 && (
                            <span className="text-muted">
                              Also: {food.aliases.slice(0, 3).join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {food.estimated && (
                            <span className="rounded-full bg-caution px-2.5 py-0.5 text-sm font-semibold text-caution-fg">
                              Estimated
                            </span>
                          )}
                          <span className="text-muted">per 100 {food.defaultUnit}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {selected && activeProfile && (
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setError("");
              }}
            >
              ← Pick another food
            </Button>

            <Card className="space-y-2 bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-text">{activeProfile.name}</h3>
                {selected.kind === "draft" ? (
                  <span className="rounded-full bg-caution px-3 py-1 text-sm font-semibold text-caution-fg">
                    {selected.draft.label}
                  </span>
                ) : selected.food.estimated ? (
                  <span className="rounded-full bg-caution px-3 py-1 text-sm font-semibold text-caution-fg">
                    Estimated
                  </span>
                ) : null}
              </div>
              {selected.kind === "draft" && (
                <p className="text-muted">
                  Please review these values before saving. Confirmed foods are saved to your list for faster logging next time.
                </p>
              )}
            </Card>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {(["g", "ml"] as const).map((u) => (
                  <Button
                    key={u}
                    variant={unit === u ? "primary" : "outline"}
                    onClick={() => setUnit(u)}
                    className="flex-1"
                  >
                    {u === "g" ? "Grams (g)" : "Milliliters (ml)"}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {PRESET_QUANTITIES.map((preset) => (
                  <Button
                    key={preset}
                    variant={Number(quantityText) === preset ? "secondary" : "outline"}
                    onClick={() => setQuantityText(String(preset))}
                  >
                    {preset} {unit}
                  </Button>
                ))}
              </div>

              <label className="grid gap-1">
                <span className="font-semibold">Amount ({unit})</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0.000001"
                  max="1000000"
                  value={quantityText}
                  onChange={(event) => setQuantityText(event.currentTarget.value)}
                  className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4"
                />
              </label>
            </div>

            {trackerNutrients.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border bg-canvas p-4">
                <p className="font-semibold text-text">Nutrient preview for this tracker</p>
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {trackerNutrients.map((item) => {
                    const value = previewMap[item.nutrientKey];
                    return (
                      <div key={item.nutrientKey} className="flex items-baseline justify-between gap-2">
                        <dt className="text-muted">{item.label}</dt>
                        <dd className="font-semibold tabular-nums text-text">
                          {value !== undefined
                            ? `${roundNutrientForDisplay(value)} ${item.unit}`
                            : "—"}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}

            {error && (
              <p role="alert" className="font-semibold text-accent">
                {error}
              </p>
            )}

            <Button
              disabled={saving}
              onClick={() => void saveSelectedFood()}
              className="w-full"
            >
              {saving
                ? "Saving…"
                : selected.kind === "draft"
                  ? "Confirm & Save Food"
                  : "Save Food"}
            </Button>
          </div>
        )}

        {manualMode && (
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => {
                setManualMode(false);
                setError("");
              }}
            >
              ← Back to search
            </Button>

            <label className="grid gap-1">
              <span className="font-semibold">Food name</span>
              <input
                type="text"
                maxLength={120}
                value={manualName}
                onChange={(event) => setManualName(event.currentTarget.value)}
                className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4"
              />
            </label>

            <div className="flex items-center gap-2">
              {(["g", "ml"] as const).map((u) => (
                <Button
                  key={u}
                  variant={manualUnit === u ? "primary" : "outline"}
                  onClick={() => {
                    setManualUnit(u);
                    setUnit(u);
                  }}
                  className="flex-1"
                >
                  Per 100 {u}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <p className="font-semibold">
                Nutrients per 100 {manualUnit} (enter at least one)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {manualNutrientKeys.map((key) => {
                  const meta = NUTRIENT_CATALOG[key];
                  return (
                    <label key={key} className="grid gap-1">
                      <span>
                        {meta.label} ({meta.unit})
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={manualAmounts[key] ?? ""}
                        onChange={(event) =>
                          setManualAmounts((current) => ({
                            ...current,
                            [key]: event.currentTarget.value,
                          }))
                        }
                        className="min-h-12 w-full rounded-xl border border-border bg-canvas px-3"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="grid gap-1">
              <span className="font-semibold">Portion eaten ({unit})</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0.000001"
                max="1000000"
                value={quantityText}
                onChange={(event) => setQuantityText(event.currentTarget.value)}
                className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4"
              />
            </label>

            {error && (
              <p role="alert" className="font-semibold text-accent">
                {error}
              </p>
            )}

            <Button disabled={saving} onClick={() => void saveManualFood()} className="w-full">
              {saving ? "Saving…" : "Save & Log Food"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 6"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/logging/food-log-modal.tsx tests/tracker-ui.test.tsx
git commit -m "feat(ui): add food logging modal with presets, live preview, and AI confirm"
```

---

## Task 7: Medicine Confirm Card & Medicine Logging Modal (My Medicines 1-Tap + Vision/OCR Scan)

**Files:**
- Create: `src/components/logging/medicine-confirm-card.tsx`
- Create: `src/components/logging/medicine-log-modal.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 7: medicine logging modal and confirm card", () => {
  it("logs a saved My Medicines item in 1 tap without calling scan", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/medicines" && (!init?.method || init.method === "GET")) {
        return Response.json({
          medicines: [
            {
              id: "med-d3",
              brandName: "Vitamin D3 1000 IU",
              genericName: "Cholecalciferol",
              category: "supplement",
              defaultDoseLabel: "1 softgel",
              nutrientsPerDose: { vitaminD: 25 },
              notes: "Take with food.",
              scheduleHint: "After breakfast",
              source: "vision_confirmed",
              createdAt: "2026-11-25T08:00:00.000Z",
            },
          ],
          curated: [],
        });
      }
      if (url === "/api/trackers/t-1/logs" && init?.method === "POST") {
        return Response.json(
          {
            log: {
              id: "log-med-1",
              trackerId: "t-1",
              logDate: "2026-11-26",
              loggedAt: "2026-11-26T09:00:00.000Z",
              entryType: "medicine",
              foodId: null,
              medicineId: "med-d3",
              displayName: "Vitamin D3 1000 IU",
              quantity: 1,
              unit: "dose",
              computedNutrientsJson: { vitaminD: 25 },
              medicineNotes: "Take with food.",
            },
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onLogged = vi.fn();
    const { MedicineLogModal } = await import("@/components/logging/medicine-log-modal");
    render(
      <MedicineLogModal
        trackerId="t-1"
        logDate="2026-11-26"
        onClose={vi.fn()}
        onLogged={onLogged}
      />,
    );

    const tapButton = await screen.findByRole("button", { name: /log vitamin d3 1000 iu/i });
    fireEvent.click(tapButton);

    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/scan"))).toBe(false);
    const logCall = fetchMock.mock.calls.find(([u]) => u === "/api/trackers/t-1/logs");
    expect(JSON.parse(String(logCall?.[1]?.body))).toEqual({
      entryType: "medicine",
      medicineId: "med-d3",
      quantity: 1,
      unit: "dose",
      logDate: "2026-11-26",
    });
  });

  it("handles unreadable Vision scan -> explicit OCR retry -> Confirm Card review -> save & log", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/medicines" && (!init?.method || init.method === "GET")) {
        return Response.json({ medicines: [], curated: [] });
      }
      if (url === "/api/medicines/scan" && init?.method === "POST") {
        return Response.json({
          requiresConfirmation: true,
          source: "vision",
          code: "UNREADABLE",
          draft: null,
          confidence: { level: "low", score: null },
          message: "We couldn't read the label. Try a clear photo in even light or enter it manually.",
          actions: ["retake", "ocr", "manual"],
        });
      }
      if (url === "/api/medicines/scan?mode=ocr" && init?.method === "POST") {
        return Response.json({
          requiresConfirmation: true,
          source: "ocr",
          code: "REVIEW",
          draft: {
            brandName: "Calcium Plus",
            genericName: "Calcium Carbonate",
            category: "supplement",
            defaultDoseLabel: null,
            nutrientsPerDose: {},
            notes: null,
          },
          confidence: { level: "low", score: null },
          message: "Double-check the name, dose, and any amounts against the package before saving.",
          actions: ["retake", "manual"],
        });
      }
      if (url === "/api/medicines" && init?.method === "POST") {
        return Response.json(
          {
            medicine: {
              id: "med-saved-1",
              brandName: "Calcium Plus",
              genericName: "Calcium Carbonate",
              category: "supplement",
              defaultDoseLabel: "1 tablet",
              nutrientsPerDose: { calcium: 500 },
              notes: null,
              scheduleHint: null,
              source: "ocr_confirmed",
              createdAt: "2026-11-26T09:05:00.000Z",
            },
          },
          { status: 201 },
        );
      }
      if (url === "/api/trackers/t-1/logs" && init?.method === "POST") {
        return Response.json(
          {
            log: {
              id: "log-cal-1",
              trackerId: "t-1",
              logDate: "2026-11-26",
              loggedAt: "2026-11-26T09:05:00.000Z",
              entryType: "medicine",
              foodId: null,
              medicineId: "med-saved-1",
              displayName: "Calcium Plus",
              quantity: 1,
              unit: "dose",
              computedNutrientsJson: { calcium: 500 },
              medicineNotes: null,
            },
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onLogged = vi.fn();
    const { MedicineLogModal } = await import("@/components/logging/medicine-log-modal");
    render(
      <MedicineLogModal
        trackerId="t-1"
        logDate="2026-11-26"
        onClose={vi.fn()}
        onLogged={onLogged}
      />,
    );

    const fileInput = await screen.findByLabelText(/scan medicine photo/i);
    const jpegFile = new File([Uint8Array.of(0xff, 0xd8, 0xff, 0x00)], "label.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [jpegFile] } });

    // Unreadable recovery view with Retake, Try Local OCR, Enter Manually
    expect(await screen.findByText(/couldn't read the label/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retake photo/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try local ocr/i }));

    // Confirm Card appears with Low confidence badge; never auto-logged
    expect(await screen.findByText(/low — please double-check/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u, i]) => u === "/api/medicines" && i?.method === "POST")).toBe(false);

    // Fill missing dose label and add Calcium 500 mg
    fireEvent.change(screen.getByLabelText(/default dose/i), { target: { value: "1 tablet" } });
    fireEvent.change(screen.getByLabelText(/add nutrient/i), { target: { value: "calcium" } });
    fireEvent.click(screen.getByRole("button", { name: /add amount/i }));
    fireEvent.change(screen.getByLabelText(/calcium \(mg\)/i), { target: { value: "500" } });

    fireEvent.click(screen.getByRole("button", { name: /confirm & log/i }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());

    const postMed = fetchMock.mock.calls.find(([u, i]) => u === "/api/medicines" && i?.method === "POST");
    expect(JSON.parse(String(postMed?.[1]?.body))).toEqual({
      brandName: "Calcium Plus",
      genericName: "Calcium Carbonate",
      category: "supplement",
      defaultDoseLabel: "1 tablet",
      nutrientsPerDose: { calcium: 500 },
      notes: null,
      scheduleHint: null,
      source: "ocr_confirmed",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 7"`
Expected: FAIL resolving `medicine-log-modal` and `medicine-confirm-card`.

- [ ] **Step 3: Implement `medicine-confirm-card.tsx` and `medicine-log-modal.tsx`**

`src/components/logging/medicine-confirm-card.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MEDICINE_CATEGORIES,
  type MedicineCategory,
  type MedicineScanDraft,
  type ScanResult,
} from "@/lib/medicines/types";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientKey, NutrientMap } from "@/lib/nutrients/types";

export type ConfirmedMedicinePayload = {
  brandName: string;
  genericName: string | null;
  category: MedicineCategory;
  defaultDoseLabel: string;
  nutrientsPerDose: NutrientMap;
  notes: string | null;
  scheduleHint: string | null;
  source: "manual" | "vision_confirmed" | "ocr_confirmed";
  doses: number;
};

type MedicineConfirmCardProps = {
  initialDraft: MedicineScanDraft;
  initialScheduleHint?: string | null;
  source: "manual" | "vision_confirmed" | "ocr_confirmed";
  confidence?: ScanResult["confidence"];
  reviewMessage?: string | null;
  actions?: readonly ("retake" | "ocr" | "manual")[];
  busy: boolean;
  error: string;
  savedPendingLog: boolean;
  onConfirm: (payload: ConfirmedMedicinePayload) => Promise<void>;
  onRetake?: () => void;
  onTryOcr?: () => void;
  onBack: () => void;
};

const categoryLabels: Record<MedicineCategory, string> = {
  supplement: "Supplement (adds vitamins/minerals)",
  prescription: "Prescription medicine (dose & notes)",
  both: "Both (medicine + nutrients)",
};

function confidenceBadge(
  source: MedicineConfirmCardProps["source"],
  confidence?: ScanResult["confidence"],
): { text: string; className: string } {
  if (source === "manual") {
    return { text: "Manual Review", className: "bg-canvas text-text border border-border" };
  }
  if (confidence?.level === "high") {
    return { text: "AI High Confidence", className: "bg-primary text-primary-fg" };
  }
  if (confidence?.level === "medium") {
    return { text: "AI Medium Confidence", className: "bg-accent text-accent-fg" };
  }
  return {
    text: "Low — Please Double-Check",
    className: "border border-accent bg-caution text-caution-fg",
  };
}

export function MedicineConfirmCard({
  initialDraft,
  initialScheduleHint = null,
  source,
  confidence,
  reviewMessage,
  actions = [],
  busy,
  error,
  savedPendingLog,
  onConfirm,
  onRetake,
  onTryOcr,
  onBack,
}: MedicineConfirmCardProps) {
  const [brandName, setBrandName] = useState(initialDraft.brandName ?? "");
  const [genericName, setGenericName] = useState(initialDraft.genericName ?? "");
  const [category, setCategory] = useState<MedicineCategory>(initialDraft.category ?? "supplement");
  const [defaultDoseLabel, setDefaultDoseLabel] = useState(initialDraft.defaultDoseLabel ?? "");
  const [scheduleHint, setScheduleHint] = useState(initialScheduleHint ?? "");
  const [notes, setNotes] = useState(initialDraft.notes ?? "");
  const [dosesText, setDosesText] = useState("1");
  const [nutrients, setNutrients] = useState<Partial<Record<NutrientKey, string>>>(() => {
    const entries: Partial<Record<NutrientKey, string>> = {};
    for (const key of NUTRIENT_KEYS) {
      const value = initialDraft.nutrientsPerDose[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        entries[key] = String(value);
      }
    }
    return entries;
  });
  const [pickerKey, setPickerKey] = useState<NutrientKey>("vitaminD");
  const [localError, setLocalError] = useState("");

  const badge = confidenceBadge(source, confidence);
  const selectedKeys = NUTRIENT_KEYS.filter((key) => nutrients[key] !== undefined);
  const availableKeys = NUTRIENT_KEYS.filter((key) => nutrients[key] === undefined);

  function addNutrientRow() {
    if (nutrients[pickerKey] !== undefined) return;
    setNutrients((current) => ({ ...current, [pickerKey]: "" }));
    const nextAvailable = availableKeys.find((k) => k !== pickerKey);
    if (nextAvailable) setPickerKey(nextAvailable);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    const trimmedBrand = brandName.trim();
    const trimmedDose = defaultDoseLabel.trim();
    const doses = Number(dosesText);
    if (!trimmedBrand) {
      setLocalError("Enter the medicine or supplement name.");
      return;
    }
    if (!trimmedDose) {
      setLocalError("Enter the default dose (for example, 1 tablet).");
      return;
    }
    if (!Number.isFinite(doses) || doses < 0.000001 || doses > 1_000_000) {
      setLocalError("Enter a valid number of doses.");
      return;
    }

    const nutrientsPerDose: NutrientMap = {};
    if (category !== "prescription") {
      for (const key of selectedKeys) {
        const raw = nutrients[key]?.trim() ?? "";
        if (!raw) continue;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setLocalError(`Enter a valid amount for ${NUTRIENT_CATALOG[key].label}.`);
          return;
        }
        nutrientsPerDose[key] = parsed;
      }
    }

    await onConfirm({
      brandName: trimmedBrand,
      genericName: genericName.trim() || null,
      category,
      defaultDoseLabel: trimmedDose,
      nutrientsPerDose,
      notes: notes.trim() || null,
      scheduleHint: scheduleHint.trim() || null,
      source,
      doses,
    });
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" disabled={busy} onClick={onBack}>
          ← Back
        </Button>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      {reviewMessage && (
        <p className="rounded-xl border border-border bg-canvas p-3 text-text">{reviewMessage}</p>
      )}

      {(actions.includes("retake") || actions.includes("ocr")) && (
        <div className="flex flex-wrap gap-2">
          {actions.includes("retake") && onRetake && (
            <Button variant="outline" disabled={busy} onClick={onRetake}>
              Retake Photo
            </Button>
          )}
          {actions.includes("ocr") && onTryOcr && (
            <Button variant="outline" disabled={busy} onClick={onTryOcr}>
              Try Local OCR
            </Button>
          )}
        </div>
      )}

      <Card className="space-y-4 bg-canvas p-4">
        <label className="grid gap-1">
          <span className="font-semibold">Medicine or supplement name</span>
          <input
            type="text"
            maxLength={120}
            required
            disabled={savedPendingLog}
            value={brandName}
            onChange={(event) => setBrandName(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
        </label>

        <label className="grid gap-1">
          <span>Generic name (optional)</span>
          <input
            type="text"
            maxLength={120}
            disabled={savedPendingLog}
            value={genericName}
            onChange={(event) => setGenericName(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-semibold">Category</span>
          <select
            disabled={savedPendingLog}
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value as MedicineCategory)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          >
            {MEDICINE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="font-semibold">Default dose</span>
            <input
              type="text"
              maxLength={80}
              required
              disabled={savedPendingLog}
              placeholder="e.g., 1 tablet"
              value={defaultDoseLabel}
              onChange={(event) => setDefaultDoseLabel(event.currentTarget.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>

          <label className="grid gap-1">
            <span className="font-semibold">Doses taken now</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0.000001"
              max="1000000"
              required
              value={dosesText}
              onChange={(event) => setDosesText(event.currentTarget.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span>Schedule reminder note (optional)</span>
          <input
            type="text"
            maxLength={120}
            disabled={savedPendingLog}
            placeholder="e.g., After breakfast"
            value={scheduleHint}
            onChange={(event) => setScheduleHint(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
        </label>

        <label className="grid gap-1">
          <span>Food or care notes (optional)</span>
          <textarea
            rows={2}
            maxLength={500}
            disabled={savedPendingLog}
            placeholder="e.g., Take with food."
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface p-3"
          />
        </label>

        {category !== "prescription" && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="font-semibold">Vitamins &amp; minerals per 1 dose</p>
            {selectedKeys.map((key) => {
              const meta = NUTRIENT_CATALOG[key];
              return (
                <div key={key} className="flex items-end gap-2">
                  <label className="grid flex-1 gap-1">
                    <span>
                      {meta.label} ({meta.unit})
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      disabled={savedPendingLog}
                      value={nutrients[key] ?? ""}
                      onChange={(event) =>
                        setNutrients((current) => ({
                          ...current,
                          [key]: event.currentTarget.value,
                        }))
                      }
                      className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={savedPendingLog}
                    aria-label={`Remove ${meta.label}`}
                    onClick={() =>
                      setNutrients((current) => {
                        const next = { ...current };
                        delete next[key];
                        return next;
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}

            {availableKeys.length > 0 && !savedPendingLog && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid min-w-44 flex-1 gap-1">
                  <span>Add nutrient</span>
                  <select
                    value={availableKeys.includes(pickerKey) ? pickerKey : availableKeys[0]}
                    onChange={(event) => setPickerKey(event.currentTarget.value as NutrientKey)}
                    className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
                  >
                    {availableKeys.map((key) => (
                      <option key={key} value={key}>
                        {NUTRIENT_CATALOG[key].label} ({NUTRIENT_CATALOG[key].unit})
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="outline" onClick={addNutrientRow}>
                  <Plus className="me-1 h-4 w-4" aria-hidden="true" />
                  <span>Add amount</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {(localError || error) && (
        <p role="alert" className="font-semibold text-accent">
          {localError || error}
        </p>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : savedPendingLog ? "Retry Logging Dose" : "Confirm & Log"}
      </Button>
    </form>
  );
}
```

`src/components/logging/medicine-log-modal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Pill, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  CabinetMedicine,
  MedicineScanDraft,
  ScanResult,
} from "@/lib/medicines/types";
import type { IntakeLog } from "@/lib/trackers/service";
import { compressMedicineImage } from "./image-compress";
import {
  MedicineConfirmCard,
  type ConfirmedMedicinePayload,
} from "./medicine-confirm-card";

type ModalMode =
  | { kind: "cabinet" }
  | { kind: "recovery"; result: ScanResult }
  | {
      kind: "confirm";
      draft: MedicineScanDraft;
      scheduleHint?: string | null;
      source: "manual" | "vision_confirmed" | "ocr_confirmed";
      confidence?: ScanResult["confidence"];
      message?: string | null;
      actions?: readonly ("retake" | "ocr" | "manual")[];
    };

type MedicineLogModalProps = {
  trackerId: string;
  logDate: string;
  onClose: () => void;
  onLogged: (log: IntakeLog) => void;
};

const EMPTY_DRAFT: MedicineScanDraft = {
  brandName: null,
  genericName: null,
  category: "supplement",
  defaultDoseLabel: null,
  nutrientsPerDose: {},
  notes: null,
};

const CATEGORY_BADGES = {
  supplement: "Supplement",
  prescription: "Prescription",
  both: "Medicine + Nutrients",
} as const;

export function MedicineLogModal({
  trackerId,
  logDate,
  onClose,
  onLogged,
}: MedicineLogModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [myMedicines, setMyMedicines] = useState<CabinetMedicine[]>([]);
  const [curated, setCurated] = useState<CabinetMedicine[]>([]);
  const [curatedQuery, setCuratedQuery] = useState("");
  const [showCurated, setShowCurated] = useState(false);
  const [loadingCabinet, setLoadingCabinet] = useState(true);

  const [mode, setMode] = useState<ModalMode>({ kind: "cabinet" });
  const [lastCompressedBlob, setLastCompressedBlob] = useState<Blob | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savedMedicineId, setSavedMedicineId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/medicines", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("cabinet unavailable");
        const body = await response.json();
        if (!controller.signal.aborted) {
          setMyMedicines(Array.isArray(body?.medicines) ? body.medicines : []);
          setCurated(Array.isArray(body?.curated) ? body.curated : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load My Medicines. You can still scan or add manually.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingCabinet(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function logCabinetMedicine(medicine: CabinetMedicine) {
    if (busyId) return;
    setBusyId(medicine.id);
    setError("");
    try {
      const response = await fetch(`/api/trackers/${trackerId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "medicine",
          medicineId: medicine.id,
          quantity: 1,
          unit: "dose",
          logDate,
        }),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok || !body?.log) {
        setError(typeof body?.error === "string" ? body.error : "Could not log this medicine.");
        return;
      }
      onLogged(body.log);
    } catch {
      setError("Could not log this medicine. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function runScan(blob: Blob, scanMode: "vision" | "ocr") {
    setScanning(true);
    setError("");
    setSavedMedicineId(null);
    try {
      const url = scanMode === "ocr" ? "/api/medicines/scan?mode=ocr" : "/api/medicines/scan";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Could not read this photo. Try again or enter it manually.",
        );
        return;
      }
      const result = body as ScanResult;
      if (result.draft) {
        setMode({
          kind: "confirm",
          draft: result.draft,
          source: result.source === "ocr" ? "ocr_confirmed" : "vision_confirmed",
          confidence: result.confidence,
          message: result.message,
          actions: result.actions,
        });
      } else {
        setMode({ kind: "recovery", result });
      }
    } catch {
      setError("Photo reading failed. Try again or enter the medicine manually.");
    } finally {
      setScanning(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    try {
      const compressed = await compressMedicineImage(file);
      setLastCompressedBlob(compressed);
      await runScan(compressed, "vision");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Please choose a valid JPEG, PNG, or WebP photo.",
      );
    }
  }

  function triggerRetake() {
    setSavedMedicineId(null);
    setError("");
    setMode({ kind: "cabinet" });
    fileInputRef.current?.click();
  }

  function openManual() {
    setSavedMedicineId(null);
    setError("");
    setMode({
      kind: "confirm",
      draft: EMPTY_DRAFT,
      source: "manual",
      message: "Enter details from the medicine strip or bottle.",
    });
  }

  function pickCurated(item: CabinetMedicine) {
    setSavedMedicineId(null);
    setError("");
    setMode({
      kind: "confirm",
      draft: {
        brandName: item.brandName,
        genericName: item.genericName,
        category: item.category,
        defaultDoseLabel: item.defaultDoseLabel,
        nutrientsPerDose: item.nutrientsPerDose,
        notes: item.notes,
      },
      scheduleHint: item.scheduleHint,
      source: "manual",
      message: "Check this starter template against your actual package before saving to My Medicines.",
    });
  }

  async function handleConfirmAndLog(payload: ConfirmedMedicinePayload) {
    if (confirmBusy) return;
    setConfirmBusy(true);
    setError("");
    try {
      let medicineId = savedMedicineId;
      if (!medicineId) {
        const createRes = await fetch("/api/medicines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName: payload.brandName,
            genericName: payload.genericName,
            category: payload.category,
            defaultDoseLabel: payload.defaultDoseLabel,
            nutrientsPerDose: payload.nutrientsPerDose,
            notes: payload.notes,
            scheduleHint: payload.scheduleHint,
            source: payload.source,
          }),
        });
        if (createRes.status === 401) {
          window.location.replace("/login");
          return;
        }
        const createBody = await createRes.json();
        if (!createRes.ok || !createBody?.medicine?.id) {
          setError(
            typeof createBody?.error === "string"
              ? createBody.error
              : "Check the medicine details and try again.",
          );
          return;
        }
        medicineId = createBody.medicine.id;
        setSavedMedicineId(medicineId);
      }

      const logRes = await fetch(`/api/trackers/${trackerId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "medicine",
          medicineId,
          quantity: payload.doses,
          unit: "dose",
          logDate,
        }),
      });
      if (logRes.status === 401) {
        window.location.replace("/login");
        return;
      }
      const logBody = await logRes.json();
      if (!logRes.ok || !logBody?.log) {
        setError(
          typeof logBody?.error === "string"
            ? `${logBody.error} Your medicine is saved in My Medicines — tap Retry Logging Dose.`
            : "Saved to My Medicines, but logging failed. Tap Retry Logging Dose.",
        );
        return;
      }
      onLogged(logBody.log);
    } catch {
      setError("Could not complete logging. Check your connection and try again.");
    } finally {
      setConfirmBusy(false);
    }
  }

  const filteredCurated = curatedQuery.trim()
    ? curated.filter((item) => {
        const q = curatedQuery.trim().toLowerCase();
        return (
          item.brandName.toLowerCase().includes(q) ||
          (item.genericName?.toLowerCase().includes(q) ?? false)
        );
      })
    : curated;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="medicine-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
    >
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="medicine-modal-title" className="text-2xl font-bold text-text">
            Add Medicine or Supplement
          </h2>
          <Button variant="outline" aria-label="Close Add Medicine" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Hidden file input remains mounted so Retake works from any view */}
        <input
          ref={fileInputRef}
          id="medicine-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Scan Medicine Photo"
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
        />

        {scanning && (
          <Card className="mb-4 bg-canvas">
            <p role="status" className="font-semibold text-primary">
              Reading medicine label… Please wait a moment.
            </p>
          </Card>
        )}

        {mode.kind === "cabinet" && (
          <div className="space-y-5">
            <section className="space-y-3" aria-labelledby="my-medicines-heading">
              <h3 id="my-medicines-heading" className="text-xl font-bold text-text">
                My Medicines (1-Tap Log)
              </h3>
              {loadingCabinet ? (
                <p role="status" className="text-muted">Loading your saved medicines…</p>
              ) : myMedicines.length === 0 ? (
                <p className="text-muted">
                  No saved medicines yet. Scan a photo or add one below — it will stay here for 1-tap logging next time.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {myMedicines.map((med) => (
                    <li key={med.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-3 bg-canvas p-3">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="font-bold text-text">{med.brandName}</p>
                          <p className="text-muted">
                            {CATEGORY_BADGES[med.category]} · {med.defaultDoseLabel}
                            {med.scheduleHint ? ` · ${med.scheduleHint}` : ""}
                          </p>
                        </div>
                        <Button
                          disabled={busyId !== null || scanning}
                          aria-label={`Log ${med.brandName}`}
                          onClick={() => void logCabinetMedicine(med)}
                        >
                          <Pill className="me-1.5 h-4 w-4" aria-hidden="true" />
                          <span>{busyId === med.id ? "Logging…" : "Log 1 dose"}</span>
                        </Button>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="font-semibold text-text">Add a new medicine or supplement</p>
              <p className="text-muted">
                Photo reading sends the photo to your configured AI model. Crop out personal details and double-check the package before saving.
              </p>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  disabled={scanning}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="me-2 h-5 w-5" aria-hidden="true" />
                  <span>Scan Medicine Photo</span>
                </Button>
                <Button variant="outline" disabled={scanning} onClick={openManual}>
                  <Plus className="me-2 h-5 w-5" aria-hidden="true" />
                  <span>Add Manually</span>
                </Button>
              </div>

              {curated.length > 0 && (
                <div className="space-y-2 pt-1">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowCurated((value) => !value)}
                  >
                    <Search className="me-2 h-5 w-5" aria-hidden="true" />
                    <span>{showCurated ? "Hide Starter Catalog" : "Browse Starter Catalog"}</span>
                  </Button>

                  {showCurated && (
                    <div className="space-y-2 rounded-xl border border-border bg-canvas p-3">
                      <label className="grid gap-1">
                        <span>Search starter medicines</span>
                        <input
                          type="search"
                          value={curatedQuery}
                          onChange={(event) => setCuratedQuery(event.currentTarget.value)}
                          className="min-h-12 w-full rounded-lg border border-border bg-surface px-3"
                        />
                      </label>
                      <ul className="max-h-52 space-y-2 overflow-y-auto">
                        {filteredCurated.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => pickCurated(item)}
                              className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left"
                            >
                              <span className="font-semibold">{item.brandName}</span>
                              <span className="text-muted">{CATEGORY_BADGES[item.category]}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="font-semibold text-accent">
                  {error}
                </p>
              )}
            </section>
          </div>
        )}

        {mode.kind === "recovery" && (
          <div className="space-y-4">
            <Card className="space-y-3 border-2 border-accent bg-caution text-caution-fg">
              <h3 className="text-xl font-bold">Could not read the label clearly</h3>
              <p>{mode.result.message}</p>
              <p>
                Tip: Place the strip or bottle on a flat surface in even light and avoid shiny glare.
              </p>
            </Card>

            {error && (
              <p role="alert" className="font-semibold text-accent">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2.5">
              <Button disabled={scanning} onClick={triggerRetake}>
                Retake Photo
              </Button>
              {mode.result.actions.includes("ocr") && lastCompressedBlob && (
                <Button
                  variant="secondary"
                  disabled={scanning}
                  onClick={() => void runScan(lastCompressedBlob, "ocr")}
                >
                  Try Local OCR
                </Button>
              )}
              <Button variant="outline" disabled={scanning} onClick={openManual}>
                Enter Manually
              </Button>
            </div>
          </div>
        )}

        {mode.kind === "confirm" && (
          <MedicineConfirmCard
            initialDraft={mode.draft}
            initialScheduleHint={mode.scheduleHint}
            source={mode.source}
            confidence={mode.confidence}
            reviewMessage={mode.message}
            actions={mode.actions}
            busy={confirmBusy || scanning}
            error={error}
            savedPendingLog={savedMedicineId !== null}
            onConfirm={handleConfirmAndLog}
            onRetake={triggerRetake}
            onTryOcr={
              lastCompressedBlob ? () => void runScan(lastCompressedBlob, "ocr") : undefined
            }
            onBack={() => {
              setSavedMedicineId(null);
              setError("");
              setMode({ kind: "cabinet" });
            }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 7"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/logging/medicine-confirm-card.tsx src/components/logging/medicine-log-modal.tsx tests/tracker-ui.test.tsx
git commit -m "feat(ui): add Medicine Confirm Card and My Medicines logging modal"
```

---

## Task 8: Daily Tracker Today View (`src/app/trackers/[id]/page.tsx`)

**Files:**
- Create: `src/app/trackers/[id]/page.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 8: daily tracker Today view, date switcher, and 8-second Undo", () => {
  it("loads tracker summary & logs, shows caution banner and selected cards, switches local date, and supports 8s Undo", async () => {
    const today = (await import("@/components/trackers/local-date")).formatLocalDate();
    const yesterday = (await import("@/components/trackers/local-date")).addLocalDays(today, -1);

    const tracker = {
      id: "t-1",
      name: "Amma's Daily Care",
      healthFlags: ["diabetes"],
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
      nutrients: [
        {
          nutrientKey: "protein",
          label: "Protein",
          unit: "g",
          dailyTarget: 50,
          isCustomTarget: false,
          sortOrder: 0,
          targetKind: "goal",
        },
      ],
    };

    let currentLogs = [
      {
        id: "log-existing",
        trackerId: "t-1",
        logDate: today,
        loggedAt: "2026-11-26T07:30:00.000Z",
        entryType: "food",
        foodId: "f-1",
        medicineId: null,
        displayName: "Oatmeal",
        quantity: 100,
        unit: "g",
        computedNutrientsJson: { protein: 2.54, totalSugars: 40 },
        medicineNotes: null,
      },
    ];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/trackers/t-1") return Response.json({ tracker });
      if (url.startsWith("/api/trackers/t-1/summary?date=")) {
        const date = new URL(url, "https://app.test").searchParams.get("date")!;
        return Response.json({
          date,
          progress: [
            {
              ...tracker.nutrients[0],
              amount: date === today ? 2.54 : 0,
              hasAmount: date === today,
            },
          ],
          alerts:
            date === today
              ? [
                  {
                    healthFlag: "diabetes",
                    message: "Sugar logged today is above the tracker’s reference.",
                    triggers: [{ nutrientKey: "totalSugars", total: 40, threshold: 35, unit: "g" }],
                  },
                ]
              : [],
        });
      }
      if (url.startsWith("/api/trackers/t-1/logs?date=") && (!init?.method || init.method === "GET")) {
        const date = new URL(url, "https://app.test").searchParams.get("date")!;
        return Response.json({ logs: date === today ? currentLogs : [] });
      }
      if (url === "/api/medicines") {
        return Response.json({
          medicines: [
            {
              id: "med-1",
              brandName: "B12 Drop",
              genericName: null,
              category: "supplement",
              defaultDoseLabel: "1 drop",
              nutrientsPerDose: { vitaminB12: 2.4 },
              notes: null,
              scheduleHint: null,
              source: "manual",
              createdAt: "2026-11-20T00:00:00.000Z",
            },
          ],
          curated: [],
        });
      }
      if (url === "/api/trackers/t-1/logs" && init?.method === "POST") {
        const added = {
          id: "log-added",
          trackerId: "t-1",
          logDate: today,
          loggedAt: "2026-11-26T09:00:00.000Z",
          entryType: "medicine",
          foodId: null,
          medicineId: "med-1",
          displayName: "B12 Drop",
          quantity: 1,
          unit: "dose",
          computedNutrientsJson: { vitaminB12: 2.4 },
          medicineNotes: null,
        };
        currentLogs = [added, ...currentLogs];
        return Response.json({ log: added }, { status: 201 });
      }
      if (url === "/api/trackers/t-1/logs/log-added" && init?.method === "DELETE") {
        currentLogs = currentLogs.filter((l) => l.id !== "log-added");
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { default: TrackerTodayPage } = await import("@/app/trackers/[id]/page");
    render(<TrackerTodayPage />);

    expect(await screen.findByRole("heading", { name: "Amma's Daily Care" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /nutritional caution/i })).toBeInTheDocument();
    expect(screen.getByText("2.54 / 50 g")).toBeInTheDocument();
    expect(screen.getByText("Oatmeal")).toBeInTheDocument();

    // Log a medicine via 1-tap My Medicines -> UndoToast appears -> tap Undo calls DELETE
    fireEvent.click(screen.getByRole("button", { name: /\+ add medicine/i }));
    fireEvent.click(await screen.findByRole("button", { name: /log b12 drop/i }));

    expect((await screen.findAllByText(/logged b12 drop/i)).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => u === "/api/trackers/t-1/logs/log-added" && i?.method === "DELETE",
        ),
      ).toBe(true),
    );

    // Switch to Yesterday -> fetches yesterday's local date
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => u === `/api/trackers/t-1/summary?date=${yesterday}`),
      ).toBe(true),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 8"`
Expected: FAIL resolving `@/app/trackers/[id]/page`.

- [ ] **Step 3: Implement `src/app/trackers/[id]/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Pill, Utensils } from "lucide-react";
import { FoodLogModal } from "@/components/logging/food-log-modal";
import { MedicineLogModal } from "@/components/logging/medicine-log-modal";
import { CautionBanner } from "@/components/trackers/caution-banner";
import { DailyLogList } from "@/components/trackers/daily-log-list";
import {
  addLocalDays,
  formatFriendlyDate,
  formatLocalDate,
  isLocalDateString,
} from "@/components/trackers/local-date";
import { NutrientProgressCard } from "@/components/trackers/nutrient-progress-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UndoToast } from "@/components/ui/undo-toast";
import type { DailySummary, IntakeLog, Tracker } from "@/lib/trackers/service";

type ToastState =
  | { id: number; kind: "added"; logId: string; message: string }
  | { id: number; kind: "pending-delete"; log: IntakeLog; message: string };

const FLAG_PILLS = {
  diabetes: "Blood Sugar Watch",
  hypertension: "Blood Pressure Watch",
} as const;

export default function TrackerTodayPage() {
  const params = useParams<{ id: string }>();
  const trackerId = typeof params?.id === "string" ? params.id : "";

  const [today] = useState(() => formatLocalDate());
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate());
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [logs, setLogs] = useState<IntakeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState<"food" | "medicine" | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastCounter = useRef(0);
  const pendingDeleteRef = useRef<IntakeLog | null>(null);

  const loadDay = useCallback(
    async (date: string, signal?: AbortSignal) => {
      if (!trackerId) return;
      try {
        const [trackerRes, summaryRes, logsRes] = await Promise.all([
          fetch(`/api/trackers/${trackerId}`, { cache: "no-store", signal }),
          fetch(`/api/trackers/${trackerId}/summary?date=${date}`, { cache: "no-store", signal }),
          fetch(`/api/trackers/${trackerId}/logs?date=${date}`, { cache: "no-store", signal }),
        ]);
        if (signal?.aborted) return;
        if (
          trackerRes.status === 401 ||
          summaryRes.status === 401 ||
          logsRes.status === 401
        ) {
          window.location.replace("/login");
          return;
        }
        if (trackerRes.status === 404) {
          setError("Tracker not found.");
          setTracker(null);
          return;
        }
        if (!trackerRes.ok || !summaryRes.ok || !logsRes.ok) {
          throw new Error("load failed");
        }
        const [trackerBody, summaryBody, logsBody] = await Promise.all([
          trackerRes.json(),
          summaryRes.json(),
          logsRes.json(),
        ]);
        if (signal?.aborted) return;
        setError("");
        setTracker(trackerBody.tracker);
        setSummary(summaryBody);
        setLogs(Array.isArray(logsBody.logs) ? logsBody.logs : []);
      } catch {
        if (!signal?.aborted) {
          setError("Could not load this day's tracker. Try again.");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [trackerId],
  );

  const commitPendingDelete = useCallback(
    async (logToDelete: IntakeLog, refreshAfter = true) => {
      if (pendingDeleteRef.current?.id === logToDelete.id) {
        pendingDeleteRef.current = null;
      }
      try {
        await fetch(`/api/trackers/${trackerId}/logs/${logToDelete.id}`, {
          method: "DELETE",
          keepalive: true,
        });
      } finally {
        if (refreshAfter) {
          void loadDay(selectedDate);
        }
      }
    },
    [loadDay, selectedDate, trackerId],
  );

  const flushPendingDelete = useCallback(async () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    setToast(null);
    await commitPendingDelete(pending, false);
  }, [commitPendingDelete]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDay(selectedDate, controller.signal);
    return () => controller.abort();
  }, [loadDay, selectedDate]);

  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current;
      if (pending && trackerId) {
        pendingDeleteRef.current = null;
        void fetch(`/api/trackers/${trackerId}/logs/${pending.id}`, {
          method: "DELETE",
          keepalive: true,
        });
      }
    };
  }, [trackerId]);

  async function handleLogged(log: IntakeLog) {
    await flushPendingDelete();
    setOpenModal(null);
    toastCounter.current += 1;
    setToast({
      id: toastCounter.current,
      kind: "added",
      logId: log.id,
      message: `Logged ${log.displayName}`,
    });
    await loadDay(selectedDate);
  }

  async function handleEditQuantity(logId: string, quantity: number) {
    await flushPendingDelete();
    const response = await fetch(`/api/trackers/${trackerId}/logs/${logId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (response.status === 401) {
      window.location.replace("/login");
      return;
    }
    if (!response.ok) throw new Error("edit failed");
    await loadDay(selectedDate);
  }

  function handleDeleteLog(log: IntakeLog) {
    void (async () => {
      await flushPendingDelete();
      pendingDeleteRef.current = log;
      setLogs((current) => current.filter((item) => item.id !== log.id));
      toastCounter.current += 1;
      setToast({
        id: toastCounter.current,
        kind: "pending-delete",
        log,
        message: `Removed ${log.displayName}`,
      });
    })();
  }

  async function handleUndoToast() {
    const current = toast;
    setToast(null);
    if (!current) return;
    if (current.kind === "added") {
      try {
        await fetch(`/api/trackers/${trackerId}/logs/${current.logId}`, {
          method: "DELETE",
        });
      } finally {
        await loadDay(selectedDate);
      }
      return;
    }
    if (pendingDeleteRef.current?.id === current.log.id) {
      pendingDeleteRef.current = null;
    }
    await loadDay(selectedDate);
  }

  function handleToastExpire() {
    const current = toast;
    setToast(null);
    if (current?.kind === "pending-delete") {
      void commitPendingDelete(current.log, true);
    }
  }

  function changeDate(nextDate: string) {
    if (!isLocalDateString(nextDate)) return;
    void flushPendingDelete().then(() => setSelectedDate(nextDate));
  }

  const yesterday = addLocalDays(today, -1);

  return (
    <main className="space-y-6">
      {tracker && (
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-text">{tracker.name}</h1>
          {tracker.healthFlags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tracker.healthFlags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-accent bg-caution px-3 py-1 text-sm font-semibold text-caution-fg"
                >
                  {FLAG_PILLS[flag]}
                </span>
              ))}
            </div>
          )}
        </header>
      )}

      {/* Local-date switcher */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            aria-label="Previous day"
            onClick={() => changeDate(addLocalDays(selectedDate, -1))}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>

          <p className="text-xl font-bold text-text">
            {formatFriendlyDate(selectedDate, today)}
          </p>

          <Button
            variant="outline"
            aria-label="Next day"
            onClick={() => changeDate(addLocalDays(selectedDate, 1))}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={selectedDate === yesterday ? "primary" : "outline"}
            onClick={() => changeDate(yesterday)}
          >
            Yesterday
          </Button>
          <Button
            variant={selectedDate === today ? "primary" : "outline"}
            onClick={() => changeDate(today)}
          >
            Today
          </Button>
          <label className="ms-auto flex items-center gap-2">
            <span className="sr-only">Choose date</span>
            <input
              type="date"
              aria-label="Choose date"
              value={selectedDate}
              onChange={(event) => changeDate(event.currentTarget.value)}
              className="min-h-12 rounded-xl border border-border bg-canvas px-3"
            />
          </label>
        </div>
      </Card>

      {error && (
        <Card className="space-y-3 border-accent">
          <p role="alert" className="font-semibold text-accent">
            {error}
          </p>
          <Button variant="outline" onClick={() => void loadDay(selectedDate)}>
            Try again
          </Button>
        </Card>
      )}

      {loading && !summary ? (
        <p role="status" className="text-muted">
          Loading daily summary…
        </p>
      ) : (
        <>
          {summary && <CautionBanner alerts={summary.alerts} />}

          <section className="space-y-3" aria-labelledby="tracked-nutrients-heading">
            <h2 id="tracked-nutrients-heading" className="text-xl font-bold text-text">
              Tracked Nutrients
            </h2>
            {summary && summary.progress.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {summary.progress.map((item) => (
                  <NutrientProgressCard key={item.nutrientKey} item={item} />
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-muted">
                  This tracker is set up for medicine logging only (no daily nutrient cards selected).
                </p>
              </Card>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="todays-log-heading">
            <h2 id="todays-log-heading" className="text-xl font-bold text-text">
              {selectedDate === today ? "Today's Log" : `Log for ${formatFriendlyDate(selectedDate, today)}`}
            </h2>
            <DailyLogList
              logs={logs}
              onEditQuantity={handleEditQuantity}
              onDeleteLog={handleDeleteLog}
            />
          </section>
        </>
      )}

      {/* Sticky dual bottom action bar */}
      {tracker && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-3">
            <Button
              className="flex-1"
              onClick={() => setOpenModal("food")}
            >
              <Utensils className="me-2 h-5 w-5" aria-hidden="true" />
              <span>+ Add Food</span>
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setOpenModal("medicine")}
            >
              <Pill className="me-2 h-5 w-5" aria-hidden="true" />
              <span>+ Add Medicine</span>
            </Button>
          </div>
        </div>
      )}

      {openModal === "food" && tracker && (
        <FoodLogModal
          trackerId={tracker.id}
          logDate={selectedDate}
          trackerNutrients={tracker.nutrients}
          onClose={() => setOpenModal(null)}
          onLogged={(log) => void handleLogged(log)}
        />
      )}

      {openModal === "medicine" && tracker && (
        <MedicineLogModal
          trackerId={tracker.id}
          logDate={selectedDate}
          onClose={() => setOpenModal(null)}
          onLogged={(log) => void handleLogged(log)}
        />
      )}

      {toast && (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onUndo={() => void handleUndoToast()}
          onExpire={handleToastExpire}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 8"`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- "src/app/trackers/[id]/page.tsx" tests/tracker-ui.test.tsx
git commit -m "feat(ui): build Today tracker screen with date switcher, modals, and Undo"
```

---

## Task 9: Trackers Home Dashboard (`src/app/page.tsx`) & Final Verification Gate

**Files:**
- Create: `src/app/page.tsx`
- Modify: `tests/tracker-ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `tests/tracker-ui.test.tsx`:

```tsx
describe("Task 9: Trackers Home dashboard", () => {
  it("shows calm sign-in welcome and scope notice when unauthenticated", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: "Please sign in." }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { ThemeProvider } = await import("@/components/theme-provider");
    const { default: HomePage } = await import("@/app/page");
    render(
      <ThemeProvider>
        <HomePage />
      </ThemeProvider>,
    );

    expect(await screen.findByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/signup");
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
  });

  it("reconciles account theme on fresh device, lists trackers, and supports inline delete", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return Response.json({
          user: { id: "u-1", email: "amma@example.test", name: "Amma", theme: "dark", visionModel: null },
        });
      }
      if (url === "/api/trackers") {
        return Response.json({
          trackers: [
            {
              id: "t-1",
              name: "Amma's Daily Care",
              healthFlags: ["hypertension"],
              createdAt: "2026-11-26T00:00:00.000Z",
              updatedAt: "2026-11-26T00:00:00.000Z",
              nutrients: [
                {
                  nutrientKey: "sodium",
                  label: "Sodium",
                  unit: "mg",
                  dailyTarget: 2000,
                  isCustomTarget: true,
                  sortOrder: 0,
                  targetKind: "upper",
                },
              ],
            },
          ],
        });
      }
      if (url === "/api/trackers/t-1" && init?.method === "DELETE") {
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { ThemeProvider } = await import("@/components/theme-provider");
    const { THEME_STORAGE_KEY } = await import("@/components/ui/theme-init");
    const { default: HomePage } = await import("@/app/page");
    render(
      <ThemeProvider>
        <HomePage />
      </ThemeProvider>,
    );

    expect(await screen.findByText("Amma's Daily Care")).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("link", { name: /\+ new tracker/i })).toHaveAttribute(
      "href",
      "/trackers/new",
    );
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /open today/i })).toHaveAttribute("href", "/trackers/t-1");

    // Inline delete confirmation
    fireEvent.click(screen.getByRole("button", { name: /delete amma's daily care/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(screen.queryByText("Amma's Daily Care")).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tracker-ui.test.tsx -t "Task 9"`
Expected: FAIL resolving `@/app/page`.

- [ ] **Step 3: Implement `src/app/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Plus, Settings, Trash2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/components/ui/theme-init";
import type { Tracker } from "@/lib/trackers/service";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  theme: ThemeMode;
  visionModel: string | null;
};

const FLAG_LABELS = {
  diabetes: "Blood Sugar Watch",
  hypertension: "Blood Pressure Watch",
} as const;

export default function TrackersHomePage() {
  const { setMode } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadHome = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store", signal });
        if (signal?.aborted) return;
        if (meRes.status === 401) {
          setError("");
          setAuthState("signed-out");
          return;
        }
        if (!meRes.ok) throw new Error("auth check failed");
        const meBody = await meRes.json();
        const currentUser = meBody?.user as AuthUser | undefined;
        if (!currentUser) {
          setError("");
          setAuthState("signed-out");
          return;
        }
        setError("");
        setUser(currentUser);
        setAuthState("signed-in");

        // Reconcile account DB theme when this device has no saved preference yet.
        try {
          if (localStorage.getItem(THEME_STORAGE_KEY) === null && isThemeMode(currentUser.theme)) {
            setMode(currentUser.theme);
          }
        } catch {
          // Ignore storage access errors in restricted browsers.
        }

        const trackersRes = await fetch("/api/trackers", { cache: "no-store", signal });
        if (signal?.aborted) return;
        if (!trackersRes.ok) throw new Error("trackers load failed");
        const trackersBody = await trackersRes.json();
        if (!signal?.aborted) {
          setTrackers(Array.isArray(trackersBody?.trackers) ? trackersBody.trackers : []);
        }
      } catch {
        if (!signal?.aborted) {
          setError("Could not load your trackers. Check your connection and try again.");
        }
      }
    },
    [setMode],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadHome(controller.signal);
    return () => controller.abort();
  }, [loadHome]);

  async function deleteTracker(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(`/api/trackers/${id}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("delete failed");
      setTrackers((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setError("Could not delete this tracker. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (authState === "loading" && !error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p role="status" className="text-muted">
          Opening your daily care trackers…
        </p>
      </main>
    );
  }

  if (authState === "signed-out") {
    return (
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-text">Daily Care, Made Simple</h1>
          <p className="text-muted">
            Keep track of daily vitamins, minerals, foods, and medicines in one calm place.
          </p>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-4 py-2 font-semibold text-primary-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-canvas px-4 py-2 font-semibold text-text"
            >
              Create account
            </Link>
          </div>
        </Card>

        <aside className="border-s-4 border-accent ps-4" aria-labelledby="home-care-note">
          <h2 id="home-care-note" className="font-semibold text-accent">
            About this tracker
          </h2>
          <p>
            This app helps you keep track of daily care. It is not medical advice and does not
            replace your doctor, pharmacist, blood sugar meter, or blood pressure monitor.
          </p>
        </aside>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-text">Your Trackers</h1>
          {user && <p className="text-muted">Hello, {user.name}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold text-text"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <Link
            href="/trackers/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-fg"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>+ New Tracker</span>
          </Link>
        </div>
      </div>

      {error && (
        <Card className="space-y-3 border-accent">
          <p role="alert" className="font-semibold text-accent">
            {error}
          </p>
          <Button variant="outline" onClick={() => void loadHome()}>
            Try again
          </Button>
        </Card>
      )}

      {trackers.length === 0 ? (
        <Card className="space-y-4">
          <h2 className="text-xl font-bold text-text">No trackers yet</h2>
          <p className="text-muted">
            Create your first tracker with our 4-step guide so your daily screen shows only the
            nutrients and medicines you care about.
          </p>
          <Link
            href="/trackers/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-fg"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>Create Your First Tracker</span>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-4">
          {trackers.map((tracker) => (
            <li key={tracker.id}>
              <Card className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <h2 className="text-2xl font-bold text-text">{tracker.name}</h2>
                    {tracker.healthFlags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tracker.healthFlags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full border border-accent bg-caution px-3 py-0.5 text-sm font-semibold text-caution-fg"
                          >
                            {FLAG_LABELS[flag]}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-muted">
                      {tracker.nutrients.length === 0
                        ? "Medicine-only tracker"
                        : `${tracker.nutrients.length} tracked ${
                            tracker.nutrients.length === 1 ? "nutrient" : "nutrients"
                          }: ${tracker.nutrients
                            .slice(0, 4)
                            .map((item) => item.label)
                            .join(", ")}${tracker.nutrients.length > 4 ? "…" : ""}`}
                    </p>
                  </div>

                  {confirmDeleteId !== tracker.id && (
                    <Button
                      variant="outline"
                      aria-label={`Delete ${tracker.name}`}
                      onClick={() => setConfirmDeleteId(tracker.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>

                {confirmDeleteId === tracker.id ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-caution p-3 text-caution-fg">
                    <span className="font-semibold">Delete this tracker and its logs?</span>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={deletingId === tracker.id}
                        onClick={() => void deleteTracker(tracker.id)}
                      >
                        {deletingId === tracker.id ? "Deleting…" : "Confirm delete"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={deletingId === tracker.id}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/trackers/${tracker.id}`}
                      className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-fg"
                    >
                      Open Today
                    </Link>
                    <Link
                      href={`/trackers/${tracker.id}/analytics`}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-canvas px-4 font-semibold text-text"
                    >
                      <BarChart3 className="h-5 w-5" aria-hidden="true" />
                      <span>Analytics</span>
                    </Link>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the full P7 test suite and typecheck gate**

Run:
```powershell
npx vitest run tests/tracker-ui.test.tsx
npm run typecheck
```
Expected:
- `tests/tracker-ui.test.tsx`: all 12 tests PASS.
- `npm run typecheck`: exits `0` with zero TypeScript errors across `next typegen && tsc --noEmit`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/app/page.tsx tests/tracker-ui.test.tsx
git commit -m "feat(ui): add Trackers Home dashboard and complete P7 UI suite"
```

---

## Final Verification Gate (Before Reporting P7 Complete)

Run these commands from the repository root and confirm all exit `0`:

```powershell
npx vitest run tests/tracker-ui.test.tsx
npm run typecheck
npm run lint
```

Verify with `git status` that no files outside P7 ownership were modified, and no P8 analytics page files were created.
