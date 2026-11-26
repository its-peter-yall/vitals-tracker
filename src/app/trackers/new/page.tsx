"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TrackerWizard } from "@/components/wizard/tracker-wizard";

export default function NewTrackerPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <Link
        href="/"
        className="inline-flex min-h-12 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        <span>Back to Trackers</span>
      </Link>
      <TrackerWizard />
    </main>
  );
}
