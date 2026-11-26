import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`rounded-2xl border border-border bg-surface p-4 sm:p-6 ${className}`} />;
}
