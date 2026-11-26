# P2 — Lightweight Auth, Persistent Sessions & User Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people create an account, stay signed in for 90 days, and safely manage their own appearance and medicine photo-reading settings.

**Architecture:** Node-only Route Handlers validate JSON and turn a browser cookie into a database-backed identity; only a digest of the random session token is stored in libSQL. Keep preferences on the authenticated user row, and apply the saved theme through P1's existing browser theme provider without changing the shared layout. Serve the model allow-list and default through the authenticated Settings API, not by importing server code into a client page.

**Tech Stack:** Node ≥24.15 (`node:crypto`), Next.js 16.4.6 App Router, React 19.3.1, TypeScript, Tailwind v4, Drizzle 0.45.4 + libSQL 0.18.0/Turso, Zod 4, Vitest 5.

---

## Ownership and contracts

| Path | Responsibility |
| --- | --- |
| `src/lib/auth/password.ts` | Async scrypt codec and fixed-length comparison |
| `src/lib/auth/session.ts` | Token/expiry, cookie transport, safe user projection, guard and uncached auth responses |
| `src/lib/auth/schemas.ts` | Strict JSON contracts for credential and Settings writes |
| `src/app/api/auth/signup/route.ts` | Create user + first session atomically |
| `src/app/api/auth/login/route.ts` | Verify password and issue a fresh session |
| `src/app/api/auth/logout/route.ts` | Revoke only the presented session and clear the cookie |
| `src/app/api/auth/me/route.ts` | Read the current safe user |
| `src/app/api/settings/route.ts` | Read/patch the current user's preferences |
| `src/app/(auth)/login/page.tsx` | Sign-in form |
| `src/app/(auth)/signup/page.tsx` | Account form and onboarding scope notice |
| `src/app/settings/page.tsx` | Preferences, scope notice, and sign-out |
| `tests/auth.test.ts` | Real crypto/libSQL, handler, and form render tests |

- Work from the repo root in PowerShell 5.1. Run commands separately; stop on errors unless expecting RED. Stage only each task's paths; serialize commits with the orchestrator. If already dispatched as the P2 worker, execute directly in that session. Do not change P1 files, depend on a migration journal, install dependencies, or create a root page. The P1 `/` fallback will be replaced by P7's tracker home, which owns discovery links to `/login` and `/settings`.
- P1 exports `await getDb()` (`Db`), `await createDb(url, authToken?)` (`{client, db}`), and `await createTestDb()` via `@/db/test-utils` (fresh migrated `:memory:` client; close it). `@/db/schema` exports `users` and `sessions`: IDs have UUID defaults; `createdAt`/`expiresAt` are explicit ISO strings; `users.email` and `sessions.tokenHash` are unique; `users.theme` defaults to `"system"`, `users.visionModel` to `null`. P1 Vitest runs `.ts` in Node, stubs `server-only`, and supplies safe env defaults. Mock only the runtime DB accessor and Next's cookie store for handler tests; use actual crypto and database queries.
- All P2 routes declare `runtime = "nodejs"`. Read `await cookies()`; set cookies only from handlers, after successful DB work. `vt_session` is host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production (P1 research convention permits local HTTP in development). Expiry is fixed, not sliding. Never log or return credential or session secrets; only the cookie carries the raw token. Public HTTPS deployment should rate-limit signup/login at the ingress; no process-local limiter or new infrastructure in P2.
- **Downstream guard contract (P4–P7/P9):** `const auth = await requireUser(); if (!auth.ok) return auth.response;` yields an uncached JSON `401` for missing/invalid/expired sessions. `auth.user.id` is the only tenant ID to use in queries; `auth.user.visionModel` is a nullable override. Server pages may use `await getSessionUser()` and redirect if it returns `null`. Test harnesses can mock `getDb()` or `requireUser()` with this same shape. The guard is not an ownership filter by itself.
- Signup/login success: `{ user: { id, email, name, theme, visionModel } }` (`201`/`200`); `GET /api/auth/me` returns the same envelope (`200`). Duplicate normalized email is `409`; incorrect credentials are always the same `401`. `POST /api/auth/logout` accepts JSON `{}` and returns `200 { ok: true }` even when already signed out. Errors use `{ error: string }`. All writes require `Content-Type: application/json` (optional charset), with no cross-origin CORS grants; ordinary cross-origin browser forms cannot send this media type and fetch would require preflight.
- `GET` and `PATCH /api/settings` return `{ settings: { theme, visionModel }, visionModels, defaultVisionModel }`; PATCH accepts one or both settings, and `visionModel: null` resets the override. The server uses P1's `VISION_MODELS`, `modelIdSchema`, and `readEnv().OPENROUTER_VISION_MODEL`. A custom ID must match `/^[a-z0-9][a-z0-9._:/-]{0,127}$/i` after trim; saving does not assert that a provider serves that model or run a scan. P5 can pass the nullable override as `model` to P1's `completeJson()`, which already uses the env default when no override is set.
- **Theme boundary (P7 handoff):** the DB is authoritative for account settings; login/signup and Settings load/save apply it via P1 `useTheme().setMode()`. P1's root prepaint and header toggle remain local-device behavior. For an authenticated tracker landing on a device without a matching local preference, P7 should reconcile the DB preference through the same hook, unless the product changes the header's persistence behavior explicitly.
- **UI direction:** make the pages feel like a short care note, not a portal: narrow, left-aligned forms, one teal primary action, and a visible warm-margin *About this tracker* note on onboarding and Settings. Preserve P1's 18px body, theme palette, focus outline, and ≥48px targets. Keep optional photo-reading controls below Appearance; no extra motion or new design dependencies.

