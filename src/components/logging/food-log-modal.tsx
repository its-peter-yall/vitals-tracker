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
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setManualAmounts((current) => ({
                            ...current,
                            [key]: nextValue,
                          }));
                        }}
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
