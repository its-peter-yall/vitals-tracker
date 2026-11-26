import { getDb } from "@/db";
import { authJson, requireUser } from "@/lib/auth/session";
import { searchFoods } from "@/lib/foods/resolver";
import { searchQuerySchema } from "@/lib/foods/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    const parsed = searchQuerySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
    if (!parsed.success) return authJson({ error: "Enter a food name of up to 100 characters." }, 400);
    const foods = await searchFoods(await getDb(), auth.user.id, parsed.data);
    return authJson({ foods });
  } catch {
    return authJson({ error: "Could not search foods. Try again." }, 500);
  }
}
