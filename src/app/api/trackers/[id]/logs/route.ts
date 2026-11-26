import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { createLogSchema, dateFromRequest } from "@/lib/trackers/schemas";
import { createLog, InvalidSnapshotAmount, listLogs } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const date = dateFromRequest(request);
  if (!date.success) return authJson({ error: "Choose a valid local date." }, 400);
  const logs = await listLogs(await getDb(), auth.user.id, (await params).id, date.data);
  return logs ? authJson({ logs }) : authJson({ error: "Tracker not found." }, 404);
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = createLogSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the item, quantity, unit, and date." }, 400);
  try {
    const log = await createLog(await getDb(), auth.user.id, (await params).id, parsed.data);
    return log ? authJson({ log }, 201) : authJson({ error: "Tracker or item not found." }, 404);
  } catch (error) {
    if (error instanceof InvalidSnapshotAmount) return authJson({ error: "Check the quantity and nutrient amounts." }, 400);
    throw error;
  }
}
