"use client";

import type { Analytics } from "@/lib/analytics/types";

type AnalyticsRange = Analytics["range"];

const OPTIONS: ReadonlyArray<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

type RangeToggleProps = {
  value: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
  disabled?: boolean;
};

export function RangeToggle({ value, onChange, disabled = false }: RangeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Analytics time range"
      className="inline-flex rounded-2xl border border-border bg-surface p-1"
    >
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            className={[
              "min-h-12 min-w-28 cursor-pointer rounded-xl px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-primary text-primary-fg" : "bg-transparent text-text hover:bg-canvas",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