## Task 1: Hash and verify passwords

**Files:** Create `src/lib/auth/password.ts` and `tests/auth.test.ts`.

- [ ] **Write the RED test** in `tests/auth.test.ts`:

```ts
import { expect, it } from "vitest";

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
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "salts scrypt"` → missing `@/lib/auth/password`.
- [ ] **Implement** `src/lib/auth/password.ts`:

```ts
import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const encoded = /^([a-f0-9]{32}):([a-f0-9]{128})$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = encoded.exec(stored);
  if (stored.length !== 161 || !parts) return false;
  const candidate = await derive(password, Buffer.from(parts[1], "hex"));
  return timingSafeEqual(candidate, Buffer.from(parts[2], "hex"));
}
```

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts -t "salts scrypt"` → one pass. Inspect that the only valid-hash comparison is `timingSafeEqual` of 64-byte buffers; no flaky timing benchmark.
- [ ] **Commit:**

```powershell
git add -- src/lib/auth/password.ts tests/auth.test.ts
git commit -m "feat(auth): hash passwords with asynchronous salted scrypt"
```

## Task 2: Resolve persistent sessions, reject invalid/expired sessions, and protect `/me`

**Files:** Create `src/lib/auth/session.ts`, `src/app/api/auth/me/route.ts`; modify `tests/auth.test.ts`.

- [ ] **Write RED tests.** Replace the single Vitest import in `tests/auth.test.ts` with the following imports and harness, leaving Task 1's test below it:

```ts
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
```

Append these tests:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "stored session|unknown session"` → missing auth session module or `/me` route, not missing migrations.
- [ ] **Implement** `src/lib/auth/session.ts`:

```ts
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
```

`src/app/api/auth/me/route.ts`:

```ts
import { authJson, requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return authJson({ user: auth.user });
}
```

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts` → three tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/auth/session.ts src/app/api/auth/me/route.ts tests/auth.test.ts
git commit -m "feat(auth): resolve persistent sessions and protect current-user API"
```

## Task 3: Validate and sign up atomically

**Files:** Create `src/lib/auth/schemas.ts` and `src/app/api/auth/signup/route.ts`; modify `tests/auth.test.ts`.

- [ ] **Write RED tests.** Append to `tests/auth.test.ts`:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "signs up|invalid signup|rolls back signup"` → missing signup handler.
- [ ] **Implement** `src/lib/auth/schemas.ts`:

```ts
import "server-only";
import * as z from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const signupSchema = z.strictObject({
  email, name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128),
});

