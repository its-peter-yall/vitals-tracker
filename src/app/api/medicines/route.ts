import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { medicines } from "@/db/schema";
import { readJson } from "@/lib/auth/schemas";
import { authJson, requireUser } from "@/lib/auth/session";
import { medicineColumns, medicineCreateSchema } from "@/lib/medicines/schemas";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const db = await getDb();
  const [mine, curated] = await Promise.all([
    db.select(medicineColumns).from(medicines).where(eq(medicines.userId, auth.user.id))
      .orderBy(desc(medicines.createdAt), asc(medicines.id)),
    db.select(medicineColumns).from(medicines)
      .where(and(isNull(medicines.userId), eq(medicines.source, "curated")))
      .orderBy(asc(medicines.brandName), asc(medicines.id)),
  ]);
  return authJson({ medicines: mine, curated });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = medicineCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Check the medicine name, category, dose, and amounts." }, 400);
  const { nutrientsPerDose, ...fields } = parsed.data;
  const [medicine] = await (await getDb()).insert(medicines).values({
    ...fields, nutrientsPerDoseJson: nutrientsPerDose,
    userId: auth.user.id, createdAt: new Date().toISOString(),
  }).returning(medicineColumns);
  return authJson({ medicine }, 201);
}
