"use client";

import { Minus, Plus } from "lucide-react";
import {
  useId,
  useReducer,
  useRef,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

import {
  formatStepperCanonicalDisplay,
  INITIAL_STEPPER_DRAFT_UI,
  reduceStepperDraftUi,
  type StepperDraftUiAction,
  type StepperDraftUiState,
} from "./studio-number-stepper-draft";
import StudioNumberStepperGuidance from "./StudioNumberStepperGuidance";

interface StudioNumberStepperProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onStepValue: (value: number) => void;
  /**
   * Optional typed-value commit. When `onChange` is omitted, typed Enter/blur
   * commits through this handler (defaulting to `onStepValue`) so consumers that
   * only wire steppers keep keyboard entry working without a second authority.
   */
  onValueCommit?: (value: number) => void;
  suffix?: string;
  compact?: boolean;
}

function numericBound(value: string | number | readonly string[] | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function draftReducer(
  state: StepperDraftUiState,
  action: StepperDraftUiAction,
): StepperDraftUiState {
  return reduceStepperDraftUi(state, action).state;
}

/**
 * Accessible numeric stepper.
 *
 * Draft mode (when `onChange` is omitted):
 * - Enter/blur commit finite values through `onValueCommit` / `onStepValue`.
 * - Escape restores the canonical value without committing.
 * - Invalid/empty/non-finite commit restores the canonical value, sets
 *   `aria-invalid`, and keeps a non-empty polite status message until the next
 *   draft edit, successful commit, Escape, or +/- step (not cleared on focus).
 * - Failed Enter does not blur, so guidance remains perceivable.
 */
export default function StudioNumberStepper({
  value,
  min,
  max,
  step = 1,
  disabled,
  onStepValue,
  onValueCommit,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  suffix,
  compact = false,
  className = "",
  "aria-describedby": ariaDescribedBy,
  ...inputProps
}: StudioNumberStepperProps) {
  const current = numericBound(value) ?? numericBound(min) ?? 0;
  const increment = numericBound(step) ?? 1;
  const minimum = numericBound(min);
  const maximum = numericBound(max);

  const usesExternalOnChange = typeof onChange === "function";
  const typedCommit = onValueCommit ?? (!usesExternalOnChange ? onStepValue : undefined);
  const managesInternalDraft =
    typeof typedCommit === "function" && !usesExternalOnChange;

  const guidanceId = useId();
  const [draftUi, dispatchDraft] = useReducer(draftReducer, INITIAL_STEPPER_DRAFT_UI);
  const editingRef = useRef(false);

  const displayValue =
    managesInternalDraft && draftUi.editing ? draftUi.draftText : (value ?? "");
  const guidance = managesInternalDraft ? draftUi.guidance : null;

  const applyStep = (direction: -1 | 1) => {
    const precision = String(increment).split(".")[1]?.length ?? 0;
    const candidate = Number((current + direction * increment).toFixed(precision));
    const next = Math.min(maximum ?? candidate, Math.max(minimum ?? candidate, candidate));
    editingRef.current = false;
    dispatchDraft({ type: "step" });
    onStepValue(next);
  };

  const commitDraft = (raw: string): boolean => {
    const canonical = formatStepperCanonicalDisplay(value);
    const result = reduceStepperDraftUi(draftUi, {
      type: "commit",
      raw,
      canonical,
      min: minimum,
      max: maximum,
    });
    dispatchDraft({
      type: "commit",
      raw,
      canonical,
      min: minimum,
      max: maximum,
    });
    if (result.invalidRecovery) {
      // Idle display of the canonical `value` prop; keep guidance visible.
      editingRef.current = false;
      return false;
    }
    editingRef.current = false;
    if (result.commitValue != null) {
      typedCommit?.(result.commitValue);
    }
    return true;
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    if (managesInternalDraft && !disabled) {
      editingRef.current = true;
      dispatchDraft({
        type: "focus",
        canonical: formatStepperCanonicalDisplay(value),
      });
    }
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (managesInternalDraft && editingRef.current) {
      // Live DOM value is authoritative — reducer text can lag the input event.
      commitDraft(event.currentTarget.value);
    }
    editingRef.current = false;
    onBlur?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (managesInternalDraft && !disabled) {
      if (event.key === "Enter") {
        event.preventDefault();
        // Commit the live input value, not a possibly stale reducer snapshot.
        const ok = commitDraft(event.currentTarget.value);
        // Keep focus after invalid recovery so aria-invalid + status remain
        // perceivable (auto-blur + label re-focus was clearing guidance).
        if (ok) {
          event.currentTarget.blur();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        editingRef.current = true;
        dispatchDraft({
          type: "escape",
          canonical: formatStepperCanonicalDisplay(value),
        });
      }
    }
    onKeyDown?.(event);
  };

  const describedBy = [ariaDescribedBy, guidance ? guidanceId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  const buttonClass =
    "grid shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-border/25 bg-background/45 p-1 shadow-inner shadow-black/10 focus-within:border-accent/45 focus-within:ring-2 focus-within:ring-accent/10 ${
        compact ? "h-9" : "h-11"
      } ${className}`}
      data-studio-number-stepper="true"
      data-studio-number-stepper-draft={managesInternalDraft ? "true" : "false"}
    >
      <button
        type="button"
        className={`${buttonClass} ${compact ? "h-7 w-7" : "h-9 w-9"}`}
        onMouseDown={(event) => {
          // Keep input focus so blur-commit does not race the step click.
          event.preventDefault();
        }}
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
          value={displayValue}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={guidance ? true : inputProps["aria-invalid"]}
          aria-describedby={describedBy}
          onChange={(event) => {
            if (usesExternalOnChange) {
              onChange?.(event);
              return;
            }
            if (managesInternalDraft) {
              editingRef.current = true;
              dispatchDraft({ type: "change", text: event.target.value });
            }
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
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
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => applyStep(1)}
        disabled={disabled || (maximum != null && current >= maximum)}
        aria-label={`Increase ${inputProps["aria-label"] ?? "value"}`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <StudioNumberStepperGuidance id={guidanceId} guidance={guidance} />
    </div>
  );
}
