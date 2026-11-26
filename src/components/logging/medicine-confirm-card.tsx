"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MEDICINE_CATEGORIES,
  type MedicineCategory,
  type MedicineScanDraft,
  type ScanResult,
} from "@/lib/medicines/types";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "@/lib/nutrients/catalog";
import type { NutrientKey, NutrientMap } from "@/lib/nutrients/types";

export type ConfirmedMedicinePayload = {
  brandName: string;
  genericName: string | null;
  category: MedicineCategory;
  defaultDoseLabel: string;
  nutrientsPerDose: NutrientMap;
  notes: string | null;
  scheduleHint: string | null;
  source: "manual" | "vision_confirmed" | "ocr_confirmed";
  doses: number;
};

type MedicineConfirmCardProps = {
  initialDraft: MedicineScanDraft;
  initialScheduleHint?: string | null;
  source: "manual" | "vision_confirmed" | "ocr_confirmed";
  confidence?: ScanResult["confidence"];
  reviewMessage?: string | null;
  actions?: readonly ("retake" | "ocr" | "manual")[];
  busy: boolean;
  error: string;
  savedPendingLog: boolean;
  onConfirm: (payload: ConfirmedMedicinePayload) => Promise<void>;
  onRetake?: () => void;
  onTryOcr?: () => void;
  onBack: () => void;
};

const categoryLabels: Record<MedicineCategory, string> = {
  supplement: "Supplement (adds vitamins/minerals)",
  prescription: "Prescription medicine (dose & notes)",
  both: "Both (medicine + nutrients)",
};

function confidenceBadge(
  source: MedicineConfirmCardProps["source"],
  confidence?: ScanResult["confidence"],
): { text: string; className: string } {
  if (source === "manual") {
    return { text: "Manual Review", className: "bg-canvas text-text border border-border" };
  }
  if (confidence?.level === "high") {
    return { text: "AI High Confidence", className: "bg-primary text-primary-fg" };
  }
  if (confidence?.level === "medium") {
    return { text: "AI Medium Confidence", className: "bg-accent text-accent-fg" };
  }
  return {
    text: "Low — Please Double-Check",
    className: "border border-accent bg-caution text-caution-fg",
  };
}

