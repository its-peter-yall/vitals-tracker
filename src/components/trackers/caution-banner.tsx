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
