"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Pill, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  CabinetMedicine,
  MedicineScanDraft,
  ScanResult,
} from "@/lib/medicines/types";
import type { IntakeLog } from "@/lib/trackers/service";
import { compressMedicineImage } from "./image-compress";
import {
  MedicineConfirmCard,
  type ConfirmedMedicinePayload,
} from "./medicine-confirm-card";

type ModalMode =
  | { kind: "cabinet" }
  | { kind: "recovery"; result: ScanResult }
  | {
      kind: "confirm";
      draft: MedicineScanDraft;
      scheduleHint?: string | null;
      source: "manual" | "vision_confirmed" | "ocr_confirmed";
      confidence?: ScanResult["confidence"];
      message?: string | null;
      actions?: readonly ("retake" | "ocr" | "manual")[];
    };

type MedicineLogModalProps = {
  trackerId: string;
  logDate: string;
  onClose: () => void;
  onLogged: (log: IntakeLog) => void;
};

const EMPTY_DRAFT: MedicineScanDraft = {
  brandName: null,
  genericName: null,
  category: "supplement",
  defaultDoseLabel: null,
  nutrientsPerDose: {},
  notes: null,
};

const CATEGORY_BADGES = {
  supplement: "Supplement",
  prescription: "Prescription",
  both: "Medicine + Nutrients",
} as const;

