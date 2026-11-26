import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "vt_session";
const maxAge = 90 * 24 * 60 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export const publicUserColumns = {
  id: users.id, email: users.email, name: users.name, theme: users.theme, visionModel: users.visionModel,
};
export type AuthUser = Pick<typeof users.$inferSelect, keyof typeof publicUserColumns>;

export function makeSession(userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    row: {
      userId,
      tokenHash: tokenHash(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + maxAge * 1000).toISOString(),
    },
  };
}

function cookieOptions(lifetime: number) {
  return {
    httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: lifetime,
  };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(maxAge));
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length !== 43 || !tokenPattern.test(token)) return null;
  const [user] = await (await getDb()).select(publicUserColumns).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1);
  return user ?? null;
}

export function authJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

type UserGuard =
  | { ok: true; user: AuthUser }
  | { ok: false; response: Response };

export async function requireUser(): Promise<UserGuard> {
  const user = await getSessionUser();
  return user ? { ok: true, user } : { ok: false, response: authJson({ error: "Please sign in." }, 401) };
}
