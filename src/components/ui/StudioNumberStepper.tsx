"use client";

import { Minus, Plus } from "lucide-react";
import type { InputHTMLAttributes } from "react";

interface StudioNumberStepperProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onStepValue: (value: number) => void;
  suffix?: string;
  compact?: boolean;
}

function numericBound(value: string | number | readonly string[] | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function StudioNumberStepper({
  value,
  min,
  max,
  step = 1,
  disabled,
  onStepValue,
  suffix,
  compact = false,
  className = "",
  ...inputProps
}: StudioNumberStepperProps) {
  const current = numericBound(value) ?? numericBound(min) ?? 0;
  const increment = numericBound(step) ?? 1;
  const minimum = numericBound(min);
  const maximum = numericBound(max);

  const applyStep = (direction: -1 | 1) => {
    const precision = String(increment).split(".")[1]?.length ?? 0;
    const candidate = Number((current + direction * increment).toFixed(precision));
    onStepValue(
      Math.min(maximum ?? candidate, Math.max(minimum ?? candidate, candidate)),
    );
  };

  const buttonClass =
    "grid shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-border/25 bg-background/45 p-1 shadow-inner shadow-black/10 focus-within:border-accent/45 focus-within:ring-2 focus-within:ring-accent/10 ${
        compact ? "h-9" : "h-11"
      } ${className}`}
      data-studio-number-stepper="true"
    >
      <button
        type="button"
        className={`${buttonClass} ${compact ? "h-7 w-7" : "h-9 w-9"}`}
        onClick={() => applyStep(-1)}
        disabled={disabled || (minimum != null && current <= minimum)}
        aria-label={`Decrease ${inputProps["aria-label"] ?? "value"}`}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="flex min-w-0 items-center justify-center gap-1 px-1">
        <input
          {...inputProps}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={`min-w-0 border-0 bg-transparent text-center font-semibold tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
            compact ? "w-12 text-xs" : "w-14 text-sm"
          }`}
        />
        {suffix ? (
          <span className="shrink-0 text-[10px] font-medium text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className={`${buttonClass} ${compact ? "h-7 w-7" : "h-9 w-9"}`}
        onClick={() => applyStep(1)}
        disabled={disabled || (maximum != null && current >= maximum)}
        aria-label={`Increase ${inputProps["aria-label"] ?? "value"}`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
