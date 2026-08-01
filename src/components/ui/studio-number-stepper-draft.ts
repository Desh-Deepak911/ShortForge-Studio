/**
 * Pure draft helpers for StudioNumberStepper typed entry.
 * Keeps temporary editing states (empty / trailing decimal) out of domain commands
 * until Enter or blur commits a finite number.
 */

export const STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE =
  "Enter a valid number. The previous value was restored." as const;

export type NumericDraftCommitResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: string };

/** True while the field is in a temporary non-committable edit state. */
export function isIncompleteNumericDraft(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+" || trimmed === ".") {
    return true;
  }
  if (trimmed === "-." || trimmed === "+.") {
    return true;
  }
  return /^[+-]?\d+\.$/.test(trimmed);
}

/**
 * Parse a draft string for commit. Trailing decimals commit as their integer part
 * (e.g. "2." → 2). Empty / non-finite input fails closed without a value.
 */
export function parseNumericDraftCommit(raw: string): NumericDraftCommitResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, reason: STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE };
  }

  const normalized = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (
    normalized === "" ||
    normalized === "-" ||
    normalized === "+" ||
    normalized === "."
  ) {
    return { ok: false, reason: STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE };
  }
  return { ok: true, value };
}

/** Clamp a committed number to optional stepper bounds (same as +/- buttons). */
export function clampStepperCommitValue(
  value: number,
  min: number | undefined,
  max: number | undefined,
): number {
  let next = value;
  if (min != null && Number.isFinite(min)) {
    next = Math.max(min, next);
  }
  if (max != null && Number.isFinite(max)) {
    next = Math.min(max, next);
  }
  return next;
}

export function formatStepperCanonicalDisplay(
  value: string | number | readonly string[] | undefined,
): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join("");
  }
  return "";
}

/**
 * Draft/guidance UI state for typed stepper entry.
 *
 * Invalid-input lifecycle:
 * - Failed commit restores the canonical display and sets polite guidance +
 *   aria-invalid.
 * - Guidance clears on the next draft edit, successful commit, Escape, or
 *   plus/minus step — not on focus alone (so Enter recovery stays perceivable).
 * - Failed Enter commits keep focus (callers should not blur) so guidance remains.
 */
export interface StepperDraftUiState {
  readonly editing: boolean;
  readonly draftText: string;
  readonly guidance: string | null;
}

export type StepperDraftUiAction =
  | { readonly type: "focus"; readonly canonical: string }
  | { readonly type: "change"; readonly text: string }
  | {
      readonly type: "commit";
      readonly raw: string;
      readonly canonical: string;
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly type: "escape"; readonly canonical: string }
  | { readonly type: "step" };

export interface StepperDraftUiResult {
  readonly state: StepperDraftUiState;
  /** Present only when a finite value should be committed to the consumer. */
  readonly commitValue?: number;
  /** True when commit failed and guidance was applied (callers must not blur). */
  readonly invalidRecovery?: boolean;
}

export const INITIAL_STEPPER_DRAFT_UI: StepperDraftUiState = Object.freeze({
  editing: false,
  draftText: "",
  guidance: null,
});

/**
 * After an invalid commit, exit edit mode (canonical comes from `value` props)
 * while keeping polite guidance + aria-invalid until the next edit/commit/Escape/step.
 */
export function restoreCanonicalAfterInvalidCommit(
  _canonical: string,
  reason: string = STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE,
): StepperDraftUiState {
  return {
    editing: false,
    draftText: "",
    guidance: reason,
  };
}

export function reduceStepperDraftUi(
  state: StepperDraftUiState,
  action: StepperDraftUiAction,
): StepperDraftUiResult {
  switch (action.type) {
    case "focus":
      return {
        state: {
          editing: true,
          draftText: action.canonical,
          // Keep invalid guidance until the user edits, commits, escapes, or steps.
          guidance: state.guidance,
        },
      };
    case "change":
      return {
        state: {
          editing: true,
          draftText: action.text,
          guidance: null,
        },
      };
    case "escape":
      return {
        state: {
          editing: true,
          draftText: action.canonical,
          guidance: null,
        },
      };
    case "step":
      return {
        state: {
          editing: false,
          draftText: "",
          guidance: null,
        },
      };
    case "commit": {
      const parsed = parseNumericDraftCommit(action.raw);
      if (!parsed.ok) {
        return {
          state: restoreCanonicalAfterInvalidCommit(
            action.canonical,
            parsed.reason,
          ),
          invalidRecovery: true,
        };
      }
      return {
        state: {
          editing: false,
          draftText: "",
          guidance: null,
        },
        commitValue: clampStepperCommitValue(
          parsed.value,
          action.min,
          action.max,
        ),
      };
    }
    default:
      return { state };
  }
}
