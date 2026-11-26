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
