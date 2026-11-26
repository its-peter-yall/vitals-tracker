"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Plus, Settings, Trash2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/components/ui/theme-init";
import type { Tracker } from "@/lib/trackers/service";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  theme: ThemeMode;
  visionModel: string | null;
};

const FLAG_LABELS = {
  diabetes: "Blood Sugar Watch",
  hypertension: "Blood Pressure Watch",
} as const;

export default function TrackersHomePage() {
  const { setMode } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadHome = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store", signal });
        if (signal?.aborted) return;
        if (meRes.status === 401) {
          setError("");
          setAuthState("signed-out");
          return;
        }
        if (!meRes.ok) throw new Error("auth check failed");
        const meBody = await meRes.json();
        const currentUser = meBody?.user as AuthUser | undefined;
        if (!currentUser) {
          setError("");
          setAuthState("signed-out");
          return;
        }
        setError("");
        setUser(currentUser);
        setAuthState("signed-in");

        // Reconcile account DB theme when this device has no saved preference yet.
        try {
          if (localStorage.getItem(THEME_STORAGE_KEY) === null && isThemeMode(currentUser.theme)) {
            setMode(currentUser.theme);
          }
        } catch {
          // Ignore storage access errors in restricted browsers.
        }

        const trackersRes = await fetch("/api/trackers", { cache: "no-store", signal });
        if (signal?.aborted) return;
        if (!trackersRes.ok) throw new Error("trackers load failed");
        const trackersBody = await trackersRes.json();
        if (!signal?.aborted) {
          setTrackers(Array.isArray(trackersBody?.trackers) ? trackersBody.trackers : []);
        }
      } catch {
        if (!signal?.aborted) {
          setError("Could not load your trackers. Check your connection and try again.");
        }
      }
    },
    [setMode],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadHome(controller.signal);
    return () => controller.abort();
  }, [loadHome]);

  async function deleteTracker(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(`/api/trackers/${id}`, { method: "DELETE" });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("delete failed");
      setTrackers((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setError("Could not delete this tracker. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (authState === "loading" && !error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p role="status" className="text-muted">
          Opening your daily care trackers…
        </p>
      </main>
    );
  }

  if (authState === "signed-out") {
    return (
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-text">Daily Care, Made Simple</h1>
          <p className="text-muted">
            Keep track of daily vitamins, minerals, foods, and medicines in one calm place.
          </p>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-4 py-2 font-semibold text-primary-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-canvas px-4 py-2 font-semibold text-text"
            >
              Create account
            </Link>
          </div>
        </Card>

        <aside className="border-s-4 border-accent ps-4" aria-labelledby="home-care-note">
          <h2 id="home-care-note" className="font-semibold text-accent">
            About this tracker
          </h2>
          <p>
            This app helps you keep track of daily care. It is not medical advice and does not
            replace your doctor, pharmacist, blood sugar meter, or blood pressure monitor.
          </p>
        </aside>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-text">Your Trackers</h1>
          {user && <p className="text-muted">Hello, {user.name}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold text-text"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <Link
            href="/trackers/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-fg"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>+ New Tracker</span>
          </Link>
        </div>
      </div>

      {error && (
        <Card className="space-y-3 border-accent">
          <p role="alert" className="font-semibold text-accent">
            {error}
          </p>
          <Button variant="outline" onClick={() => void loadHome()}>
            Try again
          </Button>
        </Card>
      )}

      {trackers.length === 0 ? (
        <Card className="space-y-4">
          <h2 className="text-xl font-bold text-text">No trackers yet</h2>
          <p className="text-muted">
            Create your first tracker with our 4-step guide so your daily screen shows only the
            nutrients and medicines you care about.
          </p>
          <Link
            href="/trackers/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-fg"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span>Create Your First Tracker</span>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-4">
          {trackers.map((tracker) => (
            <li key={tracker.id}>
              <Card className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <h2 className="text-2xl font-bold text-text">{tracker.name}</h2>
                    {tracker.healthFlags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tracker.healthFlags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full border border-accent bg-caution px-3 py-0.5 text-sm font-semibold text-caution-fg"
                          >
                            {FLAG_LABELS[flag]}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-muted">
                      {tracker.nutrients.length === 0
                        ? "Medicine-only tracker"
                        : `${tracker.nutrients.length} tracked ${
                            tracker.nutrients.length === 1 ? "nutrient" : "nutrients"
                          }: ${tracker.nutrients
                            .slice(0, 4)
                            .map((item) => item.label)
                            .join(", ")}${tracker.nutrients.length > 4 ? "…" : ""}`}
                    </p>
                  </div>

                  {confirmDeleteId !== tracker.id && (
                    <Button
                      variant="outline"
                      aria-label={`Delete ${tracker.name}`}
                      onClick={() => setConfirmDeleteId(tracker.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>

                {confirmDeleteId === tracker.id ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-caution p-3 text-caution-fg">
                    <span className="font-semibold">Delete this tracker and its logs?</span>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={deletingId === tracker.id}
                        onClick={() => void deleteTracker(tracker.id)}
                      >
                        {deletingId === tracker.id ? "Deleting…" : "Confirm delete"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={deletingId === tracker.id}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/trackers/${tracker.id}`}
                      className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-fg"
                    >
                      Open Today
                    </Link>
                    <Link
                      href={`/trackers/${tracker.id}/analytics`}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-canvas px-4 font-semibold text-text"
                    >
                      <BarChart3 className="h-5 w-5" aria-hidden="true" />
                      <span>Analytics</span>
                    </Link>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
