# P8 — Per-Tracker Analytics Page UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the calm, accessible, dual-chromatic Light/Dark `/trackers/[id]/analytics` page consuming P6's `7d`/`30d` analytics API with summary metrics, Needs Attention vs. On Track plain-language cards, interactive nutrient chip + Recharts trend chart with target line, caution-day indicators, medicine consistency, and a calm empty state.

**Architecture:** All analytics views are `"use client"` components styled exclusively with P1's semantic CSS-variable tokens (`bg-canvas`, `bg-surface`, `text-primary`, `text-accent`, `bg-caution`, etc.) and UI primitives (`Card`, `Button`) so Light and Dark modes work automatically without color branching. The page computes the user's local calendar `YYYY-MM-DD` end date, fetches `GET /api/trackers/[id]/analytics?range=7d|30d&endDate=YYYY-MM-DD` with `AbortController` race cancellation, and passes typed DTOs to five focused presentational components; zero backend, schema, or P7 files are touched.

**Tech Stack:** Next.js 16.4.6 App Router, React 19.3.1, TypeScript (`tsc` 7.0.2 + `next typegen`), Tailwind CSS 4.3.5, Recharts 3.11.1, Lucide React 1.81.0, Vitest 5.1.2, jsdom 31.0.1, Testing Library (`@testing-library/react` 16.3.3, `@testing-library/jest-dom` 8.0.0). No new packages.

---

## Owned Files & Strict Boundaries

| File | Responsibility |
| :--- | :--- |
| `src/components/analytics/range-toggle.tsx` | Accessible `7 Days` / `30 Days` segmented toggle (`≥48px` touch targets, `aria-pressed`). |
| `src/components/analytics/attention-summary.tsx` | Dual-chromatic `Needs Attention` vs. `On Track` plain-language insight cards with optional nutrient focus click. |
| `src/components/analytics/caution-days-strip.tsx` | Caution-day calendar strip + selectable date detail panel showing directional condition alerts and nutritional triggers. |
| `src/components/analytics/medicine-adherence-card.tsx` | Medicine consistency list reporting distinct logged days per medicine (`Logged X of N days`) with progress bars. |
| `src/components/analytics/nutrient-trend-chart.tsx` | Nutrient chip selector + Recharts `AreaChart` with target `ReferenceLine`, Light/Dark CSS-variable strokes, and custom tooltip distinguishing unreported vs. logged days. |
| `src/app/trackers/[id]/analytics/page.tsx` | Client page orchestrating local-date fetch, `AbortController`, summary metrics strip, empty/loading/error/404/401 states, and component layout. |
| `tests/analytics-ui.test.tsx` | jsdom + Testing Library coverage for all five components and full page states (empty, normal, high-caution, medicine-only, range switch, errors, Dark mode). |

**Execution Rules (Windows PowerShell 5.1):**
- Run commands from the repo root (`d:\Peter\Personal Stuffs\vitals-tracker`) as separate lines (avoid `&&` in PowerShell 5.1). Stop on any nonzero exit unless the step explicitly expects RED.
- Stage only the exact files listed in each task using `git add --` and **single-quote dynamic route paths** containing `[id]` (e.g., `'src/app/trackers/[id]/analytics/page.tsx'`) so PowerShell does not expand brackets as wildcards.
- **Do NOT modify** any P1–P6 files, `package.json`, `vitest.config.ts`, `vitest.setup.ts`, backend routes, services, schemas, or P7 files (`src/app/trackers/[id]/layout.tsx`, `src/app/trackers/[id]/page.tsx`, etc.). Do not create extra files outside the seven owned paths above.
- **React 19 / ESLint (`eslint-config-next@16.4.6`) rule:** Never call `setState` synchronously inside `useEffect` (`react-hooks/set-state-in-effect`). Put loading/reset state transitions in event handlers (`handleRangeChange`, `handleRetry`) and derive active selections (`activeNutrientKey`, `activeCautionDate`) during render instead of syncing state in effects.

---

## Upstream Contracts (Self-Contained Reference)

### 1. P1 Dual-Chromatic Theme Tokens & UI Primitives

Defined in `src/app/globals.css` (Light on `:root`, Dark on `html.dark` via `@custom-variant dark (&:where(.dark, .dark *))`):
- Tailwind semantic color utilities:
  - Neutrals: `bg-canvas`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `outline-focus`
  - Primary (Deep Teal / Emerald — wellness, goals, on-track): `bg-primary`, `text-primary`, `text-primary-fg`, `border-primary`
  - Secondary Accent (Warm Amber / Terracotta — attention, upper limits, medicine consistency): `bg-accent`, `text-accent`, `text-accent-fg`, `border-accent`
  - Caution surface (Soft Warm Amber): `bg-caution`, `text-caution-fg`
- Raw CSS variables for Recharts SVG props (automatically adapt to Light and Dark modes):
  - `var(--vt-primary)` (`#07594f` light / `#65e0c4` dark)
  - `var(--vt-accent)` (`#8a3915` light / `#ffbc75` dark)
  - `var(--vt-border)` (`#738881` light / `#76958c` dark)
  - `var(--vt-muted)` (`#475e58` light / `#abc4bd` dark)
  - `var(--vt-surface)` (`#ffffff` light / `#1a2a27` dark)
  - `var(--vt-text)` (`#172625` light / `#ecf6f3` dark)
- Typography & ergonomics: `body` already sets `text-base` (`18px`), `font-sans`, and `tabular-nums`. All interactive buttons/chips/links must use `min-h-12` (`≥48px`).
- Existing P1 primitives:
  - `import { Button } from "@/components/ui/button";` — props: `ComponentProps<"button"> & { variant?: "primary" | "secondary" | "outline" }` (default `type="button"`, `variant="primary"`, includes `min-h-12 min-w-12`).
  - `import { Card } from "@/components/ui/card";` — props: `ComponentProps<"div">` (`rounded-2xl border border-border bg-surface p-4 sm:p-6`).

### 2. P3 Pure Client-Safe Nutrient Utilities

- `import { NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";` — frozen map from `NutrientKey` to `{ category, label, unit, defaultDailyTarget }`. No `server-only`.
- `import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";` — returns `Number(amount.toFixed(4))` for visible display only (throws `RangeError` on negative/nonfinite). No `server-only`.

### 3. P6 Analytics API Contract

Endpoint: `GET /api/trackers/[id]/analytics?range=7d|30d&endDate=YYYY-MM-DD`
- `range`: `"7d"` (default) or `"30d"`.
- `endDate`: **required** single `YYYY-MM-DD` local calendar date (missing or duplicate returns `400`).
- Responses:
  - `200 { analytics: Analytics }` (`Cache-Control: no-store`)
  - `401 { error: "Please sign in." }` → redirect to `/login`
  - `404 { error: "Tracker not found." }` → show calm not-found state
  - `400 / 5xx { error: string }` → show calm retryable error state

