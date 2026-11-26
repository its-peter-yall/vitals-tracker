import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { readJson, signupSchema } from "@/lib/auth/schemas";
import { authJson, makeSession, publicUserColumns, setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await readJson(request));
  if (!parsed.success) return authJson({ error: "Enter your name, email, and a password of 12–128 characters." }, 400);
  const { email, name, password } = parsed.data;
  try {
    const passwordHash = await hashPassword(password);
    const now = new Date();
    const result = await (await getDb()).transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email, name, passwordHash, createdAt: now.toISOString() })
        .onConflictDoNothing({ target: users.email }).returning(publicUserColumns);
      if (!user) return null;
      const { token, row } = makeSession(user.id, now);
      await tx.insert(sessions).values(row);
      return { user, token };
    });
    if (!result) return authJson({ error: "That email already has an account. Sign in instead." }, 409);
    await setSessionCookie(result.token);
    return authJson({ user: result.user }, 201);
  } catch {
    return authJson({ error: "Could not create your account. Try again." }, 500);
  }
}