export async function readJson(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return undefined;
  return request.json().catch(() => undefined);
}
```

`src/app/api/auth/signup/route.ts`:

```ts
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
```

Hash outside the transaction; rely on P1's unique index and targeted `ON CONFLICT`, not a pre-check or a string search through database errors. The transaction cannot commit a new user without its first session. No cookie is emitted until commit.

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts` → six tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/auth/schemas.ts src/app/api/auth/signup/route.ts tests/auth.test.ts
git commit -m "feat(auth): register accounts and first sessions atomically"
```

## Task 4: Sign in, sign out, and prevent replay after logout

**Files:** Create `src/app/api/auth/login/route.ts` and `src/app/api/auth/logout/route.ts`; modify `src/lib/auth/schemas.ts`, `src/lib/auth/session.ts`, `tests/auth.test.ts`.

- [ ] **Write RED tests.** Append to `tests/auth.test.ts`:

```ts
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
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "logs in|logs out"` → missing login/logout handlers.
- [ ] **Implement credential schemas and revocation.** In `src/lib/auth/schemas.ts`, add:

```ts
export const loginSchema = z.strictObject({
  email, password: z.string().min(1).max(128),
});
export const logoutSchema = z.strictObject({});
```

In `src/lib/auth/session.ts`, insert the following before `getSessionUser()`, and replace its first two lines (`const token = …` and its validation) with `const token = await readSessionToken(); if (!token) return null;` on separate lines.

```ts
async function readSessionToken() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token && token.length === 43 && tokenPattern.test(token) ? token : null;
}

export async function revokeCurrentSession() {
  const token = await readSessionToken();
  if (token) await (await getDb()).delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(0));
}
```

- [ ] **Implement** `src/app/api/auth/login/route.ts`:

```ts
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
```

`src/app/api/auth/logout/route.ts`:

```ts
import { logoutSchema, readJson } from "@/lib/auth/schemas";
import { authJson, revokeCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!logoutSchema.safeParse(await readJson(request)).success) {
    return authJson({ error: "Invalid sign-out request." }, 400);
  }
  try {
    await revokeCurrentSession();
    return authJson({ ok: true });
  } catch {
    return authJson({ error: "Could not sign you out. Try again." }, 500);
  }
}
```

Successful login always mints a fresh token; it never accepts a caller-provided token or extends one. Logout deletes by digest of the presented credential, not by a caller-provided user/session ID. Separate sessions remain valid until their own logout or expiry.

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts` → eight tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/auth/schemas.ts src/lib/auth/session.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts tests/auth.test.ts
git commit -m "feat(auth): sign in and revoke the current session on logout"
```

## Task 5: Persist tenant-isolated settings

**Files:** Create `src/app/api/settings/route.ts`; modify `src/lib/auth/schemas.ts`, `tests/auth.test.ts`.

- [ ] **Write RED tests.** Append to `tests/auth.test.ts`:

```ts
it("rejects unauthenticated settings reads and writes before accepting input", async () => {
  const { GET, PATCH } = await import("@/app/api/settings/route");
  expect((await GET()).status).toBe(401);
  expect((await PATCH(jsonRequest("/api/settings", { theme: "dark" }, "PATCH"))).status).toBe(401);
});

