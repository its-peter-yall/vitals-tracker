import type { ComponentProps } from "react";

const variants = {
  primary: "bg-primary text-primary-fg",
  secondary: "bg-accent text-accent-fg",
  outline: "border border-border bg-surface text-text",
};

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof variants };

export function Button({ type = "button", variant = "primary", className = "", ...props }: ButtonProps) {
  return <button {...props} type={type} className={[
    "inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center rounded-xl px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant], className,
  ].join(" ")} />;
}