Exact types in `src/lib/analytics/types.ts` (**MUST use `import type` only** in client components):
```ts
export type AnalyticsDay = { date: string; active: boolean; alerts: ImpactAlert[] };
export type TrendPoint = { date: string; amount: number; hasAmount: boolean };
export type NutrientTrend = {
  nutrientKey: NutrientKey;
  dailyTarget: number;
  isCustomTarget: boolean;
  sortOrder: number;
  label: string;
  unit: NutrientUnit;
  targetKind: "goal" | "upper";
  averageCompletionPct: number | null;
  series: TrendPoint[];
};
export type NutrientInsight = {
  nutrientKey: NutrientKey;
  reason: "lowCompletion" | "goalOnTrack" | "upperExceeded" | "upperWithinReference";
};
export type MedicineAdherence = {
  key: string; // "id:<uuid>" for live cabinet rows, "name:<lowercase>" after SET NULL
  medicineId: string | null;
  displayName: string;
  loggedDays: number;
  rangeDays: number;
  loggedDates: string[];
  loggedDayPct: number;
};
export type Analytics = {
  range: "7d" | "30d";
  startDate: string;
  endDate: string;
  activeDays: number;
  cautionDays: string[];
  cautionDayCount: number;
  averageCompletionPct: number | null;
  days: AnalyticsDay[];
  trends: NutrientTrend[];
  needsAttention: NutrientInsight[];
  onTrack: NutrientInsight[];
  medicineAdherence: MedicineAdherence[];
};
```
Where `ImpactAlert` (`@/lib/impact/types`) is:
```ts
export type HealthFlag = "diabetes" | "hypertension";
export type ImpactTrigger = Readonly<{
  nutrientKey: "totalSugars" | "addedSugars" | "sodium";
  total: number;
  threshold: number;
  unit: NutrientUnit;
}>;
export type ImpactAlert = Readonly<{
  healthFlag: HealthFlag;
  message: string;
  triggers: readonly ImpactTrigger[];
}>;
```

### 4. Vitest jsdom Setup Contract

- `vitest.config.ts` defaults to `environment: "node"`. Every UI test file **must** begin with `// @vitest-environment jsdom` on line 1.
- `vitest.setup.ts` loads `@testing-library/jest-dom/vitest`, mocks `server-only`, and runs `vi.unstubAllGlobals()` in `afterEach`, but Vitest `globals` is disabled — therefore `tests/analytics-ui.test.tsx` **must** call `cleanup()` from `@testing-library/react` in `afterEach`.
- Stub `ResizeObserver` in `beforeEach` for Recharts `ResponsiveContainer`, and pass `initialDimension={{ width: 640, height: 280 }}` + `isAnimationActive={false}` so Recharts renders synchronously and deterministically in jsdom.

---

## API Gaps & Contract Risks (Documented — No Backend or P7 Edits)

1. **Tracker metadata omitted from analytics payload & P7 layout ownership:** `GET /api/trackers/[id]/analytics` returns `{ analytics }` without `tracker.name` or `tracker.healthFlags`. P7 owns `src/app/trackers/[id]/layout.tsx` (which renders the tracker header and `Today | Analytics` tabs). P8 therefore renders a self-contained analytics body from `GET /api/trackers/[id]/analytics` alone without fetching `/api/trackers/[id]` redundantly, includes a clear `"Back to Today"` / `"Go to Today’s log"` link to `/trackers/${id}` for standalone and empty-state use, and uses `<main>` cleanly (P7's `trackers/[id]/layout.tsx` should use a non-`<main>` wrapper + `<nav>` to avoid nested `<main>` landmarks).
2. **`endDate` is mandatory and must use local calendar time:** `GET /api/trackers/[id]/analytics` rejects requests missing `endDate` with `400`. Client code must build `YYYY-MM-DD` from `getFullYear()`, `getMonth() + 1`, and `getDate()` — never `toISOString().slice(0, 10)`, which shifts dates in non-UTC timezones.
3. **`averageCompletionPct` is `0` (not `null`) on empty trackers with goal nutrients:** When `activeDays === 0`, P6 returns `averageCompletionPct: 0` if goal nutrients exist and `null` if none exist (e.g., medicine-only or upper-reference-only trackers). P8 **must** gate the calm empty state on `analytics.activeDays === 0` and format `averageCompletionPct === null` as `"—"` (`No daily goals selected`).
4. **Display reference line vs. condition impact threshold divergence:** For upper-limit nutrients without a custom override (`isCustomTarget: false`), `trend.dailyTarget` reflects the catalog default (`2300 mg` sodium, `50 g` added sugars) while P3's `impact-engine` warns at lower condition defaults (`2000 mg` sodium for `hypertension`, `25 g` added sugars for `diabetes`). Because `NutrientTrend` does not expose `impactThreshold`, a day at `2200 mg` sodium appears below the `2300 mg` chart reference line even though it triggers a caution and `upperExceeded`. P8 mitigates this by surfacing the exact `trigger.threshold` from `days[].alerts[].triggers[]` in `CautionDaysStrip` and labeling the chart line `"Daily reference"` with a plain-language note when an upper nutrient is flagged.
5. **Historical caution alert copy says `"today"`:** P3's `impact-engine` messages contain `"logged today"` even when P6 evaluates historical days in a 7d/30d window. P8 does not mutate backend strings; `CautionDaysStrip` scopes each alert under its explicit calendar date heading (e.g., `"Mar 6, 2024"`) and renders the numeric trigger breakdown directly beside the message.
6. **Medicine adherence covers only logged window items:** `analytics.medicineAdherence` omits saved "My Medicines" items that had zero logs in the window and does not include `category` or `scheduleHint`. P8 reports strictly `"Logged X of N days"` and never makes missed-dose or schedule-compliance claims.
7. **Type-only import boundary on `src/lib/analytics/types.ts`:** `src/lib/analytics/types.ts` imports `type { TrackerNutrient }` from `src/lib/trackers/service.ts` (which imports `server-only`). Client components **must** use `import type` from `@/lib/analytics/types` so Next.js erases the import at compile time and never pulls `server-only` into the client bundle.

---

## Task 1: Build `RangeToggle` and the Analytics UI Test Harness

**Files:**
- Create: `src/components/analytics/range-toggle.tsx`
- Create: `tests/analytics-ui.test.tsx`

- [ ] **Step 1: Write the failing test and reusable fixtures in `tests/analytics-ui.test.tsx`**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Analytics } from "@/lib/analytics/types";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export const emptyAnalyticsFixture: Analytics = {
  range: "7d",
  startDate: "2026-11-20",
  endDate: "2026-11-26",
  activeDays: 0,
  cautionDays: [],
  cautionDayCount: 0,
  averageCompletionPct: 0,
  days: [
    { date: "2026-11-20", active: false, alerts: [] },
    { date: "2026-11-21", active: false, alerts: [] },
    { date: "2026-11-22", active: false, alerts: [] },
    { date: "2026-11-23", active: false, alerts: [] },
    { date: "2026-11-24", active: false, alerts: [] },
    { date: "2026-11-25", active: false, alerts: [] },
    { date: "2026-11-26", active: false, alerts: [] },
  ],
  trends: [
    {
      nutrientKey: "protein",
      dailyTarget: 50,
      isCustomTarget: false,
      sortOrder: 0,
      label: "Protein",
      unit: "g",
      targetKind: "goal",
      averageCompletionPct: 0,
      series: [
        { date: "2026-11-20", amount: 0, hasAmount: false },
        { date: "2026-11-21", amount: 0, hasAmount: false },
        { date: "2026-11-22", amount: 0, hasAmount: false },
        { date: "2026-11-23", amount: 0, hasAmount: false },
        { date: "2026-11-24", amount: 0, hasAmount: false },
        { date: "2026-11-25", amount: 0, hasAmount: false },
        { date: "2026-11-26", amount: 0, hasAmount: false },
      ],
    },
  ],
  needsAttention: [],
  onTrack: [],
  medicineAdherence: [],
};

