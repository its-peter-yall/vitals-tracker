import { logoutSchema, readJson } from "@/lib/auth/schemas";
import { authJson, revokeCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!logoutSchema.safeParse(await readJson(request)).success) {
    return authJson({ error: "Invalid sign-out request." }, 400);
  }
  try {
    await revokeCurrentSession();
    return authJson({ ok: true });
  } catch {
    return authJson({ error: "Could not sign you out. Try again." }, 500);
  }
}
