import "server-only";
import * as z from "zod";

export const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash";
export const VISION_MODELS = [
  DEFAULT_VISION_MODEL,
  "google/gemini-3-flash-preview",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
  "openai/gpt-4o",
  "openai/gpt-4.1-mini",
  "qwen/qwen3-vl-235b-a22b-instruct",
] as const;

export const modelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:/-]{0,127}$/i);

export function resolveVisionModel(userModel: string | null | undefined, defaultModel: string) {
  const result = modelIdSchema.safeParse(userModel ?? defaultModel);
  if (!result.success) throw new Error("Invalid OpenRouter model ID.");
  return result.data;
}
