import "server-only";
import { Buffer } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import * as z from "zod";
import { readEnv } from "@/lib/env";
import { resolveVisionModel } from "./models";

const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const errors = {
  NOT_CONFIGURED: "AI is not set up. You can continue manually.",
  BAD_REQUEST: "AI could not read this request. Try again or continue manually.",
  AUTH: "AI access could not be verified.",
  PAYMENT: "AI credits are unavailable. You can continue manually.",
  FORBIDDEN: "AI could not process this request. You can continue manually.",
  TIMEOUT: "AI is taking too long. Try again or continue manually.",
  RATE_LIMIT: "AI is busy. Try again shortly or continue manually.",
  PROVIDER: "AI is temporarily unavailable. You can continue manually.",
  INVALID_OUTPUT: "AI did not return a usable result. Try again or continue manually.",
} as const;

export type OpenRouterErrorCode = keyof typeof errors;

export class OpenRouterError extends Error {
  constructor(public readonly code: OpenRouterErrorCode) {
    super(errors[code]);
    this.name = "OpenRouterError";
  }
}

export type CompleteJsonInput<T> = {
  model?: string | null;
  system?: string;
  prompt: string;
  image?: { mime: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array };
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  output: z.ZodType<T>;
};

const errorShape = z.object({ code: z.union([z.string(), z.number()]).optional(), message: z.string().optional() });
const envelope = z.object({
  error: errorShape.nullish(),
  choices: z.array(z.object({
    error: errorShape.nullish(),
    message: z.object({ content: z.string().nullish() }).nullish(),
  })).optional(),
});

function statusCode(status: number): OpenRouterErrorCode {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "AUTH";
    case 402: return "PAYMENT";
    case 403: return "FORBIDDEN";
    case 408:
    case 504: return "TIMEOUT";
    case 429: return "RATE_LIMIT";
    default: return "PROVIDER";
  }
}

function retryDelay(header: string | null) {
  if (!header?.trim()) return undefined;
  const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms <= 5_000 ? Math.max(ms, 0) : undefined;
}

export async function completeJson<T>(input: CompleteJsonInput<T>): Promise<T> {
  let env: ReturnType<typeof readEnv>;
  try { env = readEnv(); } catch { throw new OpenRouterError("NOT_CONFIGURED"); }
  if (!env.OPENROUTER_API_KEY) throw new OpenRouterError("NOT_CONFIGURED");
  let model: string;
  try { model = resolveVisionModel(input.model, env.OPENROUTER_VISION_MODEL); }
  catch { throw new OpenRouterError("BAD_REQUEST"); }
  const messages = [
    ...(input.system ? [{ role: "system", content: input.system }] : []),
    { role: "user", content: input.image ? [
      { type: "text", text: input.prompt },
      { type: "image_url", image_url: {
        url: `data:${input.image.mime};base64,${Buffer.from(input.image.bytes).toString("base64")}`,
        detail: "auto",
      } },
    ] : input.prompt },
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let format: "json_schema" | "json_object" = "json_schema";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Vitals Tracker",
          ...(env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": env.NEXT_PUBLIC_APP_URL } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
        body: JSON.stringify({
          model, messages, temperature: 0,
          response_format: format === "json_schema" ? {
            type: format, json_schema: { name: input.schemaName, strict: true, schema: input.jsonSchema },
          } : { type: format },
        }),
      });
      const parsed = envelope.safeParse(await response.json().catch(() => undefined));
      controller.signal.throwIfAborted();
      const choice = parsed.data?.choices?.[0];
      const replyError = parsed.data?.error ?? choice?.error;
      if (!response.ok || replyError) {
        const status = response.ok ? Number(replyError?.code) : response.status;
        const message = replyError?.message ?? "";
        if (attempt === 0 && [400, 422].includes(status) &&
            /json_schema|response_format|structured outputs?/i.test(message) &&
            /unsupported|not support/i.test(message)) {
          format = "json_object";
          continue;
        }
        const wait = attempt === 0 && [429, 503].includes(response.status)
          ? retryDelay(response.headers.get("Retry-After")) : undefined;
        if (wait !== undefined) {
          if (wait > 0) await delay(wait, undefined, { signal: controller.signal });
          continue;
        }
        throw new OpenRouterError(statusCode(status));
      }
      if (!choice?.message?.content) throw new OpenRouterError("INVALID_OUTPUT");
      const content = choice.message.content.trim()
        .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
      let raw: unknown;
      try { raw = JSON.parse(content); } catch { throw new OpenRouterError("INVALID_OUTPUT"); }
      const result = input.output.safeParse(raw);
      if (!result.success) throw new OpenRouterError("INVALID_OUTPUT");
      return result.data;
    }
    throw new OpenRouterError("PROVIDER");
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new OpenRouterError("TIMEOUT");
    }
    if (error instanceof OpenRouterError) throw error;
    throw new OpenRouterError("PROVIDER");
  } finally {
    clearTimeout(timer);
  }
}
