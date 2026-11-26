import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { readJson, settingsPatchSchema } from "@/lib/auth/schemas";
import { authJson, requireUser, type AuthUser } from "@/lib/auth/session";
import { readEnv } from "@/lib/env";
import { VISION_MODELS } from "@/lib/openrouter/models";

export const runtime = "nodejs";

function settingsResponse(
  { theme, visionModel }: Pick<AuthUser, "theme" | "visionModel">,
  defaultVisionModel: string,
) {
  return authJson({ settings: { theme, visionModel }, visionModels: VISION_MODELS, defaultVisionModel });
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return settingsResponse(auth.user, readEnv().OPENROUTER_VISION_MODEL);
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = settingsPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return authJson({ error: "Choose an appearance or enter a valid photo-reading model ID." }, 400);
  }
  const defaultVisionModel = readEnv().OPENROUTER_VISION_MODEL;
  const [settings] = await (await getDb()).update(users).set(parsed.data)
    .where(eq(users.id, auth.user.id)).returning({ theme: users.theme, visionModel: users.visionModel });
  return settings ? settingsResponse(settings, defaultVisionModel) : authJson({ error: "Please sign in." }, 401);
}
