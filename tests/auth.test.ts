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

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`https://app.example.test${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

const credentials = { email: "care@example.test", password: "daily care notes" };
const registration = { ...credentials, name: "Care" };

it("signs up with normalized email, stores only hashes, and rejects duplicate email", async () => {
  const { POST } = await import("@/app/api/auth/signup/route");
  const path = "/api/auth/signup";
  const response = await POST(jsonRequest(path, { ...registration, email: " Care@Example.Test ", name: " Care " }));
  expect(response.status).toBe(201);
  const db = fixture!.db;
  const [user] = await db.select().from(users);
  const [session] = await db.select().from(sessions);
  expect(await response.json()).toEqual({
    user: { id: user.id, email: credentials.email, name: "Care", theme: "system", visionModel: null },
  });
  expect(user.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  expect(session).toMatchObject({ userId: user.id, tokenHash: digest(jar.get(expectedCookie)!) });
  expect((await POST(jsonRequest(path, registration))).status).toBe(409);
  expect(await db.select().from(users)).toHaveLength(1);
  expect(await db.select().from(sessions)).toHaveLength(1);
  expect(setCookie).toHaveBeenCalledOnce();
});

it("rejects invalid signup JSON, unexpected fields, short passwords, and form media types", async () => {
  const { POST } = await import("@/app/api/auth/signup/route");
  const path = "/api/auth/signup";
  for (const body of [
    { ...registration, email: "not an email" },
    { ...registration, name: "" },
    { ...registration, password: "short" },
    { ...registration, theme: "dark" },
  ]) {
    expect((await POST(jsonRequest(path, body))).status).toBe(400);
  }
  const url = `https://app.example.test${path}`;
  for (const [type, body] of [
    ["application/json", "{"],
    ["text/plain", JSON.stringify(registration)],
  ]) {
    expect((await POST(new Request(url, { method: "POST", headers: { "Content-Type": type }, body }))).status).toBe(400);
  }
  expect(await fixture!.db.select().from(users)).toEqual([]);
  expect(setCookie).not.toHaveBeenCalled();
});

it("rolls back signup if the session insert fails", async () => {
  const { POST } = await import("@/app/api/auth/signup/route");
  await fixture!.client.execute(`
    CREATE TRIGGER refuse_session BEFORE INSERT ON sessions
    BEGIN SELECT RAISE(ABORT, 'session fixture failure'); END
  `);
  const response = await POST(jsonRequest("/api/auth/signup", registration));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not create your account. Try again." });
  expect(await fixture!.db.select().from(users)).toEqual([]);
  expect(setCookie).not.toHaveBeenCalled();
});

async function signUp(body = registration) {
  const { POST } = await import("@/app/api/auth/signup/route");
  const response = await POST(jsonRequest("/api/auth/signup", body));
  expect(response.status).toBe(201);
  const { user } = await response.json();
  const token = jar.get(expectedCookie);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return { user, token: token! };
}

it("logs in with a fresh token and returns the same denial for wrong and unknown credentials", async () => {
  const { POST } = await import("@/app/api/auth/login/route");
  const { GET } = await import("@/app/api/auth/me/route");
  const first = await signUp();
  jar.clear();
  setCookie.mockClear();
  const path = "/api/auth/login";
  for (const body of [
    { ...credentials, password: "wrong password" },
    { ...credentials, email: "unknown@example.test" },
  ]) {
    const denied = await POST(jsonRequest(path, body));
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "Email or password is incorrect." });
  }
  expect((await POST(jsonRequest(path, { ...credentials, userId: first.user.id }))).status).toBe(400);
  expect(setCookie).not.toHaveBeenCalled();
  const response = await POST(jsonRequest(path, { ...credentials, email: "CARE@example.test" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: first.user });
  expect(jar.get(expectedCookie)).not.toBe(first.token);
  expect(await (await GET()).json()).toEqual({ user: first.user });
});

it("logs out idempotently, revokes the presented token, and leaves other sessions alone", async () => {
  const { POST: login } = await import("@/app/api/auth/login/route");
  const { POST: logout } = await import("@/app/api/auth/logout/route");
  const { GET } = await import("@/app/api/auth/me/route");
  const first = await signUp();
  expect((await login(jsonRequest("/api/auth/login", credentials))).status).toBe(200);
  const last = jar.get(expectedCookie)!;
  expect(last).not.toBe(first.token);
  vi.stubEnv("NODE_ENV", "production");
  const path = "/api/auth/logout";
  expect((await logout(jsonRequest(path, { token: first.token }))).status).toBe(400);
  const response = await logout(jsonRequest(path, {}));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(setCookie).toHaveBeenLastCalledWith(expectedCookie, "", {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0,
  });
  expect(jar.has(expectedCookie)).toBe(false);
  const revoked = await fixture!.db.select().from(sessions).where(eq(sessions.tokenHash, digest(last)));
  expect(revoked).toEqual([]);
  expect((await logout(jsonRequest(path, {}))).status).toBe(200);
  jar.set(expectedCookie, last);
  expect((await GET()).status).toBe(401);
  jar.set(expectedCookie, first.token);
  expect((await GET()).status).toBe(200);
});
