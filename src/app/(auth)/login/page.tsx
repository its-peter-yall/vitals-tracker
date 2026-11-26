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
