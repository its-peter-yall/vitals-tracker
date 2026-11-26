"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";
import { AttentionSummary } from "@/components/analytics/attention-summary";
import { CautionDaysStrip } from "@/components/analytics/caution-days-strip";
import { MedicineAdherenceCard } from "@/components/analytics/medicine-adherence-card";
import { NutrientTrendChart } from "@/components/analytics/nutrient-trend-chart";
import { RangeToggle } from "@/components/analytics/range-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Analytics } from "@/lib/analytics/types";
import type { NutrientKey } from "@/lib/nutrients/types";

type AnalyticsRange = Analytics["range"];

function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TrackerAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const replace = router.replace;
  const trackerId = typeof params?.id === "string" ? params.id : "";

  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [selectedKey, setSelectedKey] = useState<NutrientKey | null>(null);

  useEffect(() => {
    if (!trackerId) return;
    const controller = new AbortController();
    const endDate = localTodayIso();

    async function load() {
      try {
        const query = new URLSearchParams({ range, endDate }).toString();
        const response = await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/analytics?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          replace("/login");
          return;
        }
        if (response.status === 404) {
          setAnalytics(null);
          setNotFound(true);
          setError("");
          setLoading(false);
          return;
        }
        if (!response.ok) {
          throw new Error("analytics unavailable");
        }
        const body = (await response.json()) as { analytics?: Analytics };
        if (controller.signal.aborted) return;
        if (!body?.analytics) {
          throw new Error("analytics missing");
        }
        setAnalytics(body.analytics);
        setNotFound(false);
        setError("");
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not load analytics right now. Check your connection and try again.");
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [trackerId, range, reloadTick, replace]);

  function handleRangeChange(nextRange: AnalyticsRange) {
    if (nextRange === range) return;
    setRange(nextRange);
    setLoading(true);
    setError("");
    setNotFound(false);
  }

  function handleRetry() {
    setLoading(true);
    setError("");
    setNotFound(false);
    setReloadTick((value) => value + 1);
  }

  const activeNutrientKey: NutrientKey | null = (() => {
    const trends = analytics?.trends ?? [];
    if (trends.length === 0) return null;
    if (selectedKey && trends.some((trend) => trend.nutrientKey === selectedKey)) {
      return selectedKey;
    }
    return trends[0].nutrientKey;
  })();

  const rangeDays = range === "7d" ? 7 : 30;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={trackerId ? `/trackers/${trackerId}` : "/"}
            className="inline-flex min-h-12 items-center gap-2 text-primary underline"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>Back to Today</span>
          </Link>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted">Simple trends and daily care insights for the last {rangeDays} days.</p>
        </div>

        <RangeToggle value={range} onChange={handleRangeChange} />
      </div>

      {loading && !analytics && (
        <Card>
          <p role="status" className="text-muted">
            Loading your {rangeDays}-day overview…
          </p>
        </Card>
      )}

      {notFound && (
        <Card className="space-y-4">
          <h2 className="text-xl font-bold">Tracker not found</h2>
          <p className="text-muted">This tracker may have been removed or belongs to another account.</p>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-2 font-semibold text-primary-fg"
          >
            Back to trackers
          </Link>
        </Card>
      )}

      {error && (
        <Card className="space-y-4 border-accent">
          <p role="alert" className="font-semibold text-accent">
            {error}
          </p>
          <Button variant="outline" onClick={handleRetry}>
            Try again
          </Button>
        </Card>
      )}

      {analytics && !notFound && (
        <>
          {loading && (
            <p role="status" className="text-sm text-muted">
              Updating {rangeDays}-day view…
            </p>
          )}

          {analytics.activeDays === 0 ? (
            <Card className="space-y-4 text-center sm:p-8">
              <h2 className="text-2xl font-bold">No logs yet for the last {rangeDays} days</h2>
              <p className="mx-auto max-w-xl text-muted">
                Once you log a meal or medicine on the Today screen, your nutrient trends, daily insights, and medicine consistency will appear here.
              </p>
              {range === "7d" && (
                <p className="text-sm text-muted">
                  Logged earlier this month? Switch to 30 Days above to check older entries.
                </p>
              )}
              <div className="pt-2">
                <Link
                  href={`/trackers/${trackerId}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-semibold text-primary-fg"
                >
                  Go to Today’s log
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              <section aria-label="Summary metrics" className="grid gap-4 sm:grid-cols-3">
                <Card className="space-y-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Activity aria-hidden="true" className="h-5 w-5" />
                    <span className="text-sm font-semibold">Average Goal Completion</span>
                  </div>
                  <p className="text-3xl font-bold text-text">
                    {analytics.averageCompletionPct !== null
                      ? `${Math.round(analytics.averageCompletionPct)}%`
                      : "—"}
                  </p>
                  <p className="text-sm text-muted">
                    {analytics.averageCompletionPct !== null
                      ? "Across daily goal nutrients"
                      : "No daily goals tracked"}
                  </p>
                </Card>

                <Card className="space-y-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Calendar aria-hidden="true" className="h-5 w-5" />
                    <span className="text-sm font-semibold">Active Days</span>
                  </div>
                  <p className="text-3xl font-bold text-text">
                    {analytics.activeDays} of {analytics.days.length}
                  </p>
                  <p className="text-sm text-muted">Days with food or medicine logged</p>
                </Card>

                <Card
                  className={
                    analytics.cautionDayCount > 0
                      ? "space-y-1 border-accent bg-caution text-caution-fg"
                      : "space-y-1"
                  }
                >
                  <div
                    className={`flex items-center gap-2 ${
                      analytics.cautionDayCount > 0 ? "text-caution-fg" : "text-primary"
                    }`}
                  >
                    {analytics.cautionDayCount > 0 ? (
                      <AlertTriangle aria-hidden="true" className="h-5 w-5" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                    )}
                    <span className="text-sm font-semibold">Caution Days</span>
                  </div>
                  <p className="text-3xl font-bold">{analytics.cautionDayCount}</p>
                  <p
                    className={`text-sm ${
                      analytics.cautionDayCount > 0 ? "text-caution-fg/90" : "text-muted"
                    }`}
                  >
                    {analytics.cautionDayCount > 0
                      ? "Days above sugar or sodium reference"
                      : "No caution days in this period"}
                  </p>
                </Card>
              </section>

              <AttentionSummary
                needsAttention={analytics.needsAttention}
                onTrack={analytics.onTrack}
                trends={analytics.trends}
                onSelectNutrient={setSelectedKey}
              />

              <NutrientTrendChart
                trends={analytics.trends}
                selectedKey={activeNutrientKey}
                onSelectKey={setSelectedKey}
                range={analytics.range}
              />

              <CautionDaysStrip
                days={analytics.days}
                cautionDays={analytics.cautionDays}
                range={analytics.range}
              />

              <MedicineAdherenceCard
                items={analytics.medicineAdherence}
                range={analytics.range}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
