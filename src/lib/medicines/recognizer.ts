import "server-only";
import { OpenRouterError } from "@/lib/openrouter/client";
import {
  IMAGE_MIMES, type ImageMime, type MedicineScanDraft, type OcrCatalogEntry, type OcrProvider,
  type ScanImage, type ScanResult, type ScanSource, type VisionProvider,
} from "./types";

const maxImageBytes = 2 * 1024 * 1024;
const imageErrors = {
  INVALID_IMAGE: { status: 400, message: "Choose a photo and try again." },
  IMAGE_TOO_LARGE: { status: 413, message: "Choose a photo no larger than 2 MB." },
  UNSUPPORTED_IMAGE: { status: 415, message: "Choose a JPEG, PNG, or WebP photo." },
} as const;

export class ScanUploadError extends Error {
  readonly status: (typeof imageErrors)[keyof typeof imageErrors]["status"];
  constructor(public readonly code: keyof typeof imageErrors) {
    super(imageErrors[code].message);
    this.status = imageErrors[code].status;
  }
}

function supportedMime(value: string | undefined): value is ImageMime {
  return IMAGE_MIMES.some((mime) => mime === value);
}

function signatureMatches(mime: ImageMime, bytes: Uint8Array) {
  const startsAt = (offset: number, signature: readonly number[]) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  switch (mime) {
    case "image/jpeg": return startsAt(0, [0xff, 0xd8, 0xff]);
    case "image/png": return startsAt(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp": return startsAt(0, [0x52, 0x49, 0x46, 0x46]) && startsAt(8, [0x57, 0x45, 0x42, 0x50]);
  }
}

export async function readScanImage(request: Request): Promise<ScanImage> {
  const mime = request.headers.get("Content-Type")?.trim().toLowerCase();
  const encoding = request.headers.get("Content-Encoding")?.trim().toLowerCase() ?? "identity";
  if (!supportedMime(mime) || encoding !== "identity") throw new ScanUploadError("UNSUPPORTED_IMAGE");
  const length = request.headers.get("Content-Length");
  if (length !== null) {
    if (!/^[0-9]+$/.test(length)) throw new ScanUploadError("INVALID_IMAGE");
    if (Number(length) > maxImageBytes) throw new ScanUploadError("IMAGE_TOO_LARGE");
  }
  if (!request.body) throw new ScanUploadError("INVALID_IMAGE");
  const reader = request.body.getReader();
  let bytes = new Uint8Array(0);
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxImageBytes - total) throw new ScanUploadError("IMAGE_TOO_LARGE");
      const nextTotal = total + value.byteLength;
      if (nextTotal > bytes.byteLength) {
        // Grow one bounded buffer instead of retaining one object per input chunk.
        const next = new Uint8Array(Math.min(maxImageBytes, Math.max(64 * 1024, nextTotal, bytes.byteLength * 2)));
        next.set(bytes);
        bytes = next;
      }
      bytes.set(value, total);
      total = nextTotal;
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof ScanUploadError) throw error;
    throw new ScanUploadError("INVALID_IMAGE");
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new ScanUploadError("INVALID_IMAGE");
  const image = bytes.subarray(0, total);
  if (!signatureMatches(mime, image)) throw new ScanUploadError("UNSUPPORTED_IMAGE");
  return { mime, bytes: image };
}

type Providers = { vision: VisionProvider; ocr?: OcrProvider; catalog?: readonly OcrCatalogEntry[] };
type Options = { mode: ScanSource; model: string | null };

const recoveryCopy = {
  UNREADABLE: "We couldn't read the label. Try a clear photo in even light or enter it manually.",
  VISION_UNAVAILABLE: "Photo reading is unavailable. Try again or enter it manually.",
  OCR_UNAVAILABLE: "Local photo reading is unavailable. You can enter it manually.",
} as const;
const reviewCopy = "Double-check the name, dose, and any amounts against the package before saving.";

function recovery(source: ScanSource, code: keyof typeof recoveryCopy, offerOcr: boolean): ScanResult {
  return {
    requiresConfirmation: true, source, code, draft: null,
    confidence: { level: "low", score: null }, message: recoveryCopy[code],
    actions: offerOcr ? ["retake", "ocr", "manual"] : ["retake", "manual"],
  };
}

function review(
  source: ScanSource, draft: MedicineScanDraft, confidence: ScanResult["confidence"], offerOcr: boolean,
): ScanResult {
  return {
    requiresConfirmation: true, source, code: "REVIEW", draft, confidence, message: reviewCopy,
    actions: offerOcr ? ["retake", "ocr", "manual"] : ["retake", "manual"],
  };
}

const normalizeLine = (text: string) => text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
function matchCatalog(text: string, catalog: readonly OcrCatalogEntry[]) {
  const lines = new Set(text.slice(0, 4000).split(/\r?\n/).map(normalizeLine).filter(Boolean));
  const matches = catalog.filter((item) =>
    lines.has(normalizeLine(item.brandName)) || (item.genericName && lines.has(normalizeLine(item.genericName))));
  if (matches.length !== 1) return undefined;
  const item = matches[0];
  return {
    brandName: lines.has(normalizeLine(item.brandName)) ? item.brandName : null,
    genericName: item.genericName,
    category: item.category,
  };
}

export async function recognizeMedicine(image: ScanImage, providers: Providers, options: Options): Promise<ScanResult> {
  const { mode, model } = options;
  if (mode === "ocr") {
    if (!providers.ocr) return recovery(mode, "OCR_UNAVAILABLE", false);
    try {
      const matched = matchCatalog(await providers.ocr.readText(image), providers.catalog ?? []);
      if (!matched) return recovery(mode, "UNREADABLE", false);
      return review(mode, {
        brandName: matched.brandName, genericName: matched.genericName, category: matched.category,
        defaultDoseLabel: null, nutrientsPerDose: {}, notes: null,
      }, { level: "low", score: null }, false);
    } catch {
      return recovery(mode, "OCR_UNAVAILABLE", false);
    }
  }
  const offerOcr = Boolean(providers.ocr);
  try {
    const { draft, score } = await providers.vision.readLabel(image, model);
    if (!draft.brandName && !draft.genericName) return recovery(mode, "UNREADABLE", offerOcr);
    const incomplete = !draft.brandName || !draft.category || !draft.defaultDoseLabel ||
      (draft.category !== "prescription" && !Object.keys(draft.nutrientsPerDose).length);
    const level = incomplete || score < 0.60 ? "low" : score < 0.85 ? "medium" : "high";
    return review(mode, draft, { level, score }, offerOcr && level === "low");
  } catch (error) {
    const code = error instanceof OpenRouterError && error.code === "INVALID_OUTPUT"
      ? "UNREADABLE" : "VISION_UNAVAILABLE";
    return recovery(mode, code, offerOcr);
  }
}
