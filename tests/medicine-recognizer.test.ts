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
