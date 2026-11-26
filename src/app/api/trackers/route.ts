import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { createTrackerSchema } from "@/lib/trackers/schemas";
import { createTracker, listTrackers } from "@/lib/trackers/service";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return authJson({ trackers: await listTrackers(await getDb(), auth.user.id) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = createTrackerSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the tracker name, nutrients, and targets." }, 400);
  const tracker = await createTracker(await getDb(), auth.user.id, parsed.data);
  return authJson({ tracker }, 201);
}
