import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_AUTH_TOKEN", undefined);
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("OPENROUTER_VISION_MODEL", undefined);
  vi.stubEnv("USDA_FDC_API_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
