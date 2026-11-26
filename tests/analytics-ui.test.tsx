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