export function MedicineConfirmCard({
  initialDraft,
  initialScheduleHint = null,
  source,
  confidence,
  reviewMessage,
  actions = [],
  busy,
  error,
  savedPendingLog,
  onConfirm,
  onRetake,
  onTryOcr,
  onBack,
}: MedicineConfirmCardProps) {
  const [brandName, setBrandName] = useState(initialDraft.brandName ?? "");
  const [genericName, setGenericName] = useState(initialDraft.genericName ?? "");
  const [category, setCategory] = useState<MedicineCategory>(initialDraft.category ?? "supplement");
  const [defaultDoseLabel, setDefaultDoseLabel] = useState(initialDraft.defaultDoseLabel ?? "");
  const [scheduleHint, setScheduleHint] = useState(initialScheduleHint ?? "");
  const [notes, setNotes] = useState(initialDraft.notes ?? "");
  const [dosesText, setDosesText] = useState("1");
  const [nutrients, setNutrients] = useState<Partial<Record<NutrientKey, string>>>(() => {
    const entries: Partial<Record<NutrientKey, string>> = {};
    for (const key of NUTRIENT_KEYS) {
      const value = initialDraft.nutrientsPerDose[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        entries[key] = String(value);
      }
    }
    return entries;
  });
  const [pickerKey, setPickerKey] = useState<NutrientKey>("vitaminD");
  const [localError, setLocalError] = useState("");

  const badge = confidenceBadge(source, confidence);
  const selectedKeys = NUTRIENT_KEYS.filter((key) => nutrients[key] !== undefined);
  const availableKeys = NUTRIENT_KEYS.filter((key) => nutrients[key] === undefined);

  function addNutrientRow() {
    if (nutrients[pickerKey] !== undefined) return;
    setNutrients((current) => ({ ...current, [pickerKey]: "" }));
    const nextAvailable = availableKeys.find((k) => k !== pickerKey);
    if (nextAvailable) setPickerKey(nextAvailable);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    const trimmedBrand = brandName.trim();
    const trimmedDose = defaultDoseLabel.trim();
    const doses = Number(dosesText);
    if (!trimmedBrand) {
      setLocalError("Enter the medicine or supplement name.");
      return;
    }
    if (!trimmedDose) {
      setLocalError("Enter the default dose (for example, 1 tablet).");
      return;
    }
    if (!Number.isFinite(doses) || doses < 0.000001 || doses > 1_000_000) {
      setLocalError("Enter a valid number of doses.");
      return;
    }

    const nutrientsPerDose: NutrientMap = {};
    if (category !== "prescription") {
      for (const key of selectedKeys) {
        const raw = nutrients[key]?.trim() ?? "";
        if (!raw) continue;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setLocalError(`Enter a valid amount for ${NUTRIENT_CATALOG[key].label}.`);
          return;
        }
        nutrientsPerDose[key] = parsed;
      }
    }

    await onConfirm({
      brandName: trimmedBrand,
      genericName: genericName.trim() || null,
      category,
      defaultDoseLabel: trimmedDose,
      nutrientsPerDose,
      notes: notes.trim() || null,
      scheduleHint: scheduleHint.trim() || null,
      source,
      doses,
    });
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" disabled={busy} onClick={onBack}>
          ← Back
        </Button>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      {reviewMessage && (
        <p className="rounded-xl border border-border bg-canvas p-3 text-text">{reviewMessage}</p>
      )}

      {(actions.includes("retake") || actions.includes("ocr")) && (
        <div className="flex flex-wrap gap-2">
          {actions.includes("retake") && onRetake && (
            <Button variant="outline" disabled={busy} onClick={onRetake}>
              Retake Photo
            </Button>
          )}
          {actions.includes("ocr") && onTryOcr && (
            <Button variant="outline" disabled={busy} onClick={onTryOcr}>
              Try Local OCR
            </Button>
          )}
        </div>
      )}

      <Card className="space-y-4 bg-canvas p-4">
        <label className="grid gap-1">
          <span className="font-semibold">Medicine or supplement name</span>
          <input
            type="text"
            maxLength={120}
            required
            disabled={savedPendingLog}
            value={brandName}
            onChange={(event) => setBrandName(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
        </label>

        <label className="grid gap-1">
          <span>Generic name (optional)</span>
          <input
            type="text"
            maxLength={120}
            disabled={savedPendingLog}
            value={genericName}
            onChange={(event) => setGenericName(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-semibold">Category</span>
          <select
            disabled={savedPendingLog}
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value as MedicineCategory)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          >
            {MEDICINE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="font-semibold">Default dose</span>
            <input
              type="text"
              maxLength={80}
              required
              disabled={savedPendingLog}
              placeholder="e.g., 1 tablet"
              value={defaultDoseLabel}
              onChange={(event) => setDefaultDoseLabel(event.currentTarget.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>

          <label className="grid gap-1">
            <span className="font-semibold">Doses taken now</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0.000001"
              max="1000000"
              required
              value={dosesText}
              onChange={(event) => setDosesText(event.currentTarget.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span>Schedule reminder note (optional)</span>
          <input
            type="text"
            maxLength={120}
            disabled={savedPendingLog}
            placeholder="e.g., After breakfast"
            value={scheduleHint}
            onChange={(event) => setScheduleHint(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
        </label>

        <label className="grid gap-1">
          <span>Food or care notes (optional)</span>
          <textarea
            rows={2}
            maxLength={500}
            disabled={savedPendingLog}
            placeholder="e.g., Take with food."
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface p-3"
          />
        </label>

        {category !== "prescription" && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="font-semibold">Vitamins &amp; minerals per 1 dose</p>
            {selectedKeys.map((key) => {
              const meta = NUTRIENT_CATALOG[key];
              return (
                <div key={key} className="flex items-end gap-2">
                  <label className="grid flex-1 gap-1">
                    <span>
                      {meta.label} ({meta.unit})
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      disabled={savedPendingLog}
                      value={nutrients[key] ?? ""}
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        setNutrients((current) => ({
                          ...current,
                          [key]: nextValue,
                        }));
                      }}
                      className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={savedPendingLog}
                    aria-label={`Remove ${meta.label}`}
                    onClick={() =>
                      setNutrients((current) => {
                        const next = { ...current };
                        delete next[key];
                        return next;
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}

            {availableKeys.length > 0 && !savedPendingLog && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid min-w-44 flex-1 gap-1">
                  <span>Add nutrient</span>
                  <select
                    value={availableKeys.includes(pickerKey) ? pickerKey : availableKeys[0]}
                    onChange={(event) => setPickerKey(event.currentTarget.value as NutrientKey)}
                    className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
                  >
                    {availableKeys.map((key) => (
                      <option key={key} value={key}>
                        {NUTRIENT_CATALOG[key].label} ({NUTRIENT_CATALOG[key].unit})
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="outline" onClick={addNutrientRow}>
                  <Plus className="me-1 h-4 w-4" aria-hidden="true" />
                  <span>Add amount</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {(localError || error) && (
        <p role="alert" className="font-semibold text-accent">
          {localError || error}
        </p>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : savedPendingLog ? "Retry Logging Dose" : "Confirm & Log"}
      </Button>
    </form>
  );
}