it("updates only the authenticated user's settings and accepts presets, custom IDs, and reset", async () => {
  const { GET, PATCH } = await import("@/app/api/settings/route");
  const { VISION_MODELS } = await import("@/lib/openrouter/models");
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key-not-for-output");
  vi.stubEnv("OPENROUTER_VISION_MODEL", "custom/deployment-default");
  const a = await signUp();
  const b = await signUp({ ...registration, email: "second@example.test" });
  const patch = (body: unknown) => PATCH(jsonRequest("/api/settings", body, "PATCH"));
  expect((await patch({ theme: "light", userId: a.user.id })).status).toBe(400);
  expect((await patch({})).status).toBe(400);
  expect((await patch({ theme: "sepia" })).status).toBe(400);
  expect((await patch({ visionModel: "bad model" })).status).toBe(400);
  expect((await patch({ visionModel: "x".repeat(129) })).status).toBe(400);
  const preset = await patch({ theme: "dark", visionModel: "openai/gpt-4o" });
  expect(preset.status).toBe(200);
  expect(preset.headers.get("Cache-Control")).toBe("no-store");
  expect(await preset.json()).toEqual({
    settings: { theme: "dark", visionModel: "openai/gpt-4o" },
    visionModels: [...VISION_MODELS], defaultVisionModel: "custom/deployment-default",
  });
  const custom = await patch({ visionModel: " custom/vision:free " });
  expect(custom.status).toBe(200);
  expect(await (await GET()).json()).toMatchObject({ settings: { theme: "dark", visionModel: "custom/vision:free" } });
  jar.set(expectedCookie, a.token);
  expect(await (await GET()).json()).toMatchObject({ settings: { theme: "system", visionModel: null } });
  jar.set(expectedCookie, b.token);
  const reset = await patch({ visionModel: null });
  expect(reset.status).toBe(200);
  expect(await reset.json()).toMatchObject({ settings: { theme: "dark", visionModel: null } });
  expect(await fixture!.db.select({ theme: users.theme, visionModel: users.visionModel })
    .from(users).where(eq(users.id, b.user.id))).toEqual([{ theme: "dark", visionModel: null }]);
});
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "settings reads|user's settings"` → missing Settings handler.
- [ ] **Implement the schema.** Add `import { modelIdSchema } from "@/lib/openrouter/models";` to `src/lib/auth/schemas.ts`, then add:

```ts
export const settingsPatchSchema = z.strictObject({
  theme: z.enum(["light", "dark", "system"]).optional(),
  visionModel: z.string().trim().pipe(modelIdSchema).nullable().optional(),
}).refine((settings) => settings.theme !== undefined || settings.visionModel !== undefined);
```

- [ ] **Implement** `src/app/api/settings/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { readJson, settingsPatchSchema } from "@/lib/auth/schemas";
import { authJson, requireUser, type AuthUser } from "@/lib/auth/session";
import { readEnv } from "@/lib/env";
import { VISION_MODELS } from "@/lib/openrouter/models";

export const runtime = "nodejs";

function settingsResponse(
  { theme, visionModel }: Pick<AuthUser, "theme" | "visionModel">,
  defaultVisionModel: string,
) {
  return authJson({ settings: { theme, visionModel }, visionModels: VISION_MODELS, defaultVisionModel });
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return settingsResponse(auth.user, readEnv().OPENROUTER_VISION_MODEL);
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = settingsPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return authJson({ error: "Choose an appearance or enter a valid photo-reading model ID." }, 400);
  }
  const defaultVisionModel = readEnv().OPENROUTER_VISION_MODEL;
  const [settings] = await (await getDb()).update(users).set(parsed.data)
    .where(eq(users.id, auth.user.id)).returning({ theme: users.theme, visionModel: users.visionModel });
  return settings ? settingsResponse(settings, defaultVisionModel) : authJson({ error: "Please sign in." }, 401);
}
```

`GET` uses the already-scoped projection from the session join. `PATCH` never accepts a user ID, changes only supplied keys (including explicit `null`), and returns the persisted row. Only the default model ID is exposed from `readEnv`—never serialize the result of `readEnv()` or mark secret vars `NEXT_PUBLIC_*`.

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts` → ten tests pass.
- [ ] **Commit:**

```powershell
git add -- src/lib/auth/schemas.ts src/app/api/settings/route.ts tests/auth.test.ts
git commit -m "feat(settings): persist per-user appearance and vision model choices"
```

## Task 6: Make sign-in and account creation usable on mobile

**Files:** Create `src/app/(auth)/login/page.tsx` and `src/app/(auth)/signup/page.tsx`; modify `tests/auth.test.ts`.

