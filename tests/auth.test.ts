import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";

vi.mock("@/db", async (original) => {
  const actual = await original<typeof import("@/db")>();
  return { ...actual, getDb: vi.fn() };
});

const jar = new Map<string, string>();
const setCookie = vi.fn((name: string, value: string, options: { maxAge: number }) => {
  if (options.maxAge === 0) jar.delete(name);
  else jar.set(name, value);
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: setCookie,
  }),
}));

const expectedCookie = "vt_session";
const ninetyDays = 90 * 24 * 60 * 60;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
let fixture: Awaited<ReturnType<typeof createTestDb>> | undefined;

beforeEach(async () => {
  jar.clear();
  setCookie.mockClear();
  fixture = await createTestDb();
  vi.mocked(getDb).mockResolvedValue(fixture.db);
});

afterEach(() => {
  fixture?.client.close();
  fixture = undefined;
  vi.mocked(getDb).mockReset();
});

it("salts scrypt password hashes, preserves password whitespace, and rejects invalid hashes", async () => {
  const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
  const password = " Care notes 2026 ";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  expect(first).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  expect(second).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  expect(first.split(":")[0]).not.toBe(second.split(":")[0]);
  await expect(verifyPassword(password, first)).resolves.toBe(true);
  await expect(verifyPassword(password.trim(), first)).resolves.toBe(false);
  await expect(verifyPassword(password, first + ":extra")).resolves.toBe(false);
  await expect(verifyPassword(password, first.slice(0, -1))).resolves.toBe(false);
  await expect(verifyPassword(password, "x".repeat(32) + ":" + "0".repeat(128))).resolves.toBe(false);
});

it("resolves a stored session in a later request and fails closed at its exact expiry", async () => {
  const { makeSession, requireUser, setSessionCookie } = await import("@/lib/auth/session");
  const { GET } = await import("@/app/api/auth/me/route");
  const now = new Date("2026-11-26T08:00:00.000Z");
  const db = fixture!.db;
  const [row] = await db.insert(users).values({
    email: "care@example.test", name: "Care", passwordHash: "not-for-output", createdAt: now.toISOString(),
  }).returning();
  const session = makeSession(row.id, now);
  await db.insert(sessions).values(session.row);
  expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(session.row.tokenHash).toBe(digest(session.token));
  expect(session.row.tokenHash).not.toBe(session.token);
  expect(Date.parse(session.row.expiresAt) - now.getTime()).toBe(ninetyDays * 1000);
  vi.stubEnv("NODE_ENV", "production");
  await setSessionCookie(session.token);
  expect(setCookie).toHaveBeenLastCalledWith(expectedCookie, session.token, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: ninetyDays,
  });
  vi.setSystemTime(new Date(Date.parse(session.row.expiresAt) - 1));
  jar.clear();
  jar.set(expectedCookie, session.token);
  const expectedUser = {
    id: row.id, email: row.email, name: row.name, theme: "system", visionModel: null,
  };
  await expect(requireUser()).resolves.toEqual({ ok: true, user: expectedUser });
  const me = await GET();
  expect(me.status).toBe(200);
  expect(me.headers.get("Cache-Control")).toBe("no-store");
  expect(await me.json()).toEqual({ user: expectedUser });
  vi.setSystemTime(new Date(session.row.expiresAt));
  expect((await GET()).status).toBe(401);
});

it("returns uncached 401 for absent, malformed, or unknown session cookies", async () => {
  const { GET } = await import("@/app/api/auth/me/route");
  for (const token of [undefined, "bad format", "a".repeat(43)]) {
    jar.clear();
    if (token) jar.set(expectedCookie, token);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Please sign in." });
  }
});
