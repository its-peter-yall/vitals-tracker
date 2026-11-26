import "server-only";
import { Buffer } from "node:buffer";
import type { Worker } from "tesseract.js";
import type { OcrProvider } from "./types";

class OcrUnavailableError extends Error {
  readonly code = "OCR_UNAVAILABLE";
  constructor() { super("Local photo reading is unavailable."); }
}

export function createTesseractOcrProvider(idleMs = 5 * 60_000, deadlineMs = 20_000): OcrProvider {
  let worker: Worker | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let startupDisabled = false;

  const terminate = (target: Worker) => { void target.terminate().catch(() => {}); };
  function release() {
    const target = worker;
    worker = undefined;
    if (target) terminate(target);
  }

  return {
    async readText(image) {
      if (busy || startupDisabled) throw new OcrUnavailableError();
      busy = true;
      clearTimeout(idleTimer);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new OcrUnavailableError()), deadlineMs);
      });
      try {
        if (!worker) {
          let abandoned = false;
          let initializing = true;
          let reportInitError!: () => void;
          const initError = new Promise<never>((_, reject) => {
            reportInitError = () => reject(new OcrUnavailableError());
          });
          const starting = (async () => {
            const { default: tess } = await import("tesseract.js");
            if (abandoned) throw new OcrUnavailableError();
            const ready = await tess.createWorker("eng", tess.OEM.LSTM_ONLY, {
              cacheMethod: "none",
              errorHandler: () => { if (initializing) reportInitError(); },
            });
            if (abandoned) {
              terminate(ready);
              throw new OcrUnavailableError();
            }
            return ready;
          })();
          try {
            worker = await Promise.race([starting, deadline, initError]);
          } catch (error) {
            abandoned = true;
            // Some v7 startup failures do not yield a worker handle. Fail closed
            // for this process rather than repeatedly starting orphaned workers.
            startupDisabled = true;
            throw error;
          } finally {
            initializing = false;
          }
        }
        const result = await Promise.race([worker.recognize(Buffer.from(image.bytes)), deadline]);
        return result.data.text;
      } catch {
        release();
        throw new OcrUnavailableError();
      } finally {
        clearTimeout(timer);
        busy = false;
        if (worker) {
          idleTimer = setTimeout(release, idleMs);
          idleTimer.unref();
        }
      }
    },
  };
}

export const tesseractOcrProvider = createTesseractOcrProvider();