- [ ] **Write RED tests.** Append to `tests/auth.test.ts`; use real React server rendering without changing the Node test environment used by libSQL:

```ts
async function renderPage(Page: () => import("react").ReactNode) {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ThemeProvider } = await import("@/components/theme-provider");
  return renderToStaticMarkup(createElement(ThemeProvider, { children: createElement(Page) }));
}

it("renders labeled login and signup forms with a visible onboarding scope notice", async () => {
  const { default: Login } = await import("@/app/(auth)/login/page");
  const { default: Signup } = await import("@/app/(auth)/signup/page");
  const login = await renderPage(Login);
  const signup = await renderPage(Signup);
  for (const html of [login, signup]) {
    expect(html).toMatch(/<form[^>]*\bmethod="post"/);
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('type="submit"');
    expect(html).toMatch(/<label[^>]*>[\s\S]*Email[\s\S]*<input/);
    expect(html).toMatch(/<label[^>]*>[\s\S]*Password[\s\S]*<input/);
  }
  expect(login).toContain('autoComplete="current-password"');
  expect(signup).toContain('autoComplete="new-password"');
  expect(signup).toContain("not medical advice");
  expect(signup).toContain("blood pressure monitor");
});
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "labeled login"` → missing form modules.
- [ ] **Implement** `src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isThemeMode } from "@/components/ui/theme-init";

const input = "min-h-12 w-full rounded-lg border border-border bg-surface px-3";

export default function LoginPage() {
  const { setMode } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not sign you in. Try again.");
        return;
      }
      if (isThemeMode(body?.user?.theme)) setMode(body.user.theme);
      window.location.replace("/");
    } catch {
      setError("Could not sign you in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="text-muted">Open your daily care tracker.</p>
      <Card>
        <form className="grid gap-4" method="post" action="/api/auth/login" onSubmit={submit}>
          <label className="grid gap-1">Email
            <input className={input} type="email" name="email" autoComplete="email" maxLength={254} required />
          </label>
          <label className="grid gap-1">Password
            <input className={input} type="password" name="password" autoComplete="current-password" maxLength={128} required />
          </label>
          {error && <p role="alert" className="text-accent">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
      </Card>
      <Link href="/signup" className="inline-flex min-h-12 items-center text-primary underline">Create an account</Link>
    </main>
  );
}
```

`src/app/(auth)/signup/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isThemeMode } from "@/components/ui/theme-init";

const input = "min-h-12 w-full rounded-lg border border-border bg-surface px-3";

export default function SignupPage() {
  const { setMode } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not create your account. Try again.");
        return;
      }
      if (isThemeMode(body?.user?.theme)) setMode(body.user.theme);
      window.location.replace("/");
    } catch {
      setError("Could not create your account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="text-muted">Keep your daily care notes in one place.</p>
      <Card>
        <form className="grid gap-4" method="post" action="/api/auth/signup" onSubmit={submit}>
          <label className="grid gap-1">Name
            <input className={input} name="name" autoComplete="name" maxLength={100} required />
          </label>
          <label className="grid gap-1">Email
            <input className={input} type="email" name="email" autoComplete="email" maxLength={254} required />
          </label>
          <label className="grid gap-1">Password
            <input className={input} type="password" name="password" autoComplete="new-password"
              minLength={12} maxLength={128} aria-describedby="signup-password-help" required />
          </label>
          <p id="signup-password-help" className="text-muted">Use at least 12 characters.</p>
          {error && <p role="alert" className="text-accent">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
        </form>
      </Card>
      <aside className="border-s-4 border-accent ps-4" aria-labelledby="signup-care-note">
        <h2 id="signup-care-note" className="font-semibold text-accent">About this tracker</h2>
        <p>This app helps you keep track of daily care. It is not medical advice and does not replace your doctor,
          pharmacist, blood sugar meter, or blood pressure monitor.</p>
      </aside>
      <Link href="/login" className="inline-flex min-h-12 items-center text-primary underline">Already have an account? Sign in</Link>
    </main>
  );
}
```

