/**
 * Build persistable RetentionValidationSummary — Sprint 10F.3 / 10G.1.
 * Only for terminal Pass (ok: true). Linkage proves same-generation pairing.
 */

import type { RetentionValidationResult } from "../validation/retention-validation.types";
import type {
  RetentionValidationSummary,
  RetentionValidationSummaryLinkage,
} from "./retention-persistence.types";

const MAX_WARNING_NOTES = 8;
const MAX_WARNING_CHARS = 160;

const PRIORITY_WARNING_NOTES = [
  "validation_pass_with_quality_warning",
  "quality_below_target",
  "quality_threshold_miss",
  "narration_substance_below_target",
  "hook_subject_led",
  "hook_low_tension",
  "hook_below_style_target",
  "duration_slightly_over_target",
  "duration_slightly_under_target",
  "duration_target_not_fully_met",
  "deterministic_fallback_accepted",
  "hard_gate_failure",
] as const;

function boundWarningNotes(notes: readonly string[]): readonly string[] {
  const cleaned = notes
    .filter((n) => typeof n === "string" && n.trim().length > 0)
    .map((n) =>
      n
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_WARNING_CHARS),
    )
    .filter((n) => n.length > 0);
  const prioritized: string[] = [];
  const seen = new Set<string>();
  for (const id of PRIORITY_WARNING_NOTES) {
    if (cleaned.includes(id) && !seen.has(id)) {
      prioritized.push(id);
      seen.add(id);
    }
  }
  for (const note of cleaned) {
    if (seen.has(note)) continue;
    prioritized.push(note);
    seen.add(note);
    if (prioritized.length >= MAX_WARNING_NOTES) break;
  }
  return Object.freeze(prioritized.slice(0, MAX_WARNING_NOTES));
}

/**
 * Build a linked validation summary for successful commit.
 * `linkage` must come from the accepted commit path (not caller-forged).
 */
export function buildRetentionValidationSummary(
  validation: RetentionValidationResult,
  linkage: RetentionValidationSummaryLinkage,
  options?: {
    readonly warningNotesOverride?: readonly string[];
  },
): RetentionValidationSummary {
  if (validation.ok !== true) {
    throw new Error("validation_summary_requires_pass");
  }
  if (
    linkage.terminalState !== "pass_without_rewrite" &&
    linkage.terminalState !== "pass_after_rewrite"
  ) {
    throw new Error("validation_summary_requires_pass_terminal");
  }
  const rewriteUsed = linkage.terminalState === "pass_after_rewrite";
  return Object.freeze({
    version: 1 as const,
    ok: true as const,
    retentionReadiness: validation.retentionReadiness,
    storyQualityConfidence: validation.storyQualityConfidence,
    frameworkCompliance: validation.frameworkCompliance,
    failedHardGateIds: Object.freeze([]) as readonly [],
    warningNotes: boundWarningNotes(
      options?.warningNotesOverride ?? validation.notes,
    ),
    validationFingerprint: validation.validationFingerprint,
    candidateFingerprint: validation.candidateFingerprint,
    contractFingerprint: linkage.contractFingerprint,
    planFingerprint: linkage.planFingerprint,
    terminalState: linkage.terminalState,
    rewriteUsed,
  });
}
