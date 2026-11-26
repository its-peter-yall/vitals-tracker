export const THEME_STORAGE_KEY = "vitals-tracker-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
export type ThemeMode = "system" | "light" | "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export const themeInitScript = `(() => {
  let mode = "system";
  try { mode = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "system"; } catch {}
  if (mode !== "light" && mode !== "dark") mode = "system";
  const dark = mode === "dark" || (mode === "system" && !!window.matchMedia?.(${JSON.stringify(DARK_QUERY)}).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
})();`;
