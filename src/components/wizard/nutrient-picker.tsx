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
