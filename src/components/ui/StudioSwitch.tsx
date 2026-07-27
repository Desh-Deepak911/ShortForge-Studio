"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

interface StudioSwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export default function StudioSwitch({
  label,
  description,
  className = "",
  ...inputProps
}: StudioSwitchProps) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/20 bg-background/30 px-3 py-2.5 transition hover:border-border/35 hover:bg-background/45 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${className}`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-foreground/90">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
            {description}
          </span>
        ) : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          {...inputProps}
          type="checkbox"
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full border border-border/30 bg-white/[0.07] p-0.5 shadow-inner transition peer-checked:border-accent/50 peer-checked:bg-accent/70 peer-checked:[&>span]:translate-x-5 peer-checked:[&>span]:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
          <span className="block h-[18px] w-[18px] rounded-full bg-white/75 shadow-sm transition-transform" />
        </span>
      </span>
    </label>
  );
}