export function MedicineLogModal({
  trackerId,
  logDate,
  onClose,
  onLogged,
}: MedicineLogModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [myMedicines, setMyMedicines] = useState<CabinetMedicine[]>([]);
  const [curated, setCurated] = useState<CabinetMedicine[]>([]);
  const [curatedQuery, setCuratedQuery] = useState("");
  const [showCurated, setShowCurated] = useState(false);
  const [loadingCabinet, setLoadingCabinet] = useState(true);

  const [mode, setMode] = useState<ModalMode>({ kind: "cabinet" });
  const [lastCompressedBlob, setLastCompressedBlob] = useState<Blob | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savedMedicineId, setSavedMedicineId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/medicines", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("cabinet unavailable");
        const body = await response.json();
        if (!controller.signal.aborted) {
          setMyMedicines(Array.isArray(body?.medicines) ? body.medicines : []);
          setCurated(Array.isArray(body?.curated) ? body.curated : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load My Medicines. You can still scan or add manually.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingCabinet(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function logCabinetMedicine(medicine: CabinetMedicine) {
    if (busyId) return;
    setBusyId(medicine.id);
    setError("");
    try {
      const response = await fetch(`/api/trackers/${trackerId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "medicine",
          medicineId: medicine.id,
          quantity: 1,
          unit: "dose",
          logDate,
        }),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok || !body?.log) {
        setError(typeof body?.error === "string" ? body.error : "Could not log this medicine.");
        return;
      }
      onLogged(body.log);
    } catch {
      setError("Could not log this medicine. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function runScan(blob: Blob, scanMode: "vision" | "ocr") {
    setScanning(true);
    setError("");
    setSavedMedicineId(null);
    try {
      const url = scanMode === "ocr" ? "/api/medicines/scan?mode=ocr" : "/api/medicines/scan";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Could not read this photo. Try again or enter it manually.",
        );
        return;
      }
      const result = body as ScanResult;
      if (result.draft) {
        setMode({
          kind: "confirm",
          draft: result.draft,
          source: result.source === "ocr" ? "ocr_confirmed" : "vision_confirmed",
          confidence: result.confidence,
          message: result.message,
          actions: result.actions,
        });
      } else {
        setMode({ kind: "recovery", result });
      }
    } catch {
      setError("Photo reading failed. Try again or enter the medicine manually.");
    } finally {
      setScanning(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    try {
      const compressed = await compressMedicineImage(file);
      setLastCompressedBlob(compressed);
      await runScan(compressed, "vision");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Please choose a valid JPEG, PNG, or WebP photo.",
      );
    }
  }

  function triggerRetake() {
    setSavedMedicineId(null);
    setError("");
    setMode({ kind: "cabinet" });
    fileInputRef.current?.click();
  }

  function openManual() {
    setSavedMedicineId(null);
    setError("");
    setMode({
      kind: "confirm",
      draft: EMPTY_DRAFT,
      source: "manual",
      message: "Enter details from the medicine strip or bottle.",
    });
  }

  function pickCurated(item: CabinetMedicine) {
    setSavedMedicineId(null);
    setError("");
    setMode({
      kind: "confirm",
      draft: {
        brandName: item.brandName,
        genericName: item.genericName,
        category: item.category,
        defaultDoseLabel: item.defaultDoseLabel,
        nutrientsPerDose: item.nutrientsPerDose,
        notes: item.notes,
      },
      scheduleHint: item.scheduleHint,
      source: "manual",
      message: "Check this starter template against your actual package before saving to My Medicines.",
    });
  }

  async function handleConfirmAndLog(payload: ConfirmedMedicinePayload) {
    if (confirmBusy) return;
    setConfirmBusy(true);
    setError("");
    try {
      let medicineId = savedMedicineId;
      if (!medicineId) {
        const createRes = await fetch("/api/medicines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName: payload.brandName,
            genericName: payload.genericName,
            category: payload.category,
            defaultDoseLabel: payload.defaultDoseLabel,
            nutrientsPerDose: payload.nutrientsPerDose,
            notes: payload.notes,
            scheduleHint: payload.scheduleHint,
            source: payload.source,
          }),
        });
        if (createRes.status === 401) {
          window.location.replace("/login");
          return;
        }
        const createBody = await createRes.json();
        if (!createRes.ok || !createBody?.medicine?.id) {
          setError(
            typeof createBody?.error === "string"
              ? createBody.error
              : "Check the medicine details and try again.",
          );
          return;
        }
        medicineId = createBody.medicine.id;
        setSavedMedicineId(medicineId);
      }

      const logRes = await fetch(`/api/trackers/${trackerId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "medicine",
          medicineId,
          quantity: payload.doses,
          unit: "dose",
          logDate,
        }),
      });
      if (logRes.status === 401) {
        window.location.replace("/login");
        return;
      }
      const logBody = await logRes.json();
      if (!logRes.ok || !logBody?.log) {
        setError(
          typeof logBody?.error === "string"
            ? `${logBody.error} Your medicine is saved in My Medicines — tap Retry Logging Dose.`
            : "Saved to My Medicines, but logging failed. Tap Retry Logging Dose.",
        );
        return;
      }
      onLogged(logBody.log);
    } catch {
      setError("Could not complete logging. Check your connection and try again.");
    } finally {
      setConfirmBusy(false);
    }
  }

  const filteredCurated = curatedQuery.trim()
    ? curated.filter((item) => {
        const q = curatedQuery.trim().toLowerCase();
        return (
          item.brandName.toLowerCase().includes(q) ||
          (item.genericName?.toLowerCase().includes(q) ?? false)
        );
      })
    : curated;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="medicine-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
    >
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="medicine-modal-title" className="text-2xl font-bold text-text">
            Add Medicine or Supplement
          </h2>
          <Button variant="outline" aria-label="Close Add Medicine" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Hidden file input remains mounted so Retake works from any view */}
        <input
          ref={fileInputRef}
          id="medicine-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Scan Medicine Photo"
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
        />

        {scanning && (
          <Card className="mb-4 bg-canvas">
            <p role="status" className="font-semibold text-primary">
              Reading medicine label… Please wait a moment.
            </p>
          </Card>
        )}

        {mode.kind === "cabinet" && (
          <div className="space-y-5">
            <section className="space-y-3" aria-labelledby="my-medicines-heading">
              <h3 id="my-medicines-heading" className="text-xl font-bold text-text">
                My Medicines (1-Tap Log)
              </h3>
              {loadingCabinet ? (
                <p role="status" className="text-muted">Loading your saved medicines…</p>
              ) : myMedicines.length === 0 ? (
                <p className="text-muted">
                  No saved medicines yet. Scan a photo or add one below — it will stay here for 1-tap logging next time.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {myMedicines.map((med) => (
                    <li key={med.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-3 bg-canvas p-3">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="font-bold text-text">{med.brandName}</p>
                          <p className="text-muted">
                            {CATEGORY_BADGES[med.category]} · {med.defaultDoseLabel}
                            {med.scheduleHint ? ` · ${med.scheduleHint}` : ""}
                          </p>
                        </div>
                        <Button
                          disabled={busyId !== null || scanning}
                          aria-label={`Log ${med.brandName}`}
                          onClick={() => void logCabinetMedicine(med)}
                        >
                          <Pill className="me-1.5 h-4 w-4" aria-hidden="true" />
                          <span>{busyId === med.id ? "Logging…" : "Log 1 dose"}</span>
                        </Button>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="font-semibold text-text">Add a new medicine or supplement</p>
              <p className="text-muted">
                Photo reading sends the photo to your configured AI model. Crop out personal details and double-check the package before saving.
              </p>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  disabled={scanning}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="me-2 h-5 w-5" aria-hidden="true" />
                  <span>Scan Medicine Photo</span>
                </Button>
                <Button variant="outline" disabled={scanning} onClick={openManual}>
                  <Plus className="me-2 h-5 w-5" aria-hidden="true" />
                  <span>Add Manually</span>
                </Button>
              </div>

              {curated.length > 0 && (
                <div className="space-y-2 pt-1">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowCurated((value) => !value)}
                  >
                    <Search className="me-2 h-5 w-5" aria-hidden="true" />
                    <span>{showCurated ? "Hide Starter Catalog" : "Browse Starter Catalog"}</span>
                  </Button>

                  {showCurated && (
                    <div className="space-y-2 rounded-xl border border-border bg-canvas p-3">
                      <label className="grid gap-1">
                        <span>Search starter medicines</span>
                        <input
                          type="search"
                          value={curatedQuery}
                          onChange={(event) => setCuratedQuery(event.currentTarget.value)}
                          className="min-h-12 w-full rounded-lg border border-border bg-surface px-3"
                        />
                      </label>
                      <ul className="max-h-52 space-y-2 overflow-y-auto">
                        {filteredCurated.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => pickCurated(item)}
                              className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left"
                            >
                              <span className="font-semibold">{item.brandName}</span>
                              <span className="text-muted">{CATEGORY_BADGES[item.category]}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="font-semibold text-accent">
                  {error}
                </p>
              )}
            </section>
          </div>
        )}

        {mode.kind === "recovery" && (
          <div className="space-y-4">
            <Card className="space-y-3 border-2 border-accent bg-caution text-caution-fg">
              <h3 className="text-xl font-bold">Could not read the label clearly</h3>
              <p>{mode.result.message}</p>
              <p>
                Tip: Place the strip or bottle on a flat surface in even light and avoid shiny glare.
              </p>
            </Card>

            {error && (
              <p role="alert" className="font-semibold text-accent">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-2.5">
              <Button disabled={scanning} onClick={triggerRetake}>
                Retake Photo
              </Button>
              {mode.result.actions.includes("ocr") && lastCompressedBlob && (
                <Button
                  variant="secondary"
                  disabled={scanning}
                  onClick={() => void runScan(lastCompressedBlob, "ocr")}
                >
                  Try Local OCR
                </Button>
              )}
              <Button variant="outline" disabled={scanning} onClick={openManual}>
                Enter Manually
              </Button>
            </div>
          </div>
        )}

        {mode.kind === "confirm" && (
          <MedicineConfirmCard
            initialDraft={mode.draft}
            initialScheduleHint={mode.scheduleHint}
            source={mode.source}
            confidence={mode.confidence}
            reviewMessage={mode.message}
            actions={mode.actions}
            busy={confirmBusy || scanning}
            error={error}
            savedPendingLog={savedMedicineId !== null}
            onConfirm={handleConfirmAndLog}
            onRetake={triggerRetake}
            onTryOcr={
              lastCompressedBlob ? () => void runScan(lastCompressedBlob, "ocr") : undefined
            }
            onBack={() => {
              setSavedMedicineId(null);
              setError("");
              setMode({ kind: "cabinet" });
            }}
          />
        )}
      </div>
    </div>
  );
}
