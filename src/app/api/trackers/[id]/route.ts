import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { patchTrackerSchema } from "@/lib/trackers/schemas";
import { deleteTracker, findTracker, updateTracker } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const missingTracker = () => authJson({ error: "Tracker not found." }, 404);

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const tracker = await findTracker(await getDb(), auth.user.id, (await params).id);
  return tracker ? authJson({ tracker }) : missingTracker();
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = patchTrackerSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the tracker name, nutrients, and targets." }, 400);
  const tracker = await updateTracker(await getDb(), auth.user.id, (await params).id, parsed.data);
  return tracker ? authJson({ tracker }) : missingTracker();
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const deleted = await deleteTracker(await getDb(), auth.user.id, (await params).id);
  return deleted ? authJson({ ok: true }) : missingTracker();
}
