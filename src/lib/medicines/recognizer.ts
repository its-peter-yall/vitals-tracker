import "server-only";
import { IMAGE_MIMES, type ImageMime, type ScanImage } from "./types";

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
