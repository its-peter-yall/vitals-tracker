import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider, ThemeSelect } from "@/components/theme-provider";
import { themeInitScript } from "@/components/ui/theme-init";
import "./globals.css";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "Vitals Tracker", description: "Daily nutrient and medicine tracking" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <ThemeProvider>
          <header className="border-b border-border bg-surface">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold text-primary">Vitals Tracker</span>
              <ThemeSelect />
            </div>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
