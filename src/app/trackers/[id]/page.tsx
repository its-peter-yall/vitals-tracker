"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Pill, Utensils } from "lucide-react";
import { FoodLogModal } from "@/components/logging/food-log-modal";
import { MedicineLogModal } from "@/components/logging/medicine-log-modal";
import { CautionBanner } from "@/components/trackers/caution-banner";
import { DailyLogList } from "@/components/trackers/daily-log-list";
import {
  addLocalDays,
  formatFriendlyDate,
  formatLocalDate,
  isLocalDateString,
} from "@/components/trackers/local-date";
import { NutrientProgressCard } from "@/components/trackers/nutrient-progress-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UndoToast } from "@/components/ui/undo-toast";
import type { DailySummary, IntakeLog, Tracker } from "@/lib/trackers/service";

type ToastState =
  | { id: number; kind: "added"; logId: string; message: string }
  | { id: number; kind: "pending-delete"; log: IntakeLog; message: string };

const FLAG_PILLS = {
  diabetes: "Blood Sugar Watch",
  hypertension: "Blood Pressure Watch",
} as const;

export default function TrackerTodayPage() {
  const params = useParams<{ id: string }>();
  const trackerId = typeof params?.id === "string" ? params.id : "";

  const [today] = useState(() => formatLocalDate());
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate());
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [logs, setLogs] = useState<IntakeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState<"food" | "medicine" | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastCounter = useRef(0);
  const pendingDeleteRef = useRef<IntakeLog | null>(null);

  const loadDay = useCallback(
    async (date: string, signal?: AbortSignal) => {
      if (!trackerId) return;
      try {
        const [trackerRes, summaryRes, logsRes] = await Promise.all([
          fetch(`/api/trackers/${trackerId}`, { cache: "no-store", signal }),
          fetch(`/api/trackers/${trackerId}/summary?date=${date}`, { cache: "no-store", signal }),
          fetch(`/api/trackers/${trackerId}/logs?date=${date}`, { cache: "no-store", signal }),
        ]);
        if (signal?.aborted) return;
        if (
          trackerRes.status === 401 ||
          summaryRes.status === 401 ||
          logsRes.status === 401
        ) {
          window.location.replace("/login");
          return;
        }
        if (trackerRes.status === 404) {
          setError("Tracker not found.");
          setTracker(null);
          return;
        }
        if (!trackerRes.ok || !summaryRes.ok || !logsRes.ok) {
          throw new Error("load failed");
        }
        const [trackerBody, summaryBody, logsBody] = await Promise.all([
          trackerRes.json(),
          summaryRes.json(),
          logsRes.json(),
        ]);
        if (signal?.aborted) return;
        setError("");
        setTracker(trackerBody.tracker);
        setSummary(summaryBody);
        setLogs(Array.isArray(logsBody.logs) ? logsBody.logs : []);
      } catch {
        if (!signal?.aborted) {
          setError("Could not load this day's tracker. Try again.");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [trackerId],
  );

  const commitPendingDelete = useCallback(
    async (logToDelete: IntakeLog, refreshAfter = true) => {
      if (pendingDeleteRef.current?.id === logToDelete.id) {
        pendingDeleteRef.current = null;
      }
      try {
        await fetch(`/api/trackers/${trackerId}/logs/${logToDelete.id}`, {
          method: "DELETE",
          keepalive: true,
        });
      } finally {
        if (refreshAfter) {
          void loadDay(selectedDate);
        }
      }
    },
    [loadDay, selectedDate, trackerId],
  );

  const flushPendingDelete = useCallback(async () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    setToast(null);
    await commitPendingDelete(pending, false);
  }, [commitPendingDelete]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDay(selectedDate, controller.signal);
    return () => controller.abort();
  }, [loadDay, selectedDate]);

  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current;
      if (pending && trackerId) {
        pendingDeleteRef.current = null;
        void fetch(`/api/trackers/${trackerId}/logs/${pending.id}`, {
          method: "DELETE",
          keepalive: true,
        });
      }
    };
  }, [trackerId]);

  async function handleLogged(log: IntakeLog) {
    await flushPendingDelete();
    setOpenModal(null);
    toastCounter.current += 1;
    setToast({
      id: toastCounter.current,
      kind: "added",
      logId: log.id,
      message: `Logged ${log.displayName}`,
    });
    await loadDay(selectedDate);
  }

  async function handleEditQuantity(logId: string, quantity: number) {
    await flushPendingDelete();
    const response = await fetch(`/api/trackers/${trackerId}/logs/${logId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (response.status === 401) {
      window.location.replace("/login");
      return;
    }
    if (!response.ok) throw new Error("edit failed");
    await loadDay(selectedDate);
  }

  function handleDeleteLog(log: IntakeLog) {
    void (async () => {
      await flushPendingDelete();
      pendingDeleteRef.current = log;
      setLogs((current) => current.filter((item) => item.id !== log.id));
      toastCounter.current += 1;
      setToast({
        id: toastCounter.current,
        kind: "pending-delete",
        log,
        message: `Removed ${log.displayName}`,
      });
    })();
  }

  async function handleUndoToast() {
    const current = toast;
    setToast(null);
    if (!current) return;
    if (current.kind === "added") {
      try {
        await fetch(`/api/trackers/${trackerId}/logs/${current.logId}`, {
          method: "DELETE",
        });
      } finally {
        await loadDay(selectedDate);
      }
      return;
    }
    if (pendingDeleteRef.current?.id === current.log.id) {
      pendingDeleteRef.current = null;
    }
    await loadDay(selectedDate);
  }

  function handleToastExpire() {
    const current = toast;
    setToast(null);
    if (current?.kind === "pending-delete") {
      void commitPendingDelete(current.log, true);
    }
  }

  function changeDate(nextDate: string) {
    if (!isLocalDateString(nextDate)) return;
    void flushPendingDelete().then(() => setSelectedDate(nextDate));
  }

  const yesterday = addLocalDays(today, -1);

  return (
    <main className="space-y-6">
      {tracker && (
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-text">{tracker.name}</h1>
          {tracker.healthFlags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tracker.healthFlags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-accent bg-caution px-3 py-1 text-sm font-semibold text-caution-fg"
                >
                  {FLAG_PILLS[flag]}
                </span>
              ))}
            </div>
          )}
        </header>
      )}

      {/* Local-date switcher */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            aria-label="Previous day"
            onClick={() => changeDate(addLocalDays(selectedDate, -1))}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>

          <p className="text-xl font-bold text-text">
            {formatFriendlyDate(selectedDate, today)}
          </p>

          <Button
            variant="outline"
            aria-label="Next day"
            onClick={() => changeDate(addLocalDays(selectedDate, 1))}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={selectedDate === yesterday ? "primary" : "outline"}
            onClick={() => changeDate(yesterday)}
          >
            Yesterday
          </Button>
          <Button
            variant={selectedDate === today ? "primary" : "outline"}
            onClick={() => changeDate(today)}
          >
            Today
          </Button>
          <label className="ms-auto flex items-center gap-2">
            <span className="sr-only">Choose date</span>
            <input
              type="date"
              aria-label="Choose date"
              value={selectedDate}
              onChange={(event) => changeDate(event.currentTarget.value)}
              className="min-h-12 rounded-xl border border-border bg-canvas px-3"
            />
          </label>
        </div>
      </Card>

      {error && (
        <Card className="space-y-3 border-accent">
          <p role="alert" className="font-semibold text-accent">
            {error}
          </p>
          <Button variant="outline" onClick={() => void loadDay(selectedDate)}>
            Try again
          </Button>
        </Card>
      )}

      {loading && !summary ? (
        <p role="status" className="text-muted">
          Loading daily summary…
        </p>
      ) : (
        <>
          {summary && <CautionBanner alerts={summary.alerts} />}

          <section className="space-y-3" aria-labelledby="tracked-nutrients-heading">
            <h2 id="tracked-nutrients-heading" className="text-xl font-bold text-text">
              Tracked Nutrients
            </h2>
            {summary && summary.progress.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {summary.progress.map((item) => (
                  <NutrientProgressCard key={item.nutrientKey} item={item} />
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-muted">
                  This tracker is set up for medicine logging only (no daily nutrient cards selected).
                </p>
              </Card>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="todays-log-heading">
            <h2 id="todays-log-heading" className="text-xl font-bold text-text">
              {selectedDate === today ? "Today's Log" : `Log for ${formatFriendlyDate(selectedDate, today)}`}
            </h2>
            <DailyLogList
              logs={logs}
              onEditQuantity={handleEditQuantity}
              onDeleteLog={handleDeleteLog}
            />
          </section>
        </>
      )}

      {/* Sticky dual bottom action bar */}
      {tracker && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-3">
            <Button
              className="flex-1"
              onClick={() => setOpenModal("food")}
            >
              <Utensils className="me-2 h-5 w-5" aria-hidden="true" />
              <span>+ Add Food</span>
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setOpenModal("medicine")}
            >
              <Pill className="me-2 h-5 w-5" aria-hidden="true" />
              <span>+ Add Medicine</span>
            </Button>
          </div>
        </div>
      )}

      {openModal === "food" && tracker && (
        <FoodLogModal
          trackerId={tracker.id}
          logDate={selectedDate}
          trackerNutrients={tracker.nutrients}
          onClose={() => setOpenModal(null)}
          onLogged={(log) => void handleLogged(log)}
        />
      )}

      {openModal === "medicine" && tracker && (
        <MedicineLogModal
          trackerId={tracker.id}
          logDate={selectedDate}
          onClose={() => setOpenModal(null)}
          onLogged={(log) => void handleLogged(log)}
        />
      )}

      {toast && (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onUndo={() => void handleUndoToast()}
          onExpire={handleToastExpire}
        />
      )}
    </main>
  );
}
