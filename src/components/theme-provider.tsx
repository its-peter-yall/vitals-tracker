"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DARK_QUERY, isThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/components/ui/theme-init";

const changed = "vitals-tracker-theme-change";
let volatileMode: ThemeMode | undefined;
const ThemeContext = createContext<{ mode: ThemeMode; setMode: (value: ThemeMode) => void } | null>(null);

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changed, listener);
  };
}

function getPreference(): ThemeMode {
  if (volatileMode) return volatileMode;
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : "system";
  } catch {
    return "system";
  }
}

const serverPreference = (): ThemeMode => "system";

function setMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    volatileMode = undefined;
  } catch {
    volatileMode = mode;
  }
  window.dispatchEvent(new Event(changed));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getPreference, serverPreference);
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    const apply = () => {
      const preference = getPreference();
      const dark = preference === "dark" || (preference === "system" && !!query?.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    query?.addEventListener("change", apply);
    return () => query?.removeEventListener("change", apply);
  }, [mode]);
  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme requires ThemeProvider");
  return context;
}

export function ThemeSelect() {
  const { mode, setMode: applyMode } = useTheme();
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span>Appearance</span>
      <select className="min-h-12 min-w-12 rounded-lg border border-border bg-surface px-3"
        value={mode} onChange={(event) => {
          if (isThemeMode(event.currentTarget.value)) applyMode(event.currentTarget.value);
        }}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