Keep both forms under P1 `ThemeProvider`. Explicit POST prevents password fields becoming URL query parameters if a form submits before React hydrates; the handlers reject the fallback non-JSON body. A full same-origin navigation after success also avoids carrying a stale client router cache across account changes. Do not add a `next` redirect parameter.

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts` → eleven tests pass.
- [ ] **Commit:**

```powershell
git add -- 'src/app/(auth)/login/page.tsx' 'src/app/(auth)/signup/page.tsx' tests/auth.test.ts
git commit -m "feat(auth): add accessible sign-in and signup pages"
```

## Task 7: Build the Settings page

**Files:** Create `src/app/settings/page.tsx`; modify `tests/auth.test.ts`.

- [ ] **Write RED test.** Append to `tests/auth.test.ts`:

```ts
it("renders the Settings heading and medical notice even while preferences are loading", async () => {
  const { default: Settings } = await import("@/app/settings/page");
  const html = await renderPage(Settings);
  expect(html).toContain(">Settings</h1>");
  expect(html).toContain("Loading your settings");
  expect(html).toContain("not medical advice");
  expect(html).toContain("blood sugar meter");
});
```

- [ ] **Run RED:** `npx vitest run tests/auth.test.ts -t "Settings heading"` → missing Settings page.
- [ ] **Implement** `src/app/settings/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isThemeMode, type ThemeMode } from "@/components/ui/theme-init";

type SettingsResponse = {
  settings: { theme: ThemeMode; visionModel: string | null };
  visionModels: string[];
  defaultVisionModel: string;
};

const customOption = "__custom__";
const control = "min-h-12 w-full min-w-0 rounded-lg border border-border bg-surface px-3";