export const normalAnalyticsFixture: Analytics = {
  range: "7d",
  startDate: "2026-11-20",
  endDate: "2026-11-26",
  activeDays: 6,
  cautionDays: [],
  cautionDayCount: 0,
  averageCompletionPct: 86.4,
  days: [
    { date: "2026-11-20", active: true, alerts: [] },
    { date: "2026-11-21", active: true, alerts: [] },
    { date: "2026-11-22", active: true, alerts: [] },
    { date: "2026-11-23", active: false, alerts: [] },
    { date: "2026-11-24", active: true, alerts: [] },
    { date: "2026-11-25", active: true, alerts: [] },
    { date: "2026-11-26", active: true, alerts: [] },
  ],
  trends: [
    {
      nutrientKey: "protein",
      dailyTarget: 50,
      isCustomTarget: false,
      sortOrder: 0,
      label: "Protein",
      unit: "g",
      targetKind: "goal",
      averageCompletionPct: 92.1,
      series: [
        { date: "2026-11-20", amount: 48, hasAmount: true },
        { date: "2026-11-21", amount: 52, hasAmount: true },
        { date: "2026-11-22", amount: 50, hasAmount: true },
        { date: "2026-11-23", amount: 0, hasAmount: false },
        { date: "2026-11-24", amount: 51, hasAmount: true },
        { date: "2026-11-25", amount: 46, hasAmount: true },
        { date: "2026-11-26", amount: 54, hasAmount: true },
      ],
    },
    {
      nutrientKey: "vitaminD",
      dailyTarget: 20,
      isCustomTarget: false,
      sortOrder: 1,
      label: "Vitamin D",
      unit: "mcg",
      targetKind: "goal",
      averageCompletionPct: 62.5,
      series: [
        { date: "2026-11-20", amount: 15, hasAmount: true },
        { date: "2026-11-21", amount: 20, hasAmount: true },
        { date: "2026-11-22", amount: 10, hasAmount: true },
        { date: "2026-11-23", amount: 0, hasAmount: false },
        { date: "2026-11-24", amount: 15, hasAmount: true },
        { date: "2026-11-25", amount: 12.5, hasAmount: true },
        { date: "2026-11-26", amount: 15, hasAmount: true },
      ],
    },
    {
      nutrientKey: "sodium",
      dailyTarget: 2300,
      isCustomTarget: false,
      sortOrder: 2,
      label: "Sodium",
      unit: "mg",
      targetKind: "upper",
      averageCompletionPct: null,
      series: [
        { date: "2026-11-20", amount: 1400, hasAmount: true },
        { date: "2026-11-21", amount: 1650, hasAmount: true },
        { date: "2026-11-22", amount: 1500, hasAmount: true },
        { date: "2026-11-23", amount: 0, hasAmount: false },
        { date: "2026-11-24", amount: 1700, hasAmount: true },
        { date: "2026-11-25", amount: 1550, hasAmount: true },
        { date: "2026-11-26", amount: 1600, hasAmount: true },
      ],
    },
  ],
  needsAttention: [{ nutrientKey: "vitaminD", reason: "lowCompletion" }],
  onTrack: [
    { nutrientKey: "protein", reason: "goalOnTrack" },
    { nutrientKey: "sodium", reason: "upperWithinReference" },
  ],
  medicineAdherence: [
    {
      key: "id:med-1",
      medicineId: "med-1",
      displayName: "Vitamin D3 25 mcg",
      loggedDays: 6,
      rangeDays: 7,
      loggedDates: ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-24", "2026-11-25", "2026-11-26"],
      loggedDayPct: (6 / 7) * 100,
    },
  ],
};

