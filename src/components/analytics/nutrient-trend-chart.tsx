"use client";

import { useId } from "react";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { Analytics, NutrientTrend } from "@/lib/analytics/types";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import type { NutrientKey } from "@/lib/nutrients/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

type ChartDatum = {
  date: string;
  shortDate: string;
  amount: number;
  hasAmount: boolean;
};

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  if (!month || !day || month < 1 || month > 12) return isoDate;
  return `${MONTHS[month - 1]} ${day}`;
}

function formatAmount(value: number): string {
  return numberFormat.format(roundNutrientForDisplay(value));
}

function isChartDatum(value: unknown): value is ChartDatum {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.date === "string" &&
    typeof candidate.shortDate === "string" &&
    typeof candidate.amount === "number" &&
    typeof candidate.hasAmount === "boolean"
  );
}

function renderTooltip(
  props: TooltipContentProps,
  unit: string,
  dailyTarget: number,
  isUpper: boolean,
) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const raw = props.payload[0]?.payload;
  if (!isChartDatum(raw)) return null;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm">
      <p className="font-semibold">{raw.shortDate}</p>
      <p>
        {raw.hasAmount ? `${formatAmount(raw.amount)} ${unit}` : "Not logged"}
      </p>
      <p className="text-muted">
        {isUpper ? "Limit reference" : "Daily goal"}: {formatAmount(dailyTarget)} {unit}
      </p>
    </div>
  );
}

type NutrientTrendChartProps = {
  trends: readonly NutrientTrend[];
  selectedKey: NutrientKey | null;
  onSelectKey: (nutrientKey: NutrientKey) => void;
  range: Analytics["range"];
};

export function NutrientTrendChart({
  trends,
  selectedKey,
  onSelectKey,
  range,
}: NutrientTrendChartProps) {
  const gradientId = useId();

  if (trends.length === 0) {
    return (
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Nutrient Trends</h2>
        </div>
        <p className="text-muted">
          No nutrients are selected for this tracker. Medicine consistency is shown below.
        </p>
      </Card>
    );
  }

  const activeTrend = trends.find((trend) => trend.nutrientKey === selectedKey) ?? trends[0];
  const isUpper = activeTrend.targetKind === "upper";
  const seriesStroke = isUpper ? "var(--vt-accent)" : "var(--vt-primary)";
  const targetStroke = isUpper ? "var(--vt-muted)" : "var(--vt-accent)";

  const chartData: ChartDatum[] = activeTrend.series.map((point) => ({
    date: point.date,
    shortDate: formatShortDate(point.date),
    amount: point.amount,
    hasAmount: point.hasAmount,
  }));

  const maxObserved = chartData.reduce((max, point) => Math.max(max, point.amount), 0);
  const yMax = Math.ceil(Math.max(activeTrend.dailyTarget, maxObserved, 1) * 1.15);

  const targetText = isUpper
    ? `Daily limit reference: ${formatAmount(activeTrend.dailyTarget)} ${activeTrend.unit}`
    : `Daily goal: ${formatAmount(activeTrend.dailyTarget)} ${activeTrend.unit}`;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Nutrient Trends</h2>
        </div>
        <span className="text-sm text-muted">
          {range === "7d" ? "Last 7 days" : "Last 30 days"}
        </span>
      </div>

      <div
        role="group"
        aria-label="Choose a nutrient to view"
        className="flex flex-wrap gap-2"
      >
        {trends.map((trend) => {
          const active = trend.nutrientKey === activeTrend.nutrientKey;
          const activeTone =
            trend.targetKind === "upper"
              ? "border-accent bg-accent text-accent-fg"
              : "border-primary bg-primary text-primary-fg";

          return (
            <button
              key={trend.nutrientKey}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectKey(trend.nutrientKey)}
              className={[
                "min-h-12 cursor-pointer rounded-xl border px-4 py-2 font-semibold transition-colors",
                active ? activeTone : "border-border bg-canvas text-text hover:bg-surface",
              ].join(" ")}
            >
              {trend.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/50 pt-3">
        <div>
          <h3 className="text-lg font-bold">{activeTrend.label}</h3>
          <p className="text-sm text-muted">{targetText}</p>
        </div>
        {activeTrend.averageCompletionPct !== null && (
          <p className="font-semibold text-primary">
            {Math.round(activeTrend.averageCompletionPct)}% avg
          </p>
        )}
      </div>

      <div
        className="h-[280px] w-full"
        role="img"
        aria-label={`${activeTrend.label} trend over the last ${range === "7d" ? "7" : "30"} days. ${targetText}.`}
      >
        <ResponsiveContainer
          width="100%"
          height={280}
          initialDimension={{ width: 640, height: 280 }}
        >
          <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={seriesStroke} stopOpacity={0.28} />
                <stop offset="95%" stopColor={seriesStroke} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vt-border)" strokeOpacity={0.35} />
            <XAxis
              dataKey="shortDate"
              stroke="var(--vt-muted)"
              tick={{ fill: "var(--vt-muted)", fontSize: 13 }}
              interval="preserveStartEnd"
              minTickGap={range === "30d" ? 28 : 12}
            />
            <YAxis
              domain={[0, yMax]}
              stroke="var(--vt-muted)"
              tick={{ fill: "var(--vt-muted)", fontSize: 13 }}
              width={56}
            />
            <Tooltip
              isAnimationActive={false}
              content={(props) => renderTooltip(props, activeTrend.unit, activeTrend.dailyTarget, isUpper)}
            />
            <ReferenceLine
              y={activeTrend.dailyTarget}
              stroke={targetStroke}
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: isUpper ? "Reference" : "Target",
                position: "insideTopRight",
                fill: targetStroke,
                fontSize: 13,
              }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              name={activeTrend.label}
              stroke={seriesStroke}
              strokeWidth={3}
              fill={`url(#${gradientId})`}
              dot={{ r: 4, fill: seriesStroke, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: seriesStroke }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
