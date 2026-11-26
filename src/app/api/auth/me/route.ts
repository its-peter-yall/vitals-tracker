import { authJson, requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return authJson({ user: auth.user });
}
