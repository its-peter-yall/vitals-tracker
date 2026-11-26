"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HealthFlag } from "@/lib/impact/types";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientKey } from "@/lib/nutrients/types";
import { NutrientPicker } from "./nutrient-picker";

const STEP_TITLES = [
  "Name & Health Focus",
  "Choose Vitamins",
  "Choose Minerals",
  "Essential Nutrients & Daily Targets",
] as const;

const FLAG_RECOMMENDATIONS: Record<HealthFlag, readonly NutrientKey[]> = {
  diabetes: ["totalSugars", "addedSugars", "carbohydrates"],
  hypertension: ["sodium", "potassium"],
};

export function TrackerWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [healthFlags, setHealthFlags] = useState<HealthFlag[]>([]);
  const [selected, setSelected] = useState<Set<NutrientKey>>(() => new Set());
  // Only present when the user explicitly edited a target; omitted values preserve default provenance.
  const [customTargets, setCustomTargets] = useState<Partial<Record<NutrientKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recommended = new Set<NutrientKey>(
    healthFlags.flatMap((flag) => FLAG_RECOMMENDATIONS[flag]),
  );

  function toggleFlag(flag: HealthFlag) {
    setHealthFlags((current) =>
      current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag],
    );
  }

  function toggleNutrient(key: NutrientKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addRecommended() {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of recommended) next.add(key);
      return next;
    });
  }

  function nextStep() {
    setError("");
    if (step === 0 && !name.trim()) {
      setError("Please enter a name for this tracker.");
      return;
    }
    setStep((value) => Math.min(STEP_TITLES.length - 1, value + 1));
  }

  async function createTracker() {
    if (busy) return;
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStep(0);
      setError("Please enter a name for this tracker.");
      return;
    }

    const orderedKeys = NUTRIENT_KEYS.filter((key) => selected.has(key));
    const nutrients: { nutrientKey: NutrientKey; customDailyTarget?: number }[] = [];
    for (const key of orderedKeys) {
      const customRaw = customTargets[key];
      if (customRaw !== undefined) {
        const parsed = Number(customRaw);
        if (!Number.isFinite(parsed) || parsed < 0.000001 || parsed > 1_000_000) {
          setError(`Enter a valid daily target for ${NUTRIENT_CATALOG[key].label}.`);
          return;
        }
        nutrients.push({ nutrientKey: key, customDailyTarget: parsed });
      } else {
        nutrients.push({ nutrientKey: key });
      }
    }

    setBusy(true);
    try {
      const response = await fetch("/api/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          healthFlags,
          nutrients,
        }),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok || !body?.tracker?.id) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Could not create your tracker. Try again.",
        );
        return;
      }
      router.push(`/trackers/${body.tracker.id}`);
    } catch {
      setError("Could not create your tracker. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const orderedSelected = NUTRIENT_KEYS.filter((key) => selected.has(key));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-semibold text-primary">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <h1 className="text-3xl font-bold text-text">{STEP_TITLES[step]}</h1>
        <div className="flex gap-2" aria-hidden="true">
          {STEP_TITLES.map((title, index) => (
            <span
              key={title}
              className={`h-2 flex-1 rounded-full ${
                index <= step ? "bg-primary" : "bg-border/40"
              }`}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <Card className="space-y-5">
          <label className="grid gap-2">
            <span className="font-semibold">Tracker name</span>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g., Amma's Daily Care"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4"
            />
          </label>

          <div className="space-y-3">
            <div>
              <p className="font-semibold">Optional health focus</p>
              <p className="text-muted">
                Turns on gentle daily nutritional cautions when sugar or sodium runs high.
              </p>
            </div>
            {(
              [
                {
                  flag: "diabetes" as const,
                  title: "Diabetes / Blood Sugar Watch",
                  desc: "Watches daily total sugars and added sugars.",
                },
                {
                  flag: "hypertension" as const,
                  title: "High Blood Pressure / Sodium Watch",
                  desc: "Watches daily sodium intake.",
                },
              ] as const
            ).map(({ flag, title, desc }) => {
              const active = healthFlags.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleFlag(flag)}
                  className={`flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left ${
                    active
                      ? "border-accent bg-caution text-caution-fg"
                      : "border-border bg-canvas text-text"
                  }`}
                >
                  <div>
                    <span className="block font-semibold">{title}</span>
                    <span className={active ? "opacity-90" : "text-muted"}>{desc}</span>
                  </div>
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface"
                    }`}
                    aria-hidden="true"
                  >
                    {active && <Check className="h-5 w-5" />}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-muted">
            Tap only the vitamins you want to see on your daily screen. You can skip this step.
          </p>
          <NutrientPicker
            category="vitamin"
            selected={selected}
            recommended={recommended}
            onToggle={toggleNutrient}
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-muted">
            Tap only the minerals you want to follow each day.
          </p>
          {healthFlags.includes("hypertension") && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent bg-caution p-3 text-caution-fg">
              <span>Recommended for Blood Pressure Watch: Sodium &amp; Potassium.</span>
              <Button variant="secondary" onClick={addRecommended}>
                Add recommended
              </Button>
            </div>
          )}
          <NutrientPicker
            category="mineral"
            selected={selected}
            recommended={recommended}
            onToggle={toggleNutrient}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          {healthFlags.includes("diabetes") && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent bg-caution p-3 text-caution-fg">
              <span>
                Recommended for Blood Sugar Watch: Total Sugars, Added Sugars, Carbohydrates.
              </span>
              <Button variant="secondary" onClick={addRecommended}>
                Add recommended
              </Button>
            </div>
          )}

          <NutrientPicker
            category="essential"
            selected={selected}
            recommended={recommended}
            onToggle={toggleNutrient}
          />

          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Daily reference targets (optional)</h2>
              <p className="text-muted">
                Standard adult references are pre-filled. Edit any number only if you want a custom target.
              </p>
            </div>

            {orderedSelected.length === 0 ? (
              <p className="text-muted">
                No nutrients selected yet — you can still create a medicine-only tracker.
              </p>
            ) : (
              <div className="space-y-3">
                {orderedSelected.map((key) => {
                  const meta = NUTRIENT_CATALOG[key];
                  const isCustom = customTargets[key] !== undefined;
                  const value = isCustom ? customTargets[key]! : String(meta.defaultDailyTarget);

                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-canvas p-3"
                    >
                      <label className="grid min-w-48 flex-1 gap-1">
                        <span className="font-semibold">
                          {meta.label} daily target ({meta.unit})
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0.000001"
                          max="1000000"
                          value={value}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setCustomTargets((current) => ({
                              ...current,
                              [key]: nextValue,
                            }));
                          }}
                          className="min-h-12 w-full rounded-lg border border-border bg-surface px-3"
                        />
                      </label>
                      {isCustom && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setCustomTargets((current) => {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            })
                          }
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          <span className="ms-1.5">Reset</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {error && (
        <p role="alert" className="font-semibold text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {step > 0 ? (
          <Button variant="outline" disabled={busy} onClick={() => setStep((v) => v - 1)}>
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <span className="ms-1.5">Back</span>
          </Button>
        ) : (
          <span />
        )}

        {step < STEP_TITLES.length - 1 ? (
          <Button onClick={nextStep}>
            <span>Next</span>
            <ArrowRight className="ms-1.5 h-5 w-5" aria-hidden="true" />
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => void createTracker()}>
            {busy ? "Creating tracker…" : "Create Tracker"}
          </Button>
        )}
      </div>
    </div>
  );
}
