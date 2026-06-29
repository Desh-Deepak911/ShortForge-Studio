"use client";

import type { ReactNode } from "react";

import { studioRibbonAction, studioRibbonActionActive } from "@/lib/utils/studioUi";

export interface RibbonActionProps {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  /** When set, renders as a file picker label instead of a button. */
  accept?: string;
  onFileChange?: (file: File | null) => void;
}

/**
 * Compact ribbon control — button or file-picker label.
 */
export default function RibbonAction({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  title,
  accept,
  onFileChange,
}: RibbonActionProps) {
  const className = active ? studioRibbonActionActive : studioRibbonAction;

  if (accept && onFileChange) {
    return (
      <label
        title={title ?? label}
        className={`${className} cursor-pointer disabled:cursor-not-allowed`}
      >
        {icon}
        {label}
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            onFileChange(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {icon}
      {label}
    </button>
  );
}

export interface RibbonMetricProps {
  label: string;
  value: string;
}

/** Read-only ribbon value display (e.g. zoom percentage). */
export function RibbonMetric({ label, value }: RibbonMetricProps) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-xl bg-surface-elevated/30 px-2.5 py-1.5 text-xs ring-1 ring-border/15"
      aria-label={`${label} ${value}`}
    >
      <span className="font-medium text-muted">{label}</span>
      <span className="font-medium tabular-nums text-foreground/90">{value}</span>
    </div>
  );
}
