import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { saveConfirmedFood } from "@/lib/foods/resolver";
import { saveFoodSchema } from "@/lib/foods/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const parsed = saveFoodSchema.safeParse(await readJson(request));
    if (!parsed.success) return authJson({ error: "Review and confirm a valid food and nutrient profile." }, 400);
    const saved = await saveConfirmedFood(await getDb(), auth.user.id, parsed.data);
    return authJson({ food: saved.food }, saved.created ? 201 : 200);
  } catch {
    return authJson({ error: "Could not save the food. Try again." }, 500);
  }
}
