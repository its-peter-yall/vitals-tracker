import type { ReactNode } from "react";
import { TrackerTabs } from "@/components/trackers/tracker-tabs";

export default async function TrackerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-4">
      <TrackerTabs trackerId={id} />
      {children}
    </div>
  );
}
