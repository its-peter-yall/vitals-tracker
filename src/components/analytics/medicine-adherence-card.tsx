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