export default function SettingsPage() {
  const { setMode } = useTheme();
  const [page, setPage] = useState<SettingsResponse | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"saving" | "leaving" | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const applySettings = useCallback((value: SettingsResponse) => {
    const model = value.settings.visionModel;
    const isCustom = model !== null && !value.visionModels.includes(model);
    setPage(value);
    setTheme(value.settings.theme);
    setMode(value.settings.theme);
    setChoice(isCustom ? customOption : model ?? "");
    setCustom(isCustom ? model ?? "" : "");
  }, [setMode]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("settings unavailable");
        const body: SettingsResponse = await response.json();
        if (controller.signal.aborted) return;
        applySettings(body);
      } catch {
        if (!controller.signal.aborted) setError("Could not load your settings. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [applySettings, reload]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !page) return;
    setBusy("saving");
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme, visionModel: choice === customOption ? custom.trim() : choice || null,
        }),
      });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not save your settings. Try again.");
        return;
      }
      applySettings(body);
      setStatus("Settings saved.");
    } catch {
      setError("Could not save your settings. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy("leaving");
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!response.ok) throw new Error("sign-out unavailable");
      window.location.replace("/login");
    } catch {
      setError("Could not sign you out. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-8">
      <h1 className="text-3xl font-bold">Settings</h1>
      {page ? (
        <Card>
          <form onSubmit={save}>
            <fieldset disabled={busy !== null} className="grid min-w-0 gap-4">
              <legend className="sr-only">Tracker preferences</legend>
              <label className="grid min-w-0 gap-1">Appearance
                <select className={control} value={theme} onChange={(event) => {
                  if (isThemeMode(event.currentTarget.value)) setTheme(event.currentTarget.value);
                }}>
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-1">Medicine photo reader
                <select className={control} value={choice} onChange={(event) => setChoice(event.currentTarget.value)}>
                  <option value="">Recommended (app default)</option>
                  {page.visionModels.map((model) => <option key={model} value={model}>{model}</option>)}
                  <option value={customOption}>Custom model</option>
                </select>
              </label>
              {choice === "" && <p className="break-all text-muted">App default: {page.defaultVisionModel}</p>}
              {choice === customOption && (
                <label className="grid gap-1">Custom model ID
                  <input className={control} value={custom} maxLength={128} required
                    autoCapitalize="none" spellCheck={false} onChange={(event) => setCustom(event.currentTarget.value)} />
                </label>
              )}
              <Button type="submit">{busy === "saving" ? "Saving…" : "Save changes"}</Button>
            </fieldset>
          </form>
        </Card>
      ) : error ? (
        <Button variant="outline" onClick={() => { setError(""); setReload((value) => value + 1); }}>Try again</Button>
      ) : <p role="status">Loading your settings…</p>}
      {error && <p role="alert" className="text-accent">{error}</p>}
      <p role="status">{status}</p>
      <aside className="border-s-4 border-accent ps-4" aria-labelledby="settings-care-note">
        <h2 id="settings-care-note" className="font-semibold text-accent">About this tracker</h2>
        <p>This app helps you keep track of daily care. It is not medical advice and does not replace your doctor,
          pharmacist, blood sugar meter, or blood pressure monitor.</p>
      </aside>
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/" className="inline-flex min-h-12 items-center text-primary underline">Back to trackers</Link>
        {page && <Button variant="outline" disabled={busy !== null} onClick={signOut}>
          {busy === "leaving" ? "Signing out…" : "Sign out"}
        </Button>}
      </div>
    </main>
  );
}
```

The `SettingsResponse` type mirrors only the public endpoint. Neither `models.ts`, `env.ts`, nor `auth/*` belongs in the client import graph. The account theme applies after GET or successful PATCH, not after a failed save; the header can still preview a device-local preference. Sign-out leaves the local appearance as the signed-out fallback; the next login replaces it with that account's theme.

- [ ] **Run GREEN:** `npx vitest run tests/auth.test.ts` → twelve tests pass.
- [ ] **Commit:**

```powershell
git add -- src/app/settings/page.tsx tests/auth.test.ts
git commit -m "feat(settings): add accessible preferences, care notice, and sign-out"
```

## Task 8: Verify the P2 exit gate (read-only; no additional commit)

- [ ] **Run the exact exit gate:**

```powershell
npx vitest run tests/auth.test.ts
npm run typecheck
```

Expected: twelve green tests and type generation/TypeScript exit 0. `npm run build` is a useful additional check for the Next client/server boundary and App Router module exports; coordinate with other workers before running it in a shared checkout.

- [ ] **Browser smoke, if available:** Use an isolated temporary local SQLite DB, not the user's configured database. In a fresh PowerShell terminal, set the explicit local URL, push the already-owned schema without generating files, and start local Next:

```powershell
$smokeDb = Join-Path $env:LOCALAPPDATA ("Temp/opencode/vitals-p2-" + [guid]::NewGuid() + ".db")
$env:DATABASE_URL = "file:" + ($smokeDb -replace '\\','/')
npm run db:push
if ($LASTEXITCODE -ne 0) { throw 'Could not provision the smoke-test database.' }
npm run dev -- --hostname localhost --port 3018
```

At `http://localhost:3018/signup` create a test-only account. In browser network tools verify `Set-Cookie` carries `vt_session`, `HttpOnly`, `SameSite=Lax`, and `Max-Age=7776000` (dev HTTP is not Secure; production options are asserted by tests). Navigate directly to `/settings`, set Dark and a preset, save, then reload and verify the theme/model survived. Repeat with a custom model and reset to Recommended/System. Check at mobile width with keyboard/tab focus and confirm the notice is visible in both appearances. Close and reopen the app with the same browser profile; `/api/auth/me` still returns the safe user. Sign out in Settings, confirm `/api/auth/me` returns `401`, and confirm signing back in restores the account preferences. Do not call OpenRouter or Turso. Stop only the server you started with Ctrl+C, then close the smoke-test terminal. Report whether the browser check ran.

- [ ] **Report evidence:** record commit hashes and gate output. Confirm only the listed P2 files were changed by the worker. Relay the guard shape, Settings GET/PATCH contract, cookie scope/TTL, P7 theme/landing handoff, and the ingress rate-limiting recommendation. Report production checks as unverified unless actually run; do not capture or share session tokens or credentials.
