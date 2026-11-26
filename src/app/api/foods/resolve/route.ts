import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { resolveFood } from "@/lib/foods/resolver";
import { resolveRequestSchema } from "@/lib/foods/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const parsed = resolveRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return authJson({ error: "Enter a food name of up to 100 characters." }, 400);
    const result = await resolveFood(await getDb(), auth.user.id, parsed.data.query);
    if (result.kind === "unavailable") return authJson({ error: result.error }, result.status);
    return authJson(result);
  } catch {
    return authJson({ error: "Could not look up this food. You can enter it manually." }, 500);
  }
}
