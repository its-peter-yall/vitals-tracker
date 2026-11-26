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

const labeledVitamin = {
  brandName: "D3 Bottle",
  genericName: "Cholecalciferol",
  category: "supplement",
  defaultDoseLabel: "1 softgel",
  nutrients: [{ key: "vitaminD", amount: 25, unit: "mcg" }],
  notes: "Label says to take with food.",
  confidence: 0.91,
};
const visionImage = { mime: "image/png", bytes: pngHeader } as const;

function mockVision(content: string) {
  vi.stubEnv("OPENROUTER_API_KEY", "test-only");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ choices: [{ message: { content } }] }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("extracts a canonical per-dose draft using P1's structured in-memory vision transport", async () => {
  const { openRouterVisionProvider } = await import("@/lib/medicines/openrouter-vision");
  const fetchMock = mockVision("```json\n" + JSON.stringify(labeledVitamin) + "\n```");
  const reading = await openRouterVisionProvider.readLabel(visionImage, "openai/gpt-4o");
  expect(reading).toEqual({
    score: 0.91,
    draft: {
      brandName: "D3 Bottle", genericName: "Cholecalciferol", category: "supplement",
      defaultDoseLabel: "1 softgel", nutrientsPerDose: { vitaminD: 25 },
      notes: "Label says to take with food.",
    },
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(init?.cache).toBe("no-store");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    model: "openai/gpt-4o",
    response_format: { type: "json_schema", json_schema: {
      name: "medicine_scan", strict: true,
      schema: { additionalProperties: false, required: Object.keys(labeledVitamin) },
    } },
    messages: [
      { role: "system" },
      { role: "user", content: [
        { type: "text", text: expect.stringContaining("vitaminD: mcg") },
        { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(pngHeader).toString("base64")}` } },
      ] },
    ],
  });
  mockVision(JSON.stringify({ ...labeledVitamin, category: "both" }));
  await expect(openRouterVisionProvider.readLabel(visionImage, null)).resolves
    .toMatchObject({ draft: { category: "both", nutrientsPerDose: { vitaminD: 25 } } });
  mockVision(JSON.stringify({
    ...labeledVitamin, brandName: "Prescription box", category: "prescription", nutrients: [],
  }));
  await expect(openRouterVisionProvider.readLabel(visionImage, null)).resolves
    .toMatchObject({ draft: { category: "prescription", nutrientsPerDose: {} } });
});

it("normalizes partial vision data without guessing a dose, category, or nutrients", async () => {
  const { openRouterVisionProvider } = await import("@/lib/medicines/openrouter-vision");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "custom/deployment-default");
  const fetchMock = mockVision(JSON.stringify({ genericName: "Magnesium", brandName: null, confidence: 0.92 }));
  await expect(openRouterVisionProvider.readLabel(visionImage, null)).resolves.toEqual({
    score: 0.92, draft: {
      brandName: null, genericName: "Magnesium", category: null, defaultDoseLabel: null,
      nutrientsPerDose: {}, notes: null,
    },
  });
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("custom/deployment-default");
});

it("rejects malformed vision JSON, unknown keys, wrong units, duplicate amounts, and invalid confidence", async () => {
  const { openRouterVisionProvider } = await import("@/lib/medicines/openrouter-vision");
  const malformed = [
    "{ not JSON",
    ...[
      { category: "unknown" }, { confidence: 1.1 }, { patientName: "private" },
      { nutrients: [{ key: "vitamin_d", amount: 25, unit: "mcg" }] },
      { nutrients: [{ key: "vitaminD", amount: 1000, unit: "IU" }] },
      { nutrients: [{ key: "vitaminD", amount: 0.025, unit: "mg" }] },
      { nutrients: [{ key: "vitaminD", amount: -1, unit: "mcg" }] },
      { nutrients: [...labeledVitamin.nutrients, ...labeledVitamin.nutrients] },
      { category: "prescription" },
    ].map((change) => JSON.stringify({ ...labeledVitamin, ...change })),
  ];
  for (const content of malformed) {
    mockVision(content);
    await expect(openRouterVisionProvider.readLabel(visionImage, null)).rejects
      .toMatchObject({ code: "INVALID_OUTPUT" });
  }
});

const createWorkerMock = vi.hoisted(() => vi.fn());
vi.mock("tesseract.js", () => ({
  default: { createWorker: createWorkerMock, OEM: { LSTM_ONLY: 1 } },
}));

it("starts OCR lazily, passes only in-memory bytes, disables the host cache, and reuses the worker", async () => {
  const { createTesseractOcrProvider } = await import("@/lib/medicines/ocr-fallback");
  createWorkerMock.mockReset();
  vi.useFakeTimers();
  const recognize = vi.fn().mockResolvedValue({ data: { text: "Vitamin D3 25 mcg" } });
  const terminate = vi.fn().mockResolvedValue(undefined);
  createWorkerMock.mockResolvedValue({ recognize, terminate });
  const provider = createTesseractOcrProvider(1000, 200);
  expect(createWorkerMock).not.toHaveBeenCalled();
  await expect(provider.readText(visionImage)).resolves.toBe("Vitamin D3 25 mcg");
  await expect(provider.readText(visionImage)).resolves.toBe("Vitamin D3 25 mcg");
  expect(createWorkerMock).toHaveBeenCalledExactlyOnceWith("eng", 1, {
    cacheMethod: "none", errorHandler: expect.any(Function),
  });
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(recognize).toHaveBeenLastCalledWith(Buffer.from(pngHeader));
  expect(Buffer.isBuffer(recognize.mock.calls[0][0])).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(terminate).toHaveBeenCalledOnce();
});

it("returns a safe OCR error on init failure and will not spawn repeatedly", async () => {
  const { createTesseractOcrProvider } = await import("@/lib/medicines/ocr-fallback");
  createWorkerMock.mockReset().mockRejectedValue(new Error("private worker diagnostic"));
  const provider = createTesseractOcrProvider();
  const unavailable = { code: "OCR_UNAVAILABLE", message: "Local photo reading is unavailable." };
  await expect(provider.readText(visionImage)).rejects.toMatchObject(unavailable);
  await expect(provider.readText(visionImage)).rejects.toMatchObject(unavailable);
  expect(createWorkerMock).toHaveBeenCalledOnce();
});

it("does not queue another image and terminates a timed-out recognition", async () => {
  const { createTesseractOcrProvider } = await import("@/lib/medicines/ocr-fallback");
  createWorkerMock.mockReset();
  vi.useFakeTimers();
  const recognize = vi.fn().mockResolvedValueOnce({ data: { text: "ok" } })
    .mockImplementationOnce(() => new Promise(() => {}));
  const terminate = vi.fn().mockResolvedValue(undefined);
  createWorkerMock.mockResolvedValue({ recognize, terminate });
  const provider = createTesseractOcrProvider(1000, 100);
  await provider.readText(visionImage);
  const pending = expect(provider.readText(visionImage)).rejects.toMatchObject({ code: "OCR_UNAVAILABLE" });
  await expect(provider.readText(visionImage)).rejects.toMatchObject({ code: "OCR_UNAVAILABLE" });
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(terminate).toHaveBeenCalledOnce();
});

it("bands high, medium, and low confidence and caps partial vision at low", async () => {
  const { recognizeMedicine } = await import("@/lib/medicines/recognizer");
  const { openRouterVisionProvider: vision } = await import("@/lib/medicines/openrouter-vision");
  const ocr = { readText: vi.fn() };
  for (const [confidence, level] of [[0.85, "high"], [0.60, "medium"], [0.59, "low"]] as const) {
    mockVision(JSON.stringify({ ...labeledVitamin, confidence }));
    const result = await recognizeMedicine(visionImage, { vision, ocr }, { mode: "vision", model: null });
    expect(result).toMatchObject({
      requiresConfirmation: true, source: "vision", code: "REVIEW", confidence: { score: confidence, level },
    });
    expect(result.actions).toEqual(level === "low" ? ["retake", "ocr", "manual"] : ["retake", "manual"]);
  }
  for (const changes of [{ defaultDoseLabel: null }, { brandName: null }, { category: null }, { nutrients: [] }]) {
    mockVision(JSON.stringify({ ...labeledVitamin, ...changes }));
    await expect(recognizeMedicine(visionImage, { vision, ocr }, { mode: "vision", model: null }))
      .resolves.toMatchObject({ confidence: { score: 0.91, level: "low" }, code: "REVIEW" });
  }
  expect(ocr.readText).not.toHaveBeenCalled();
});

it("returns useful recovery for invalid, unreadable, or unavailable vision without leaking provider text", async () => {
  const { recognizeMedicine } = await import("@/lib/medicines/recognizer");
  const { openRouterVisionProvider: vision } = await import("@/lib/medicines/openrouter-vision");
  const ocr = { readText: vi.fn() };
  for (const content of [
    "{private provider error",
    JSON.stringify({ brandName: null, genericName: null, confidence: 0.95 }),
  ]) {
    mockVision(content);
    const result = await recognizeMedicine(visionImage, { vision, ocr }, { mode: "vision", model: null });
    expect(result).toMatchObject({
      code: "UNREADABLE", draft: null, confidence: { score: null, level: "low" },
      actions: ["retake", "ocr", "manual"],
    });
    expect(JSON.stringify(result)).not.toContain("private provider error");
  }
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  await expect(recognizeMedicine(visionImage, { vision, ocr }, { mode: "vision", model: null }))
    .resolves.toMatchObject({ code: "VISION_UNAVAILABLE", draft: null, actions: ["retake", "ocr", "manual"] });
  const fetchMock = mockVision("");
  fetchMock.mockResolvedValue(new Response("private gateway detail", { status: 504 }));
  const timeout = await recognizeMedicine(visionImage, { vision, ocr }, { mode: "vision", model: null });
  expect(timeout).toMatchObject({ code: "VISION_UNAVAILABLE", draft: null });
  expect(JSON.stringify(timeout)).not.toContain("private gateway detail");
  expect(ocr.readText).not.toHaveBeenCalled();
});

it("uses OCR only when requested and matches just one whole label line to the curated catalog", async () => {
  const { recognizeMedicine } = await import("@/lib/medicines/recognizer");
  const { curatedMedicines: catalog } = await import("@/db/seed-medicines");
  const vision = { readLabel: vi.fn() };
  const ocr = { readText: vi.fn().mockResolvedValue("VITAMIN D3  25 mcg\nprivate batch note") };
  const options = { mode: "ocr", model: null } as const;
  const result = await recognizeMedicine(visionImage, { vision, ocr, catalog }, options);
  expect(result).toMatchObject({
    requiresConfirmation: true, source: "ocr", code: "REVIEW", confidence: { level: "low", score: null },
    draft: {
      brandName: "Vitamin D3 25 mcg", genericName: "Cholecalciferol", category: "supplement",
      defaultDoseLabel: null, nutrientsPerDose: {}, notes: null,
    },
  });
  expect(ocr.readText).toHaveBeenCalledExactlyOnceWith(visionImage);
  expect(JSON.stringify(result)).not.toContain("private batch note");
  ocr.readText.mockResolvedValue("Magnesium");
  await expect(recognizeMedicine(visionImage, { vision, ocr, catalog }, options)).resolves
    .toMatchObject({ draft: { brandName: null, genericName: "Magnesium", nutrientsPerDose: {} } });
  for (const text of ["Metformin XR", "Vitamin D3 25 mcg\nMetformin", "unlisted"]) {
    ocr.readText.mockResolvedValue(text);
    await expect(recognizeMedicine(visionImage, { vision, ocr, catalog }, options))
      .resolves.toMatchObject({ code: "UNREADABLE", draft: null });
  }
  ocr.readText.mockRejectedValue(new Error("private startup details"));
  const failed = await recognizeMedicine(visionImage, { vision, ocr, catalog }, options);
  expect(failed).toMatchObject({ code: "OCR_UNAVAILABLE", draft: null, actions: ["retake", "manual"] });
  expect(JSON.stringify(failed)).not.toContain("private startup details");
  await expect(recognizeMedicine(visionImage, { vision }, options))
    .resolves.toMatchObject({ code: "OCR_UNAVAILABLE", draft: null });
  expect(vision.readLabel).not.toHaveBeenCalled();
});
