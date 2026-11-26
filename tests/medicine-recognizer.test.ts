import { expect, it, vi } from "vitest";

const maxImage = 2 * 1024 * 1024;
const pngHeader = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const jpegHeader = Uint8Array.of(0xff, 0xd8, 0xff);
const webpHeader = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBP");

function imageRequest(mime: string, bytes: Uint8Array, extraHeaders?: Record<string, string>) {
  return new Request("https://app.example.test/api/medicines/scan", {
    method: "POST",
    headers: { "Content-Type": mime, ...extraHeaders },
    body: new Uint8Array(bytes),
  });
}

it("accepts only supported image signatures, including exactly 2 MiB", async () => {
  const { readScanImage } = await import("@/lib/medicines/recognizer");
  const limit = new Uint8Array(maxImage);
  limit.set(pngHeader);
  for (const [mime, bytes] of [
    ["image/jpeg", jpegHeader], ["image/png", limit], ["image/webp", webpHeader],
  ] as const) {
    const image = await readScanImage(imageRequest(mime, bytes));
    expect(image.mime).toBe(mime);
    expect(Buffer.from(image.bytes).equals(Buffer.from(bytes))).toBe(true);
  }
});

it("rejects spoofed, unsupported and empty uploads before provider access", async () => {
  const { readScanImage } = await import("@/lib/medicines/recognizer");
  for (const mime of ["image/gif", "image/svg+xml", "image/heic", "multipart/form-data", "text/plain"]) {
    const request = imageRequest(mime, pngHeader);
    await expect(readScanImage(request)).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE", status: 415 });
    expect(request.bodyUsed).toBe(false);
  }
  await expect(readScanImage(imageRequest("image/png", jpegHeader))).rejects.toMatchObject({ status: 415 });
  await expect(readScanImage(imageRequest("image/png", pngHeader.subarray(0, 4)))).rejects
    .toMatchObject({ status: 415 });
  await expect(readScanImage(imageRequest("image/png", pngHeader, { "Content-Encoding": "gzip" })))
    .rejects.toMatchObject({ status: 415 });
  await expect(readScanImage(imageRequest("image/jpeg", new Uint8Array()))).rejects
    .toMatchObject({ code: "INVALID_IMAGE", status: 400 });
});

it("rejects declared and actual oversized uploads and cancels a streaming overflow", async () => {
  const { readScanImage } = await import("@/lib/medicines/recognizer");
  const declared = imageRequest("image/png", pngHeader, { "Content-Length": String(maxImage + 1) });
  await expect(readScanImage(declared)).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE", status: 413 });
  expect(declared.bodyUsed).toBe(false);
  const cancel = vi.fn();
  const bytes = new Uint8Array(maxImage);
  bytes.set(pngHeader);
  const request = new Request("https://app.example.test/api/medicines/scan", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.enqueue(Uint8Array.of(0));
      },
      cancel,
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await expect(readScanImage(request)).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalledOnce();
});
