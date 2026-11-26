import { getDb } from "@/db";
import { authJson, requireUser } from "@/lib/auth/session";
import { dateFromRequest } from "@/lib/trackers/schemas";
import { dailySummary } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const date = dateFromRequest(request);
  if (!date.success) return authJson({ error: "Choose a valid local date." }, 400);
  const summary = await dailySummary(await getDb(), auth.user.id, (await params).id, date.data);
  return summary ? authJson(summary) : authJson({ error: "Tracker not found." }, 404);
}
