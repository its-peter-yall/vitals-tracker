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
