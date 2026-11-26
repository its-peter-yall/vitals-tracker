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
