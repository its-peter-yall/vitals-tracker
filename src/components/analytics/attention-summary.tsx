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
