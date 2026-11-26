import "server-only";
import * as z from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const signupSchema = z.strictObject({
  email, name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128),
});

export const loginSchema = z.strictObject({
  email, password: z.string().min(1).max(128),
});
export const logoutSchema = z.strictObject({});

export async function readJson(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return undefined;
  return request.json().catch(() => undefined);
}
