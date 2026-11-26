import { getDb } from "@/db";
import { trackerAnalytics } from "@/lib/analytics/service";
import { authJson, requireUser } from "@/lib/auth/session";
import { analyticsQueryFromRequest } from "@/lib/trackers/schemas";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = analyticsQueryFromRequest(request);
  if (!parsed.success) return authJson({ error: "Choose a valid range and local end date." }, 400);
  const analytics = await trackerAnalytics(await getDb(), auth.user.id, (await params).id, parsed.data);
  return analytics ? authJson({ analytics }) : authJson({ error: "Tracker not found." }, 404);
}
