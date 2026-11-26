"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Pill, Trash2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roundNutrientForDisplay } from "@/lib/nutrients/calculator";
import { isNutrientKey, NUTRIENT_CATALOG } from "@/lib/nutrients/catalog";
import type { IntakeLog } from "@/lib/trackers/service";
import { formatLocalTime } from "./local-date";

type DailyLogListProps = {
  logs: readonly IntakeLog[];
  onEditQuantity: (logId: string, quantity: number) => Promise<void>;
  onDeleteLog: (log: IntakeLog) => void;
};

function formatQuantity(quantity: number, unit: IntakeLog["unit"]): string {
  const rounded = roundNutrientForDisplay(quantity);
  if (unit === "dose") return `${rounded} ${rounded === 1 ? "dose" : "doses"}`;
  return `${rounded} ${unit}`;
}

export function DailyLogList({ logs, onEditQuantity, onDeleteLog }: DailyLogListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState("");

  function startEdit(log: IntakeLog) {
    setEditingId(log.id);
    setDraftQty(String(log.quantity));
    setEditError("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, logId: string) {
    event.preventDefault();
    const parsed = Number(draftQty);
    if (!Number.isFinite(parsed) || parsed < 0.000001 || parsed > 1_000_000) {
      setEditError("Enter a valid number greater than 0.");
      return;
    }
    setSavingId(logId);
    setEditError("");
    try {
      await onEditQuantity(logId, parsed);
      setEditingId(null);
    } catch {
      setEditError("Could not update quantity. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (logs.length === 0) {
    return (
      <Card>
        <p className="text-muted">Nothing logged for this day yet. Tap + Add Food or + Add Medicine below.</p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Logged items">
      {logs.map((log) => {
        const isEditing = editingId === log.id;
        const isFood = log.entryType === "food";
        const nutrientHighlights = Object.entries(log.computedNutrientsJson)
          .filter(([key, value]) => isNutrientKey(key) && typeof value === "number" && value > 0)
          .slice(0, 3);

        return (
          <li key={log.id}>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isFood ? "bg-primary text-primary-fg" : "bg-accent text-accent-fg"
                    }`}
                  >
                    {isFood ? (
                      <Utensils className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Pill className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="font-bold text-text">{log.displayName}</p>
                    <p className="text-muted">
                      <span>{formatQuantity(log.quantity, log.unit)}</span>
                      {log.loggedAt && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{formatLocalTime(log.loggedAt)}</span>
                        </>
                      )}
                    </p>
                    {log.medicineNotes && (
                      <p className="rounded-lg border-s-4 border-accent bg-canvas px-3 py-2 text-text">
                        {log.medicineNotes}
                      </p>
                    )}
                    {!isFood && nutrientHighlights.length > 0 && (
                      <p className="text-muted">
                        Adds{" "}
                        {nutrientHighlights
                          .map(([key, value]) => {
                            const meta = NUTRIENT_CATALOG[key as keyof typeof NUTRIENT_CATALOG];
                            return `${meta.label} ${roundNutrientForDisplay(value)} ${meta.unit}`;
                          })
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      aria-label={`Edit ${log.displayName}`}
                      onClick={() => startEdit(log)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      <span className="ms-1.5">Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      aria-label={`Delete ${log.displayName}`}
                      onClick={() => onDeleteLog(log)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="ms-1.5">Delete</span>
                    </Button>
                  </div>
                )}
              </div>

              {isEditing && (
                <form
                  onSubmit={(event) => void saveEdit(event, log.id)}
                  className="flex flex-wrap items-end gap-3 border-t border-border pt-3"
                >
                  <label className="grid min-w-36 flex-1 gap-1">
                    <span>Quantity ({log.unit})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0.000001"
                      max="1000000"
                      required
                      value={draftQty}
                      onChange={(event) => setDraftQty(event.currentTarget.value)}
                      className="min-h-12 w-full rounded-lg border border-border bg-canvas px-3"
                    />
                  </label>
                  <Button type="submit" disabled={savingId === log.id}>
                    {savingId === log.id ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={savingId === log.id}
                    onClick={() => {
                      setEditingId(null);
                      setEditError("");
                    }}
                  >
                    Cancel
                  </Button>
                  {editError && (
                    <p role="alert" className="w-full text-accent">
                      {editError}
                    </p>
                  )}
                </form>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
