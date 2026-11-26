import { IMAGE_MIMES, type ImageMime } from "@/lib/medicines/types";

export const MAX_SIDE_PX = 1024;
export const TARGET_MAX_BYTES = 400_000;
export const SERVER_MAX_BYTES = 2 * 1024 * 1024;
const QUALITY_STEPS = [0.7, 0.55, 0.4] as const;

export function isSupportedImageMime(mime: string): mime is ImageMime {
  return (IMAGE_MIMES as readonly string[]).includes(mime.toLowerCase());
}

export function computeTargetDimensions(
  width: number,
  height: number,
  maxSide: number = MAX_SIDE_PX,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxSide, height: maxSide };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type DecodedImage = {
  width: number;
  height: number;
  source?: CanvasImageSource;
  close?: () => void;
};

type CompressDeps = {
  decode?: (blob: Blob) => Promise<DecodedImage>;
  encode?: (width: number, height: number, quality: number, source?: CanvasImageSource) => Promise<Blob | null>;
};

async function defaultDecode(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read this photo."));
      img.src = url;
    });
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      source: image,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function defaultEncode(
  width: number,
  height: number,
  quality: number,
  source?: CanvasImageSource,
): Promise<Blob | null> {
  if (typeof document === "undefined" || !source) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressMedicineImage(
  file: Blob,
  deps?: CompressDeps,
): Promise<Blob> {
  if (!isSupportedImageMime(file.type)) {
    throw new Error("Please choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size === 0) {
    throw new Error("The selected photo is empty. Please choose another photo.");
  }

  const decode = deps?.decode ?? defaultDecode;
  const encode = deps?.encode ?? defaultEncode;

  // Skip canvas pipeline in non-canvas environments (e.g., jsdom) when no custom encoder is injected.
  if (!deps?.encode) {
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
      if (file.size <= SERVER_MAX_BYTES) return file;
      throw new Error("This photo is larger than 2 MB. Try taking a closer photo.");
    }
    const probe = document.createElement("canvas");
    if (!probe.getContext || !probe.getContext("2d")) {
      if (file.size <= SERVER_MAX_BYTES) return file;
      throw new Error("This photo is larger than 2 MB. Try taking a closer photo.");
    }
  }

  let decoded: DecodedImage | null = null;
  try {
    decoded = await decode(file);
    const { width, height } = computeTargetDimensions(decoded.width, decoded.height, MAX_SIDE_PX);

    let best: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const candidate = await encode(width, height, quality, decoded.source);
      if (!candidate) break;
      best = candidate;
      if (candidate.size <= TARGET_MAX_BYTES) return candidate;
    }

    if (best && best.size <= SERVER_MAX_BYTES) return best;
  } catch {
    // Fall through to bounded original check if browser lacks canvas/bitmap decode.
  } finally {
    decoded?.close?.();
  }

  if (file.size <= SERVER_MAX_BYTES) {
    return file;
  }
  throw new Error("This photo is larger than 2 MB. Try taking a closer photo.");
}
