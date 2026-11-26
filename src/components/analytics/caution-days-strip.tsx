"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Analytics, AnalyticsDay } from "@/lib/analytics/types";
import type { HealthFlag } from "@/lib/impact/types";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import { NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  if (!month || !day || month < 1 || month > 12) return isoDate;
  return `${MONTHS[month - 1]} ${day}`;
}

function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return isoDate;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function flagLabel(flag: HealthFlag): string {
  return flag === "diabetes" ? "Blood sugar watch" : "Blood pressure watch";
}

function formatAmount(value: number): string {
  return numberFormat.format(roundNutrientForDisplay(value));
}

type CautionDaysStripProps = {
  days: readonly AnalyticsDay[];
  cautionDays: readonly string[];
  range: Analytics["range"];
};

export function CautionDaysStrip({ days, cautionDays, range }: CautionDaysStripProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const cautionSet = new Set(cautionDays);

  const activeDate =
    selectedDate && cautionSet.has(selectedDate)
      ? selectedDate
      : cautionDays[cautionDays.length - 1] ?? null;

  const activeDay = activeDate ? days.find((day) => day.date === activeDate) ?? null : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cautionDays.length > 0 ? (
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-accent" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-primary" />
          )}
          <h2 className="text-xl font-bold">Caution Days</h2>
        </div>
        <span className="text-sm text-muted">
          {cautionDays.length} of {days.length} days
        </span>
      </div>

      {cautionDays.length === 0 ? (
        <p className="text-muted">No nutrition cautions in this period.</p>
      ) : (
        <div className="space-y-4">
          {range === "7d" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-7" role="group" aria-label="Days in period">
              {days.map((day) => {
                const isCaution = day.alerts.length > 0;
                const isSelected = day.date === activeDate;
                if (isCaution) {
                  return (
                    <button
                      key={day.date}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedDate(day.date)}
                      className={[
                        "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-semibold",
                        isSelected
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-accent bg-caution text-caution-fg",
                      ].join(" ")}
                    >
                      <span>{formatShortDate(day.date)}</span>
                      <span className="text-xs font-normal">Caution</span>
                    </button>
                  );
                }

                return (
                  <div
                    key={day.date}
                    className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-border bg-canvas px-2 py-2 text-sm text-muted"
                  >
                    <span>{formatShortDate(day.date)}</span>
                    <span className="text-xs">{day.active ? "Logged" : "No log"}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Caution dates in the last 30 days">
              {cautionDays.map((date) => {
                const isSelected = date === activeDate;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedDate(date)}
                    className={[
                      "min-h-12 cursor-pointer rounded-xl border px-4 py-2 font-semibold",
                      isSelected
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-accent bg-caution text-caution-fg",
                    ].join(" ")}
                  >
                    {formatShortDate(date)}
                  </button>
                );
              })}
            </div>
          )}

          {activeDay && activeDay.alerts.length > 0 && (
            <div className="space-y-3 rounded-xl border border-accent bg-caution p-4 text-caution-fg">
              <p className="font-bold">{formatLongDate(activeDay.date)}</p>
              <ul className="space-y-3">
                {activeDay.alerts.map((alert) => (
                  <li key={alert.healthFlag} className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-wide">
                      {flagLabel(alert.healthFlag)}
                    </p>
                    <p>{alert.message}</p>
                    <ul className="space-y-1 text-sm">
                      {alert.triggers.map((trigger) => (
                        <li key={trigger.nutrientKey}>
                          {NUTRIENT_CATALOG[trigger.nutrientKey].label}: {formatAmount(trigger.total)}{" "}
                          {trigger.unit} (above {formatAmount(trigger.threshold)} {trigger.unit} reference)
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
