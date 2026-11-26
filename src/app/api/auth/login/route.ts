import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema, readJson } from "@/lib/auth/schemas";
import { authJson, makeSession, publicUserColumns, setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

// Well-formed dummy record forces a real KDF run for unknown emails.
const dummyHash = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Enter your email and password." }, 400);
  try {
    const db = await getDb();
    const [account] = await db.select({ ...publicUserColumns, passwordHash: users.passwordHash })
      .from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const matches = await verifyPassword(parsed.data.password, account?.passwordHash ?? dummyHash);
    if (!account || !matches) return authJson({ error: "Email or password is incorrect." }, 401);
    const { id, email, name, theme, visionModel } = account;
    const { token, row } = makeSession(id);
    await db.insert(sessions).values(row);
    await setSessionCookie(token);
    return authJson({ user: { id, email, name, theme, visionModel } });
  } catch {
    return authJson({ error: "Could not sign you in. Try again." }, 500);
  }
}