export const highCautionAnalyticsFixture: Analytics = {
  range: "7d",
  startDate: "2026-11-20",
  endDate: "2026-11-26",
  activeDays: 4,
  cautionDays: ["2026-11-22", "2026-11-25"],
  cautionDayCount: 2,
  averageCompletionPct: 54.2,
  days: [
    { date: "2026-11-20", active: true, alerts: [] },
    { date: "2026-11-21", active: false, alerts: [] },
    {
      date: "2026-11-22",
      active: true,
      alerts: [
        {
          healthFlag: "diabetes",
          message: "Sugar logged today is above the tracker’s reference. Sugary foods and drinks can raise blood sugar.",
          triggers: [{ nutrientKey: "addedSugars", total: 31.5, threshold: 25, unit: "g" }],
        },
      ],
    },
    { date: "2026-11-23", active: false, alerts: [] },
    { date: "2026-11-24", active: true, alerts: [] },
    {
      date: "2026-11-25",
      active: true,
      alerts: [
        {
          healthFlag: "diabetes",
          message: "Sugar logged today is above the tracker’s reference. Sugary foods and drinks can raise blood sugar.",
          triggers: [{ nutrientKey: "totalSugars", total: 42, threshold: 35, unit: "g" }],
        },
        {
          healthFlag: "hypertension",
          message: "Sodium logged today is above the tracker’s reference. High-sodium foods can contribute to higher blood pressure.",
          triggers: [{ nutrientKey: "sodium", total: 2200, threshold: 2000, unit: "mg" }],
        },
      ],
    },
    { date: "2026-11-26", active: false, alerts: [] },
  ],
  trends: [
    {
      nutrientKey: "protein",
      dailyTarget: 50,
      isCustomTarget: false,
      sortOrder: 0,
      label: "Protein",
      unit: "g",
      targetKind: "goal",
      averageCompletionPct: 54.2,
      series: [
        { date: "2026-11-20", amount: 40, hasAmount: true },
        { date: "2026-11-21", amount: 0, hasAmount: false },
        { date: "2026-11-22", amount: 45, hasAmount: true },
        { date: "2026-11-23", amount: 0, hasAmount: false },
        { date: "2026-11-24", amount: 50, hasAmount: true },
        { date: "2026-11-25", amount: 48, hasAmount: true },
        { date: "2026-11-26", amount: 0, hasAmount: false },
      ],
    },
    {
      nutrientKey: "sodium",
      dailyTarget: 2300,
      isCustomTarget: false,
      sortOrder: 1,
      label: "Sodium",
      unit: "mg",
      targetKind: "upper",
      averageCompletionPct: null,
      series: [
        { date: "2026-11-20", amount: 1500, hasAmount: true },
        { date: "2026-11-21", amount: 0, hasAmount: false },
        { date: "2026-11-22", amount: 1850, hasAmount: true },
        { date: "2026-11-23", amount: 0, hasAmount: false },
        { date: "2026-11-24", amount: 1700, hasAmount: true },
        { date: "2026-11-25", amount: 2200, hasAmount: true },
        { date: "2026-11-26", amount: 0, hasAmount: false },
      ],
    },
  ],
  needsAttention: [
    { nutrientKey: "protein", reason: "lowCompletion" },
    { nutrientKey: "sodium", reason: "upperExceeded" },
  ],
  onTrack: [],
  medicineAdherence: [
    {
      key: "id:med-rx",
      medicineId: "med-rx",
      displayName: "Metformin",
      loggedDays: 4,
      rangeDays: 7,
      loggedDates: ["2026-11-20", "2026-11-22", "2026-11-24", "2026-11-25"],
      loggedDayPct: (4 / 7) * 100,
    },
    {
      key: "name:old vitamin",
      medicineId: null,
      displayName: "Old Vitamin",
      loggedDays: 2,
      rangeDays: 7,
      loggedDates: ["2026-11-20", "2026-11-24"],
      loggedDayPct: (2 / 7) * 100,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

describe("RangeToggle", () => {
  it("renders accessible 7 Days and 30 Days buttons with 48px targets and notifies changes", async () => {
    const { RangeToggle } = await import("@/components/analytics/range-toggle");
    const onChange = vi.fn();
    render(<RangeToggle value="7d" onChange={onChange} />);

    const group = screen.getByRole("group", { name: "Analytics time range" });
    expect(group).toBeInTheDocument();

    const seven = screen.getByRole("button", { name: "7 Days" });
    const thirty = screen.getByRole("button", { name: "30 Days" });
    expect(seven).toHaveAttribute("aria-pressed", "true");
    expect(thirty).toHaveAttribute("aria-pressed", "false");
    expect(seven).toHaveClass("min-h-12");
    expect(thirty).toHaveClass("min-h-12");

    fireEvent.click(thirty);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("30d");

    fireEvent.click(seven);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "RangeToggle"
```

Expected: FAIL resolving `@/components/analytics/range-toggle`.

- [ ] **Step 3: Implement `src/components/analytics/range-toggle.tsx`**

```tsx
"use client";

import type { Analytics } from "@/lib/analytics/types";

type AnalyticsRange = Analytics["range"];

const OPTIONS: ReadonlyArray<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

type RangeToggleProps = {
  value: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
  disabled?: boolean;
};

export function RangeToggle({ value, onChange, disabled = false }: RangeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Analytics time range"
      className="inline-flex rounded-2xl border border-border bg-surface p-1"
    >
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            className={[
              "min-h-12 min-w-28 cursor-pointer rounded-xl px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-primary text-primary-fg" : "bg-transparent text-text hover:bg-canvas",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "RangeToggle"
```

Expected: 1 passing test.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/analytics/range-toggle.tsx tests/analytics-ui.test.tsx
git commit -m "feat(analytics-ui): add accessible 7d/30d range toggle"
```

---

## Task 2: Build `AttentionSummary` (`Needs Attention` vs. `On Track`)

**Files:**
- Create: `src/components/analytics/attention-summary.tsx`
- Modify: `tests/analytics-ui.test.tsx`

- [ ] **Step 1: Append failing tests to `tests/analytics-ui.test.tsx`**

```tsx
describe("AttentionSummary", () => {
  it("renders plain-language Needs Attention and On Track cards and allows selecting a nutrient", async () => {
    const { AttentionSummary } = await import("@/components/analytics/attention-summary");
    const onSelectNutrient = vi.fn();
    render(
      <AttentionSummary
        needsAttention={normalAnalyticsFixture.needsAttention}
        onTrack={normalAnalyticsFixture.onTrack}
        trends={normalAnalyticsFixture.trends}
        onSelectNutrient={onSelectNutrient}
      />,
    );

    expect(screen.getByRole("heading", { name: "Needs Attention" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On Track" })).toBeInTheDocument();
    expect(screen.getByText("Vitamin D")).toBeInTheDocument();
    expect(screen.getByText("Averaging 63% of daily goal")).toBeInTheDocument();
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Averaging 92% of daily goal")).toBeInTheDocument();
    expect(screen.getByText("Sodium")).toBeInTheDocument();
    expect(screen.getByText("Within daily reference on logged days")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Vitamin D/i }));
    expect(onSelectNutrient).toHaveBeenCalledExactlyOnceWith("vitaminD");
  });

  it("explains upper-limit cautions plainly without clinical readings and handles empty columns", async () => {
    const { AttentionSummary } = await import("@/components/analytics/attention-summary");
    render(
      <AttentionSummary
        needsAttention={highCautionAnalyticsFixture.needsAttention}
        onTrack={highCautionAnalyticsFixture.onTrack}
        trends={highCautionAnalyticsFixture.trends}
      />,
    );

    expect(screen.getByText("Above daily reference on at least one day")).toBeInTheDocument();
    expect(screen.getByText("No nutrients have reached on-track range yet.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/mg\/dL|mmHg/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "AttentionSummary"
```

Expected: FAIL resolving `@/components/analytics/attention-summary`.

- [ ] **Step 3: Implement `src/components/analytics/attention-summary.tsx`**

```tsx
"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { NutrientInsight, NutrientTrend } from "@/lib/analytics/types";
import { NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import type { NutrientKey } from "@/lib/nutrients/types";

type AttentionSummaryProps = {
  needsAttention: readonly NutrientInsight[];
  onTrack: readonly NutrientInsight[];
  trends: readonly NutrientTrend[];
  onSelectNutrient?: (nutrientKey: NutrientKey) => void;
};

function describeInsight(insight: NutrientInsight, trend: NutrientTrend | undefined): string {
  const pct =
    trend?.averageCompletionPct !== null && trend?.averageCompletionPct !== undefined
      ? Math.round(trend.averageCompletionPct)
      : null;

  switch (insight.reason) {
    case "lowCompletion":
      return pct !== null ? `Averaging ${pct}% of daily goal` : "Below daily goal average";
    case "goalOnTrack":
      return pct !== null ? `Averaging ${pct}% of daily goal` : "Meeting daily goal average";
    case "upperExceeded":
      return "Above daily reference on at least one day";
    case "upperWithinReference":
      return "Within daily reference on logged days";
  }
}

export function AttentionSummary({
  needsAttention,
  onTrack,
  trends,
  onSelectNutrient,
}: AttentionSummaryProps) {
  const trendByKey = new Map(trends.map((trend) => [trend.nutrientKey, trend]));

  function renderList(items: readonly NutrientInsight[], tone: "accent" | "primary", emptyText: string) {
    if (items.length === 0) {
      return <p className="text-muted">{emptyText}</p>;
    }

    return (
      <ul className="space-y-2">
        {items.map((item) => {
          const trend = trendByKey.get(item.nutrientKey);
          const label = trend?.label ?? NUTRIENT_CATALOG[item.nutrientKey].label;
          const detail = describeInsight(item, trend);
          const badgeClass =
            tone === "accent"
              ? "border-accent/40 bg-caution text-caution-fg"
              : "border-primary/30 bg-canvas text-text";

          if (onSelectNutrient) {
            return (
              <li key={item.nutrientKey}>
                <button
                  type="button"
                  onClick={() => onSelectNutrient(item.nutrientKey)}
                  className={`flex min-h-12 w-full cursor-pointer flex-col items-start rounded-xl border px-4 py-3 text-left transition-opacity hover:opacity-90 ${badgeClass}`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="text-sm opacity-90">{detail}</span>
                </button>
              </li>
            );
          }

          return (
            <li
              key={item.nutrientKey}
              className={`flex min-h-12 flex-col justify-center rounded-xl border px-4 py-3 ${badgeClass}`}
            >
              <span className="font-semibold">{label}</span>
              <span className="text-sm opacity-90">{detail}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-label="Nutrient insights" className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 border-l-4 border-l-accent">
        <div className="flex items-center gap-2 text-accent">
          <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
          <h2 className="text-xl font-bold">Needs Attention</h2>
        </div>
        {renderList(needsAttention, "accent", "Nothing needs extra attention in this period.")}
      </Card>

      <Card className="space-y-3 border-l-4 border-l-primary">
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0" />
          <h2 className="text-xl font-bold">On Track</h2>
        </div>
        {renderList(onTrack, "primary", "No nutrients have reached on-track range yet.")}
      </Card>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "AttentionSummary"
```

Expected: 2 passing tests in `AttentionSummary`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/analytics/attention-summary.tsx tests/analytics-ui.test.tsx
git commit -m "feat(analytics-ui): add Needs Attention and On Track summary cards"
```

---

## Task 3: Build `CautionDaysStrip` (Caution-Day Indicators & Directional Details)

**Files:**
- Create: `src/components/analytics/caution-days-strip.tsx`
- Modify: `tests/analytics-ui.test.tsx`

- [ ] **Step 1: Append failing tests to `tests/analytics-ui.test.tsx`**

```tsx
describe("CautionDaysStrip", () => {
  it("renders a calm message when there are no caution days", async () => {
    const { CautionDaysStrip } = await import("@/components/analytics/caution-days-strip");
    render(
      <CautionDaysStrip
        days={normalAnalyticsFixture.days}
        cautionDays={normalAnalyticsFixture.cautionDays}
        range="7d"
      />,
    );

    expect(screen.getByRole("heading", { name: "Caution Days" })).toBeInTheDocument();
    expect(screen.getByText("No nutrition cautions in this period.")).toBeInTheDocument();
  });

  it("highlights caution dates, defaults to the most recent caution day, and lets users switch dates", async () => {
    const { CautionDaysStrip } = await import("@/components/analytics/caution-days-strip");
    render(
      <CautionDaysStrip
        days={highCautionAnalyticsFixture.days}
        cautionDays={highCautionAnalyticsFixture.cautionDays}
        range="7d"
      />,
    );

    // Defaults to most recent caution day: 2026-11-25 (Nov 25, 2026)
    expect(screen.getByText("Nov 25, 2026")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure watch")).toBeInTheDocument();
    expect(screen.getByText(/Sodium: 2,200 mg \(above 2,000 mg reference\)/)).toBeInTheDocument();

    // Switch to earlier caution day: 2026-11-22 (Nov 22)
    const nov22Button = screen.getByRole("button", { name: /Nov 22/i });
    expect(nov22Button).toHaveClass("min-h-12");
    fireEvent.click(nov22Button);

    expect(screen.getByText("Nov 22, 2026")).toBeInTheDocument();
    expect(screen.getByText("Blood sugar watch")).toBeInTheDocument();
    expect(screen.getByText(/Added Sugars: 31.5 g \(above 25 g reference\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/mg\/dL|mmHg/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "CautionDaysStrip"
```

Expected: FAIL resolving `@/components/analytics/caution-days-strip`.

- [ ] **Step 3: Implement `src/components/analytics/caution-days-strip.tsx`**

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Analytics, AnalyticsDay } from "@/lib/analytics/types";
import type { HealthFlag } from "@/lib/impact/types";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import { NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  if (!month || !day || month < 1 || month > 12) return isoDate;
  return `${MONTHS[month - 1]} ${day}`;
}

function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return isoDate;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function flagLabel(flag: HealthFlag): string {
  return flag === "diabetes" ? "Blood sugar watch" : "Blood pressure watch";
}

function formatAmount(value: number): string {
  return numberFormat.format(roundNutrientForDisplay(value));
}

type CautionDaysStripProps = {
  days: readonly AnalyticsDay[];
  cautionDays: readonly string[];
  range: Analytics["range"];
};

export function CautionDaysStrip({ days, cautionDays, range }: CautionDaysStripProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const cautionSet = new Set(cautionDays);

  const activeDate =
    selectedDate && cautionSet.has(selectedDate)
      ? selectedDate
      : cautionDays[cautionDays.length - 1] ?? null;

  const activeDay = activeDate ? days.find((day) => day.date === activeDate) ?? null : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cautionDays.length > 0 ? (
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-accent" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-primary" />
          )}
          <h2 className="text-xl font-bold">Caution Days</h2>
        </div>
        <span className="text-sm text-muted">
          {cautionDays.length} of {days.length} days
        </span>
      </div>

      {cautionDays.length === 0 ? (
        <p className="text-muted">No nutrition cautions in this period.</p>
      ) : (
        <div className="space-y-4">
          {range === "7d" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-7" role="group" aria-label="Days in period">
              {days.map((day) => {
                const isCaution = day.alerts.length > 0;
                const isSelected = day.date === activeDate;
                if (isCaution) {
                  return (
                    <button
                      key={day.date}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedDate(day.date)}
                      className={[
                        "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-semibold",
                        isSelected
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-accent bg-caution text-caution-fg",
                      ].join(" ")}
                    >
                      <span>{formatShortDate(day.date)}</span>
                      <span className="text-xs font-normal">Caution</span>
                    </button>
                  );
                }

                return (
                  <div
                    key={day.date}
                    className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-border bg-canvas px-2 py-2 text-sm text-muted"
                  >
                    <span>{formatShortDate(day.date)}</span>
                    <span className="text-xs">{day.active ? "Logged" : "No log"}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Caution dates in the last 30 days">
              {cautionDays.map((date) => {
                const isSelected = date === activeDate;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedDate(date)}
                    className={[
                      "min-h-12 cursor-pointer rounded-xl border px-4 py-2 font-semibold",
                      isSelected
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-accent bg-caution text-caution-fg",
                    ].join(" ")}
                  >
                    {formatShortDate(date)}
                  </button>
                );
              })}
            </div>
          )}

          {activeDay && activeDay.alerts.length > 0 && (
            <div className="space-y-3 rounded-xl border border-accent bg-caution p-4 text-caution-fg">
              <p className="font-bold">{formatLongDate(activeDay.date)}</p>
              <ul className="space-y-3">
                {activeDay.alerts.map((alert) => (
                  <li key={alert.healthFlag} className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-wide">
                      {flagLabel(alert.healthFlag)}
                    </p>
                    <p>{alert.message}</p>
                    <ul className="space-y-1 text-sm">
                      {alert.triggers.map((trigger) => (
                        <li key={trigger.nutrientKey}>
                          {NUTRIENT_CATALOG[trigger.nutrientKey].label}: {formatAmount(trigger.total)}{" "}
                          {trigger.unit} (above {formatAmount(trigger.threshold)} {trigger.unit} reference)
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "CautionDaysStrip"
```

Expected: 2 passing tests in `CautionDaysStrip`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/analytics/caution-days-strip.tsx tests/analytics-ui.test.tsx
git commit -m "feat(analytics-ui): add caution-day indicators and directional alert details"
```

---

## Task 4: Build `MedicineAdherenceCard` (Medicine Consistency)

**Files:**
- Create: `src/components/analytics/medicine-adherence-card.tsx`
- Modify: `tests/analytics-ui.test.tsx`

- [ ] **Step 1: Append failing tests to `tests/analytics-ui.test.tsx`**

```tsx
describe("MedicineAdherenceCard", () => {
  it("shows distinct logged days and accessible progress bars for live and historical medicines", async () => {
    const { MedicineAdherenceCard } = await import("@/components/analytics/medicine-adherence-card");
    render(<MedicineAdherenceCard items={highCautionAnalyticsFixture.medicineAdherence} range="7d" />);

    expect(screen.getByRole("heading", { name: "Medicine Consistency" })).toBeInTheDocument();
    expect(screen.getByText("Metformin")).toBeInTheDocument();
    expect(screen.getByText(/Logged 4 of 7 days \(57%\)/)).toBeInTheDocument();
    expect(screen.getByText("Old Vitamin")).toBeInTheDocument();
    expect(screen.getByText(/Logged 2 of 7 days \(29%\)/)).toBeInTheDocument();

    const bar = screen.getByRole("progressbar", { name: "Metformin logged days" });
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "7");
  });

  it("shows a calm empty message when no medicines were logged in the window", async () => {
    const { MedicineAdherenceCard } = await import("@/components/analytics/medicine-adherence-card");
    render(<MedicineAdherenceCard items={[]} range="30d" />);

    expect(screen.getByText("No medicines or supplements logged in the last 30 days.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "MedicineAdherenceCard"
```

Expected: FAIL resolving `@/components/analytics/medicine-adherence-card`.

- [ ] **Step 3: Implement `src/components/analytics/medicine-adherence-card.tsx`**

```tsx
"use client";

import { Pill } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Analytics, MedicineAdherence } from "@/lib/analytics/types";

type MedicineAdherenceCardProps = {
  items: readonly MedicineAdherence[];
  range: Analytics["range"];
};

export function MedicineAdherenceCard({ items, range }: MedicineAdherenceCardProps) {
  const daysLabel = range === "7d" ? "7 days" : "30 days";

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Pill aria-hidden="true" className="h-5 w-5 text-accent" />
        <h2 className="text-xl font-bold">Medicine Consistency</h2>
      </div>

      {items.length === 0 ? (
        <p className="text-muted">No medicines or supplements logged in the last {daysLabel}.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const pct = Math.max(0, Math.min(100, Math.round(item.loggedDayPct)));
            return (
              <li key={item.key} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-text">{item.displayName}</span>
                  <span className="text-sm text-muted">
                    Logged {item.loggedDays} of {item.rangeDays} days ({pct}%)
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${item.displayName} logged days`}
                  aria-valuemin={0}
                  aria-valuemax={item.rangeDays}
                  aria-valuenow={item.loggedDays}
                  className="h-3 w-full overflow-hidden rounded-full bg-canvas"
                >
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "MedicineAdherenceCard"
```

Expected: 2 passing tests in `MedicineAdherenceCard`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/analytics/medicine-adherence-card.tsx tests/analytics-ui.test.tsx
git commit -m "feat(analytics-ui): add medicine consistency card"
```

---

## Task 5: Build `NutrientTrendChart` (Chip Selector + Dual-Chromatic Recharts Area Chart)

**Files:**
- Create: `src/components/analytics/nutrient-trend-chart.tsx`
- Modify: `tests/analytics-ui.test.tsx`

- [ ] **Step 1: Append failing tests to `tests/analytics-ui.test.tsx`**

```tsx
describe("NutrientTrendChart", () => {
  it("renders selectable nutrient chips, displays the target reference, and switches charts on click", async () => {
    const { NutrientTrendChart } = await import("@/components/analytics/nutrient-trend-chart");
    const onSelectKey = vi.fn();
    const { rerender } = render(
      <NutrientTrendChart
        trends={normalAnalyticsFixture.trends}
        selectedKey="protein"
        onSelectKey={onSelectKey}
        range="7d"
      />,
    );

    const proteinChip = screen.getByRole("button", { name: "Protein" });
    const sodiumChip = screen.getByRole("button", { name: "Sodium" });
    expect(proteinChip).toHaveAttribute("aria-pressed", "true");
    expect(sodiumChip).toHaveAttribute("aria-pressed", "false");
    expect(proteinChip).toHaveClass("min-h-12");
    expect(screen.getByText(/Daily goal: 50 g/i)).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(sodiumChip);
    expect(onSelectKey).toHaveBeenCalledExactlyOnceWith("sodium");

    rerender(
      <NutrientTrendChart
        trends={normalAnalyticsFixture.trends}
        selectedKey="sodium"
        onSelectKey={onSelectKey}
        range="7d"
      />,
    );
    expect(screen.getByRole("button", { name: "Sodium" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Daily limit reference: 2,300 mg/i)).toBeInTheDocument();
  });

  it("renders a calm message for medicine-only trackers with no selected nutrients", async () => {
    const { NutrientTrendChart } = await import("@/components/analytics/nutrient-trend-chart");
    render(
      <NutrientTrendChart
        trends={[]}
        selectedKey={null}
        onSelectKey={vi.fn()}
        range="7d"
      />,
    );

    expect(screen.getByText(/No nutrients are selected for this tracker/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "NutrientTrendChart"
```

Expected: FAIL resolving `@/components/analytics/nutrient-trend-chart`.

- [ ] **Step 3: Implement `src/components/analytics/nutrient-trend-chart.tsx`**

```tsx
"use client";

import { useId } from "react";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { Analytics, NutrientTrend } from "@/lib/analytics/types";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import type { NutrientKey } from "@/lib/nutrients/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

type ChartDatum = {
  date: string;
  shortDate: string;
  amount: number;
  hasAmount: boolean;
};

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  if (!month || !day || month < 1 || month > 12) return isoDate;
  return `${MONTHS[month - 1]} ${day}`;
}

function formatAmount(value: number): string {
  return numberFormat.format(roundNutrientForDisplay(value));
}

function isChartDatum(value: unknown): value is ChartDatum {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.date === "string" &&
    typeof candidate.shortDate === "string" &&
    typeof candidate.amount === "number" &&
    typeof candidate.hasAmount === "boolean"
  );
}

function renderTooltip(
  props: TooltipContentProps,
  unit: string,
  dailyTarget: number,
  isUpper: boolean,
) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const raw = props.payload[0]?.payload;
  if (!isChartDatum(raw)) return null;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm">
      <p className="font-semibold">{raw.shortDate}</p>
      <p>
        {raw.hasAmount ? `${formatAmount(raw.amount)} ${unit}` : "Not logged"}
      </p>
      <p className="text-muted">
        {isUpper ? "Limit reference" : "Daily goal"}: {formatAmount(dailyTarget)} {unit}
      </p>
    </div>
  );
}

type NutrientTrendChartProps = {
  trends: readonly NutrientTrend[];
  selectedKey: NutrientKey | null;
  onSelectKey: (nutrientKey: NutrientKey) => void;
  range: Analytics["range"];
};

export function NutrientTrendChart({
  trends,
  selectedKey,
  onSelectKey,
  range,
}: NutrientTrendChartProps) {
  const gradientId = useId();

  if (trends.length === 0) {
    return (
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Nutrient Trends</h2>
        </div>
        <p className="text-muted">
          No nutrients are selected for this tracker. Medicine consistency is shown below.
        </p>
      </Card>
    );
  }

  const activeTrend = trends.find((trend) => trend.nutrientKey === selectedKey) ?? trends[0];
  const isUpper = activeTrend.targetKind === "upper";
  const seriesStroke = isUpper ? "var(--vt-accent)" : "var(--vt-primary)";
  const targetStroke = isUpper ? "var(--vt-muted)" : "var(--vt-accent)";

  const chartData: ChartDatum[] = activeTrend.series.map((point) => ({
    date: point.date,
    shortDate: formatShortDate(point.date),
    amount: point.amount,
    hasAmount: point.hasAmount,
  }));

  const maxObserved = chartData.reduce((max, point) => Math.max(max, point.amount), 0);
  const yMax = Math.ceil(Math.max(activeTrend.dailyTarget, maxObserved, 1) * 1.15);

  const targetText = isUpper
    ? `Daily limit reference: ${formatAmount(activeTrend.dailyTarget)} ${activeTrend.unit}`
    : `Daily goal: ${formatAmount(activeTrend.dailyTarget)} ${activeTrend.unit}`;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Nutrient Trends</h2>
        </div>
        <span className="text-sm text-muted">
          {range === "7d" ? "Last 7 days" : "Last 30 days"}
        </span>
      </div>

      <div
        role="group"
        aria-label="Choose a nutrient to view"
        className="flex flex-wrap gap-2"
      >
        {trends.map((trend) => {
          const active = trend.nutrientKey === activeTrend.nutrientKey;
          const activeTone =
            trend.targetKind === "upper"
              ? "border-accent bg-accent text-accent-fg"
              : "border-primary bg-primary text-primary-fg";

          return (
            <button
              key={trend.nutrientKey}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectKey(trend.nutrientKey)}
              className={[
                "min-h-12 cursor-pointer rounded-xl border px-4 py-2 font-semibold transition-colors",
                active ? activeTone : "border-border bg-canvas text-text hover:bg-surface",
              ].join(" ")}
            >
              {trend.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/50 pt-3">
        <div>
          <h3 className="text-lg font-bold">{activeTrend.label}</h3>
          <p className="text-sm text-muted">{targetText}</p>
        </div>
        {activeTrend.averageCompletionPct !== null && (
          <p className="font-semibold text-primary">
            {Math.round(activeTrend.averageCompletionPct)}% avg
          </p>
        )}
      </div>

      <div
        className="h-[280px] w-full"
        role="img"
        aria-label={`${activeTrend.label} trend over the last ${range === "7d" ? "7" : "30"} days. ${targetText}.`}
      >
        <ResponsiveContainer
          width="100%"
          height={280}
          initialDimension={{ width: 640, height: 280 }}
        >
          <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={seriesStroke} stopOpacity={0.28} />
                <stop offset="95%" stopColor={seriesStroke} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vt-border)" strokeOpacity={0.35} />
            <XAxis
              dataKey="shortDate"
              stroke="var(--vt-muted)"
              tick={{ fill: "var(--vt-muted)", fontSize: 13 }}
              interval="preserveStartEnd"
              minTickGap={range === "30d" ? 28 : 12}
            />
            <YAxis
              domain={[0, yMax]}
              stroke="var(--vt-muted)"
              tick={{ fill: "var(--vt-muted)", fontSize: 13 }}
              width={56}
            />
            <Tooltip
              isAnimationActive={false}
              content={(props) => renderTooltip(props, activeTrend.unit, activeTrend.dailyTarget, isUpper)}
            />
            <ReferenceLine
              y={activeTrend.dailyTarget}
              stroke={targetStroke}
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: isUpper ? "Reference" : "Target",
                position: "insideTopRight",
                fill: targetStroke,
                fontSize: 13,
              }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              name={activeTrend.label}
              stroke={seriesStroke}
              strokeWidth={3}
              fill={`url(#${gradientId})`}
              dot={{ r: 4, fill: seriesStroke, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: seriesStroke }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "NutrientTrendChart"
```

Expected: 2 passing tests in `NutrientTrendChart`.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/analytics/nutrient-trend-chart.tsx tests/analytics-ui.test.tsx
git commit -m "feat(analytics-ui): add dual-chromatic nutrient chip selector and Recharts trend chart"
```

---

## Task 6: Assemble `/trackers/[id]/analytics` Page

**Files:**
- Create: `src/app/trackers/[id]/analytics/page.tsx`
- Modify: `tests/analytics-ui.test.tsx`

- [ ] **Step 1: Add navigation mocks and full-page tests to `tests/analytics-ui.test.tsx`**

Add this mock block directly after the `import type { Analytics }` line at the top of `tests/analytics-ui.test.tsx`:

```tsx
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "tracker-123" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));
```

Reset `replaceMock.mockClear()` inside `beforeEach`. Then append these page-level tests to `tests/analytics-ui.test.tsx`:

```tsx
function mockAnalyticsFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("TrackerAnalyticsPage", () => {
  it("renders a calm empty state for brand-new trackers and links back to Today", async () => {
    const { default: TrackerAnalyticsPage } = await import("@/app/trackers/[id]/analytics/page");
    const fetchMock = mockAnalyticsFetch(() => Response.json({ analytics: emptyAnalyticsFixture }));

    render(<TrackerAnalyticsPage />);

    expect(await screen.findByText("No logs yet for the last 7 days")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Today’s log" })).toHaveAttribute("href", "/trackers/tracker-123");
    expect(screen.queryByRole("heading", { name: "Needs Attention" })).not.toBeInTheDocument();

    // Verifies required local YYYY-MM-DD endDate and default 7d range
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toMatch(/^\/api\/trackers\/tracker-123\/analytics\?range=7d&endDate=\d{4}-\d{2}-\d{2}$/);
  });

  it("renders normal analytics metrics, switches between 7d and 30d, and focuses a nutrient from insights", async () => {
    const { default: TrackerAnalyticsPage } = await import("@/app/trackers/[id]/analytics/page");
    const monthFixture: Analytics = {
      ...normalAnalyticsFixture,
      range: "30d",
      startDate: "2026-10-28",
      activeDays: 22,
      averageCompletionPct: 81.2,
      days: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-11-${String((index % 26) + 1).padStart(2, "0")}`,
        active: index < 22,
        alerts: [],
      })),
    };

    const fetchMock = mockAnalyticsFetch((url) =>
      Response.json({ analytics: url.includes("range=30d") ? monthFixture : normalAnalyticsFixture }),
    );

    render(<TrackerAnalyticsPage />);

    expect(await screen.findByText("86%")).toBeInTheDocument();
    expect(screen.getByText("6 of 7")).toBeInTheDocument();
    expect(screen.getByText("Vitamin D3 25 mcg")).toBeInTheDocument();

    // Clicking an insight button focuses that nutrient in the chart
    fireEvent.click(screen.getByRole("button", { name: /Vitamin D.*Averaging 63%/i }));
    expect(screen.getByRole("button", { name: "Vitamin D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Daily goal: 20 mcg/i)).toBeInTheDocument();

    // Toggle to 30 Days
    fireEvent.click(screen.getByRole("button", { name: "30 Days" }));
    expect(await screen.findByText("81%")).toBeInTheDocument();
    expect(screen.getByText("22 of 30")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("range=30d");
  });

  it("renders high-caution analytics cleanly in Dark mode without clinical readings", async () => {
    document.documentElement.classList.add("dark");
    const { default: TrackerAnalyticsPage } = await import("@/app/trackers/[id]/analytics/page");
    mockAnalyticsFetch(() => Response.json({ analytics: highCautionAnalyticsFixture }));

    render(<TrackerAnalyticsPage />);

    expect(await screen.findByText("54%")).toBeInTheDocument();
    expect(screen.getByText("4 of 7")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure watch")).toBeInTheDocument();
    expect(screen.getByText("Metformin")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.body.textContent).not.toMatch(/mg\/dL|mmHg/i);
  });

  it("handles medicine-only trackers (null averageCompletionPct), 401 redirect, and retryable errors", async () => {
    const { default: TrackerAnalyticsPage } = await import("@/app/trackers/[id]/analytics/page");
    const medicineOnly: Analytics = {
      ...highCautionAnalyticsFixture,
      averageCompletionPct: null,
      trends: [],
      needsAttention: [],
      onTrack: [],
      cautionDays: [],
      cautionDayCount: 0,
      days: highCautionAnalyticsFixture.days.map((day) => ({ ...day, alerts: [] })),
    };

    mockAnalyticsFetch(() => Response.json({ analytics: medicineOnly }));
    const first = render(<TrackerAnalyticsPage />);
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.getByText("No daily goals tracked")).toBeInTheDocument();
    expect(screen.getByText(/No nutrients are selected for this tracker/i)).toBeInTheDocument();
    first.unmount();

    // 401 redirects to /login
    mockAnalyticsFetch(() => Response.json({ error: "Please sign in." }, { status: 401 }));
    const unauth = render(<TrackerAnalyticsPage />);
    await vi.waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    unauth.unmount();

    // 404 shows calm not-found card
    mockAnalyticsFetch(() => Response.json({ error: "Tracker not found." }, { status: 404 }));
    const missing = render(<TrackerAnalyticsPage />);
    expect(await screen.findByRole("heading", { name: "Tracker not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to trackers" })).toHaveAttribute("href", "/");
    missing.unmount();

    // 500 displays retryable error and recovers on Try again
    let attempts = 0;
    mockAnalyticsFetch(() => {
      attempts += 1;
      if (attempts === 1) return Response.json({ error: "Temporary issue." }, { status: 500 });
      return Response.json({ analytics: normalAnalyticsFixture });
    });

    render(<TrackerAnalyticsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load analytics/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("86%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```powershell
npx vitest run tests/analytics-ui.test.tsx -t "TrackerAnalyticsPage"
```

Expected: FAIL resolving `@/app/trackers/[id]/analytics/page`.

- [ ] **Step 3: Implement `src/app/trackers/[id]/analytics/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";
import { AttentionSummary } from "@/components/analytics/attention-summary";
import { CautionDaysStrip } from "@/components/analytics/caution-days-strip";
import { MedicineAdherenceCard } from "@/components/analytics/medicine-adherence-card";
import { NutrientTrendChart } from "@/components/analytics/nutrient-trend-chart";
import { RangeToggle } from "@/components/analytics/range-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Analytics } from "@/lib/analytics/types";
import type { NutrientKey } from "@/lib/nutrients/types";

type AnalyticsRange = Analytics["range"];

function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TrackerAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const trackerId = typeof params?.id === "string" ? params.id : "";

  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [selectedKey, setSelectedKey] = useState<NutrientKey | null>(null);

  useEffect(() => {
    if (!trackerId) return;
    const controller = new AbortController();
    const endDate = localTodayIso();

    async function load() {
      try {
        const query = new URLSearchParams({ range, endDate }).toString();
        const response = await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/analytics?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 404) {
          setAnalytics(null);
          setNotFound(true);
          setError("");
          setLoading(false);
          return;
        }
        if (!response.ok) {
          throw new Error("analytics unavailable");
        }
        const body = (await response.json()) as { analytics?: Analytics };
        if (controller.signal.aborted) return;
        if (!body?.analytics) {
          throw new Error("analytics missing");
        }
        setAnalytics(body.analytics);
        setNotFound(false);
        setError("");
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not load analytics right now. Check your connection and try again.");
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [trackerId, range, reloadTick, router]);

  function handleRangeChange(nextRange: AnalyticsRange) {
    if (nextRange === range) return;
    setRange(nextRange);
    setLoading(true);
    setError("");
    setNotFound(false);
  }

  function handleRetry() {
    setLoading(true);
    setError("");
    setNotFound(false);
    setReloadTick((value) => value + 1);
  }

  const activeNutrientKey: NutrientKey | null = (() => {
    const trends = analytics?.trends ?? [];
    if (trends.length === 0) return null;
    if (selectedKey && trends.some((trend) => trend.nutrientKey === selectedKey)) {
      return selectedKey;
    }
    return trends[0].nutrientKey;
  })();

  const rangeDays = range === "7d" ? 7 : 30;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={trackerId ? `/trackers/${trackerId}` : "/"}
            className="inline-flex min-h-12 items-center gap-2 text-primary underline"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>Back to Today</span>
          </Link>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted">Simple trends and daily care insights for the last {rangeDays} days.</p>
        </div>

        <RangeToggle value={range} onChange={handleRangeChange} />
      </div>

      {loading && !analytics && (
        <Card>
          <p role="status" className="text-muted">
            Loading your {rangeDays}-day overview…
          </p>
        </Card>
      )}

      {notFound && (
        <Card className="space-y-4">
          <h2 className="text-xl font-bold">Tracker not found</h2>
          <p className="text-muted">This tracker may have been removed or belongs to another account.</p>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-2 font-semibold text-primary-fg"
          >
            Back to trackers
          </Link>
        </Card>
      )}

      {error && (
        <Card className="space-y-4 border-accent">
          <p role="alert" className="font-semibold text-accent">
            {error}
          </p>
          <Button variant="outline" onClick={handleRetry}>
            Try again
          </Button>
        </Card>
      )}

      {analytics && !notFound && (
        <>
          {loading && (
            <p role="status" className="text-sm text-muted">
              Updating {rangeDays}-day view…
            </p>
          )}

          {analytics.activeDays === 0 ? (
            <Card className="space-y-4 text-center sm:p-8">
              <h2 className="text-2xl font-bold">No logs yet for the last {rangeDays} days</h2>
              <p className="mx-auto max-w-xl text-muted">
                Once you log a meal or medicine on the Today screen, your nutrient trends, daily insights, and medicine consistency will appear here.
              </p>
              {range === "7d" && (
                <p className="text-sm text-muted">
                  Logged earlier this month? Switch to 30 Days above to check older entries.
                </p>
              )}
              <div className="pt-2">
                <Link
                  href={`/trackers/${trackerId}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-primary-fg"
                >
                  Go to Today’s log
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              <section aria-label="Summary metrics" className="grid gap-4 sm:grid-cols-3">
                <Card className="space-y-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Activity aria-hidden="true" className="h-5 w-5" />
                    <span className="text-sm font-semibold">Average Goal Completion</span>
                  </div>
                  <p className="text-3xl font-bold text-text">
                    {analytics.averageCompletionPct !== null
                      ? `${Math.round(analytics.averageCompletionPct)}%`
                      : "—"}
                  </p>
                  <p className="text-sm text-muted">
                    {analytics.averageCompletionPct !== null
                      ? "Across daily goal nutrients"
                      : "No daily goals tracked"}
                  </p>
                </Card>

                <Card className="space-y-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Calendar aria-hidden="true" className="h-5 w-5" />
                    <span className="text-sm font-semibold">Active Days</span>
                  </div>
                  <p className="text-3xl font-bold text-text">
                    {analytics.activeDays} of {analytics.days.length}
                  </p>
                  <p className="text-sm text-muted">Days with food or medicine logged</p>
                </Card>

                <Card
                  className={
                    analytics.cautionDayCount > 0
                      ? "space-y-1 border-accent bg-caution text-caution-fg"
                      : "space-y-1"
                  }
                >
                  <div
                    className={`flex items-center gap-2 ${
                      analytics.cautionDayCount > 0 ? "text-caution-fg" : "text-primary"
                    }`}
                  >
                    {analytics.cautionDayCount > 0 ? (
                      <AlertTriangle aria-hidden="true" className="h-5 w-5" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                    )}
                    <span className="text-sm font-semibold">Caution Days</span>
                  </div>
                  <p className="text-3xl font-bold">{analytics.cautionDayCount}</p>
                  <p
                    className={`text-sm ${
                      analytics.cautionDayCount > 0 ? "text-caution-fg/90" : "text-muted"
                    }`}
                  >
                    {analytics.cautionDayCount > 0
                      ? "Days above sugar or sodium reference"
                      : "No caution days in this period"}
                  </p>
                </Card>
              </section>

              <AttentionSummary
                needsAttention={analytics.needsAttention}
                onTrack={analytics.onTrack}
                trends={analytics.trends}
                onSelectNutrient={setSelectedKey}
              />

              <NutrientTrendChart
                trends={analytics.trends}
                selectedKey={activeNutrientKey}
                onSelectKey={setSelectedKey}
                range={analytics.range}
              />

              <CautionDaysStrip
                days={analytics.days}
                cautionDays={analytics.cautionDays}
                range={analytics.range}
              />

              <MedicineAdherenceCard
                items={analytics.medicineAdherence}
                range={analytics.range}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```powershell
npx vitest run tests/analytics-ui.test.tsx
```

Expected: All 13 tests across `RangeToggle`, `AttentionSummary`, `CautionDaysStrip`, `MedicineAdherenceCard`, `NutrientTrendChart`, and `TrackerAnalyticsPage` pass.

- [ ] **Step 5: Commit**

```powershell
git add -- 'src/app/trackers/[id]/analytics/page.tsx' tests/analytics-ui.test.tsx
git commit -m "feat(analytics-ui): assemble per-tracker 7d/30d analytics page"
```

---

## Task 7: Run Final Verification Gate

**Files:** Read-only verification, no additional commit.

- [ ] **Step 1: Run the required P8 exit gate commands separately**

```powershell
npx vitest run tests/analytics-ui.test.tsx
npm run typecheck
npm run lint
```

Expected:
- `tests/analytics-ui.test.tsx`: all 13 tests pass with zero console errors.
- `npm run typecheck`: exit code `0` (`next typegen && tsc --noEmit`).
- `npm run lint`: exit code `0` with zero errors (the pre-existing P1 `postcss.config.mjs` warning is non-blocking).

- [ ] **Step 2: Verify clean git state and strict file ownership**

```powershell
git diff --check
git status --short
```

Expected: Clean working tree, no whitespace errors, and all P8 commits touch **only** the seven P8-owned files. Report commit hashes, test/typecheck/lint outputs, and any observed layout interop notes back to the orchestrator.
