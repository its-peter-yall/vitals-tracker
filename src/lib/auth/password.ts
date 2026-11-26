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
