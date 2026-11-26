import { getDb } from "@/db";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { patchLogSchema } from "@/lib/trackers/schemas";
import { deleteLog, InvalidSnapshotAmount, updateLogQuantity } from "@/lib/trackers/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; logId: string }> };
const missingLog = () => authJson({ error: "Log not found." }, 404);

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = patchLogSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Enter a valid quantity." }, 400);
  const { id, logId } = await params;
  try {
    const log = await updateLogQuantity(await getDb(), auth.user.id, id, logId, parsed.data.quantity);
    return log ? authJson({ log }) : missingLog();
  } catch (error) {
    if (error instanceof InvalidSnapshotAmount) return authJson({ error: "Check the quantity and nutrient amounts." }, 400);
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, logId } = await params;
  return await deleteLog(await getDb(), auth.user.id, id, logId) ? authJson({ ok: true }) : missingLog();
}
