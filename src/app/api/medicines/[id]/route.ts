import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { medicines } from "@/db/schema";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { medicineColumns, medicineIdSchema, medicinePatchSchema } from "@/lib/medicines/schemas";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const notFound = () => authJson({ error: "Medicine not found." }, 404);
const owned = (id: string, userId: string) => and(eq(medicines.id, id), eq(medicines.userId, userId));

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const id = medicineIdSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const parsed = medicinePatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Enter a valid medicine change." }, 400);
  const { nutrientsPerDose, ...fields } = parsed.data;
  const [medicine] = await (await getDb()).update(medicines).set({
    ...fields, ...(nutrientsPerDose === undefined ? {} : { nutrientsPerDoseJson: nutrientsPerDose }),
  }).where(owned(id.data, auth.user.id)).returning(medicineColumns);
  return medicine ? authJson({ medicine }) : notFound();
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const id = medicineIdSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const [deleted] = await (await getDb()).delete(medicines)
    .where(owned(id.data, auth.user.id)).returning({ id: medicines.id });
  return deleted ? authJson({ ok: true }) : notFound();
}
