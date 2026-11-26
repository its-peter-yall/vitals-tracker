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
