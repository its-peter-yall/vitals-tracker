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
