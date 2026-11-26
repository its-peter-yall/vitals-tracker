"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, Settings } from "lucide-react";

type TrackerTabsProps = {
  trackerId: string;
};

export function TrackerTabs({ trackerId }: TrackerTabsProps) {
  const pathname = usePathname();
  const todayHref = `/trackers/${trackerId}`;
  const analyticsHref = `/trackers/${trackerId}/analytics`;
  const onAnalytics = pathname === analyticsHref || pathname.startsWith(`${analyticsHref}/`);

  const tabBase =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition-colors";
  const activeTab = "bg-primary text-primary-fg";
  const inactiveTab = "text-text hover:bg-canvas";

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span>Trackers</span>
        </Link>
        <Link
          href="/settings"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 font-semibold text-text"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </div>
      <nav
        aria-label="Tracker views"
        className="flex gap-2 rounded-2xl border border-border bg-surface p-1.5"
      >
        <Link
          href={todayHref}
          aria-current={onAnalytics ? undefined : "page"}
          className={`${tabBase} ${onAnalytics ? inactiveTab : activeTab}`}
        >
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          <span>Today</span>
        </Link>
        <Link
          href={analyticsHref}
          aria-current={onAnalytics ? "page" : undefined}
          className={`${tabBase} ${onAnalytics ? activeTab : inactiveTab}`}
        >
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
          <span>Analytics</span>
        </Link>
      </nav>
    </div>
  );
}
