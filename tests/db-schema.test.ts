import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("bootstraps Node-only Next and Tailwind with strict TypeScript", async () => {
  const { default: config } = await import("../next.config");
  expect(config.serverExternalPackages).toEqual(expect.arrayContaining([
    "@libsql/client", "libsql", "tesseract.js",
  ]));
  const readJson = (relativePath: string) =>
    JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
  expect(readJson("tsconfig.json").compilerOptions).toMatchObject({
    strict: true, paths: { "@/*": ["./src/*"] },
  });
  expect(readFileSync(new URL("../postcss.config.mjs", import.meta.url), "utf8"))
    .toContain("@tailwindcss/postcss");
});

it("validates database configuration, optional keys, and vision model selection", async () => {
  const { readEnv } = await import("@/lib/env");
  const { VISION_MODELS, resolveVisionModel } = await import("@/lib/openrouter/models");
  expect(readEnv({})).toMatchObject({
    DATABASE_URL: "file:local.db", OPENROUTER_VISION_MODEL: "google/gemini-2.5-flash",
  });
  expect(readEnv({ DATABASE_URL: ":memory:", OPENROUTER_API_KEY: " " }).OPENROUTER_API_KEY)
    .toBeUndefined();
  expect(() => readEnv({ DATABASE_URL: "https://db.example", DATABASE_AUTH_TOKEN: "secret" }))
    .toThrow("DATABASE_URL");
  expect(() => readEnv({ DATABASE_URL: "libsql://db.example" })).toThrow("DATABASE_AUTH_TOKEN");
  expect(readEnv({ DATABASE_URL: "libsql://db.example", DATABASE_AUTH_TOKEN: "fixture" }))
    .toMatchObject({ DATABASE_AUTH_TOKEN: "fixture" });
  expect(VISION_MODELS).toContain("openai/gpt-4o");
  expect(resolveVisionModel("openai/gpt-4o", "google/gemini-2.5-flash")).toBe("openai/gpt-4o");
  expect(resolveVisionModel("custom/model:free", "google/gemini-2.5-flash")).toBe("custom/model:free");
  expect(resolveVisionModel(null, "google/gemini-2.5-flash")).toBe("google/gemini-2.5-flash");
  expect(() => resolveVisionModel("bad model", "google/gemini-2.5-flash")).toThrow("model");
});
