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
