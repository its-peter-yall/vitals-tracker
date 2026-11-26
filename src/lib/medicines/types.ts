import type { NutrientMap } from "@/lib/nutrients/types";

export const MEDICINE_CATEGORIES = ["supplement", "prescription", "both"] as const;
export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number];
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];
export type ScanImage = Readonly<{ mime: ImageMime; bytes: Uint8Array }>;

export type MedicineScanDraft = {
  brandName: string | null;
  genericName: string | null;
  category: MedicineCategory | null;
  defaultDoseLabel: string | null;
  nutrientsPerDose: NutrientMap;
  notes: string | null;
};
export type VisionReading = { draft: MedicineScanDraft; score: number };
export interface VisionProvider {
  readLabel(image: ScanImage, model: string | null): Promise<VisionReading>;
}
export interface OcrProvider {
  readText(image: ScanImage): Promise<string>;
}
export type OcrCatalogEntry = Pick<MedicineScanDraft, "genericName"> & {
  brandName: string; category: MedicineCategory;
};

export type ScanSource = "vision" | "ocr";
export type ScanResult = {
  requiresConfirmation: true;
  source: ScanSource;
  code: "REVIEW" | "UNREADABLE" | "VISION_UNAVAILABLE" | "OCR_UNAVAILABLE";
  draft: MedicineScanDraft | null;
  confidence: { level: "high" | "medium" | "low"; score: number | null };
  message: string | null;
  actions: ("retake" | "ocr" | "manual")[];
};

export type CabinetMedicine = {
  id: string;
  brandName: string;
  genericName: string | null;
  category: MedicineCategory;
  defaultDoseLabel: string;
  nutrientsPerDose: NutrientMap;
  notes: string | null;
  scheduleHint: string | null;
  source: "curated" | "manual" | "vision_confirmed" | "ocr_confirmed";
  createdAt: string;
};
