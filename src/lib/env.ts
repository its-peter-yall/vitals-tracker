import "server-only";
import * as z from "zod";
import { DEFAULT_VISION_MODEL, modelIdSchema } from "./openrouter/models";

const optionalText = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || undefined : value,
  z.string().min(1).optional(),
);
const envSchema = z.object({
  DATABASE_URL: z.string().refine((value) =>
    value === ":memory:" || /^file:.+$/.test(value) ||
    (value.startsWith("libsql://") && URL.canParse(value) && !!new URL(value).hostname),
  ).default("file:local.db"),
  DATABASE_AUTH_TOKEN: optionalText,
  OPENROUTER_API_KEY: optionalText,
  OPENROUTER_VISION_MODEL: modelIdSchema.default(DEFAULT_VISION_MODEL),
  USDA_FDC_API_KEY: optionalText,
  NEXT_PUBLIC_APP_URL: optionalText.refine((value) =>
    value === undefined || (/^https?:\/\//.test(value) && URL.canParse(value)),
  ),
}).superRefine((env, ctx) => {
  if (env.DATABASE_URL.startsWith("libsql://") && !env.DATABASE_AUTH_TOKEN) {
    ctx.addIssue({ code: "custom", path: ["DATABASE_AUTH_TOKEN"], message: "Required for Turso" });
  }
});

export function readEnv(source: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${keys.join(", ")}`);
  }
  return parsed.data;
}
