import { curatedMedicines } from "@/db/seed-medicines";
import { authJson, requireUser } from "@/lib/auth/session";
import { tesseractOcrProvider } from "@/lib/medicines/ocr-fallback";
import { openRouterVisionProvider } from "@/lib/medicines/openrouter-vision";
import { readScanImage, recognizeMedicine, ScanUploadError } from "@/lib/medicines/recognizer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams;
  const modes = query.getAll("mode");
  const mode = modes[0] ?? "vision";
  if ([...query.keys()].some((key) => key !== "mode") || modes.length > 1 || (mode !== "vision" && mode !== "ocr")) {
    return authJson({ code: "INVALID_MODE", error: "Choose photo reading or local reading." }, 400);
  }
  try {
    const image = await readScanImage(request);
    return authJson(await recognizeMedicine(image, {
      vision: openRouterVisionProvider, ocr: tesseractOcrProvider, catalog: curatedMedicines,
    }, { mode, model: auth.user.visionModel }));
  } catch (error) {
    if (error instanceof ScanUploadError) return authJson({ code: error.code, error: error.message }, error.status);
    throw error;
  }
}
