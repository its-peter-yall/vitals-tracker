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
