/**
 * Safe generation disposition summary — Sprint 10H.3 / 10H.3A.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  freezeDispositionSummary,
  type RetentionGenerationAdaptationId,
  type RetentionGenerationDisposition,
  type RetentionGenerationDispositionSummary,
} from "./retention-generation-disposition.types";

function countWords(text: string): number {
  return text
    .normalize("NFC")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

function creatorNotesFor(
  adaptations: readonly RetentionGenerationAdaptationId[],
  disposition: RetentionGenerationDisposition,
  factHandlingMode: NormalizedStoryContract["factHandlingMode"],
  emptyPremiseGuidance: boolean,
  warningNotes: readonly string[],
): readonly string[] {
  const notes: string[] = [];
  if (adaptations.includes("planner_fallback_used")) {
    notes.push("Used a reliable plan when model planning was unavailable.");
  }
  if (adaptations.includes("beat_plan_compacted")) {
    notes.push("Beat count was compacted to fit the selected duration.");
  }
  if (adaptations.includes("hook_style_reconciled")) {
    notes.push("Hook style was adjusted to a compatible opening.");
  }
  if (adaptations.includes("length_rescue_used")) {
    notes.push("Narration was shortened to fit the selected duration.");
  }
  if (warningNotes.includes("duration_slightly_over_target")) {
    notes.push("Spoken duration is slightly over the selected target.");
  }
  if (warningNotes.includes("duration_slightly_under_target")) {
    notes.push("Spoken duration is slightly under the selected target.");
  }
  if (warningNotes.includes("duration_target_not_fully_met")) {
    notes.push("Spoken duration did not fully meet the selected target.");
  }
  if (adaptations.includes("quality_below_target")) {
    notes.push("Story is complete but below the editorial readiness target.");
  }
  if (adaptations.includes("unsupported_facts_omitted")) {
    notes.push("Unsupported factual details were omitted or reframed.");
  }
  if (adaptations.includes("creative_premise_used")) {
    notes.push(
      "Uses creator-supplied premise details (not independently verified).",
    );
  }
  if (
    emptyPremiseGuidance &&
    factHandlingMode === "creative_premise" &&
    !adaptations.includes("creative_premise_used")
  ) {
    notes.push(
      "Creative Premise was selected without premise details — add one fact per line to ground the story world.",
    );
  }
  if (adaptations.includes("deterministic_story_fallback_used")) {
    notes.push(
      "A basic fallback narration was used because the generated narration could not be accepted.",
    );
  }
  if (adaptations.includes("reliability_rescue_used")) {
    notes.push("A bounded reliability rescue was used to finish the story.");
  }
  if (adaptations.includes("participant_coverage_reconciled")) {
    notes.push("Both matchup sides were ensured in the finished narration.");
  }
  if (disposition === "optimal" && notes.length === 0) {
    notes.push("Generated with the preferred settings for this brief.");
  }
  return Object.freeze(notes);
}

export function buildRetentionGenerationDisposition(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly narration: string;
  readonly warningNotes?: readonly string[];
  readonly adaptations: readonly RetentionGenerationAdaptationId[];
  /** Empty Creative Premise details — guidance note only. */
  readonly emptyPremiseGuidance?: boolean;
  readonly acceptanceTrace?: import("./retention-generation-acceptance-trace.types").RetentionGenerationAcceptanceTrace;
}): RetentionGenerationDispositionSummary {
  // Do not infer creative_premise_used from mode — caller must derive from
  // committed candidate claim refs (Sprint 10H.3A).
  const adaptations = [...input.adaptations];
  const warningNotes = input.warningNotes ?? [];
  if (
    warningNotes.includes("quality_below_target") ||
    warningNotes.includes("quality_threshold_miss") ||
    warningNotes.includes("validation_pass_with_quality_warning") ||
    warningNotes.includes("narration_substance_below_target")
  ) {
    if (!adaptations.includes("quality_below_target")) {
      adaptations.push("quality_below_target");
    }
  }

  // Deterministic planning-language rescue is never ordinary-quality Pass.
  if (
    adaptations.includes("deterministic_story_fallback_used") ||
    adaptations.includes("reliability_rescue_used")
  ) {
    if (!adaptations.includes("quality_below_target")) {
      adaptations.push("quality_below_target");
    }
  }

  let disposition: RetentionGenerationDisposition = "optimal";
  if (
    adaptations.includes("deterministic_story_fallback_used") ||
    adaptations.includes("reliability_rescue_used")
  ) {
    disposition = "fallback";
  } else if (
    adaptations.includes("planner_fallback_used") ||
    adaptations.includes("hook_style_reconciled") ||
    adaptations.includes("length_rescue_used") ||
    adaptations.includes("beat_plan_compacted") ||
    adaptations.includes("quality_below_target") ||
    adaptations.includes("unsupported_facts_omitted") ||
    adaptations.includes("creative_premise_used") ||
    adaptations.includes("participant_coverage_reconciled")
  ) {
    disposition = "acceptable";
  }

  return freezeDispositionSummary({
    disposition,
    adaptations: Object.freeze(
      [...new Set(adaptations)] as RetentionGenerationAdaptationId[],
    ),
    factHandlingMode: input.contract.factHandlingMode,
    qualityBelowTarget: adaptations.includes("quality_below_target"),
    approximateWordCount: countWords(input.narration),
    targetWordBudget: input.plan.compressionGoals.targetWordBudget,
    resolvedBeatCount: input.plan.beatPlan.beats.length,
    creatorFacingNotes: creatorNotesFor(
      adaptations,
      disposition,
      input.contract.factHandlingMode,
      input.emptyPremiseGuidance === true,
      warningNotes,
    ),
    ...(input.acceptanceTrace
      ? { acceptanceTrace: input.acceptanceTrace }
      : {}),
  });
}
