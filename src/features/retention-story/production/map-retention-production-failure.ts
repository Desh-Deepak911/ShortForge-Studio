/**
 * Map Retention terminal / stage failures to creator-safe categories — Sprint 10F.3.
 */

import type { RetentionRewriteTerminalState } from "../rewrite/retention-rewrite.types";
import type { RetentionHookBridgeFailureReason } from "../integration/retention-hook-bridge.types";
import type { RetentionStoryPlanFailureReason } from "../planning/retention-planner.types";
import type { RetentionStoryErrorReason } from "../domain/retention-story-errors";
import type { RetentionProductionFailureCategory } from "./retention-production.types";

/** Sprint 10H.3 — creator-facing copy; no internal architecture jargon. */
const CREATOR_MESSAGES: Record<RetentionProductionFailureCategory, string> = {
  contract_normalization_failure:
    "Add a clear topic and check your brief settings, then try again.",
  grounding_failure:
    "We couldn't use the research for this brief. Turn research off or clear unsupported details, then try again.",
  planner_unavailable:
    "We couldn't plan this story right now. Please try again in a moment.",
  planner_failed:
    "We couldn't plan this story right now. Please try again in a moment.",
  planner_invalid:
    "We couldn't plan this story from the brief. Simplify the topic or try again.",
  composer_unavailable:
    "We couldn't write the narration right now. Please try again in a moment.",
  composer_failed:
    "We couldn't write the narration right now. Please try again in a moment.",
  composer_invalid:
    "We couldn't finish a complete narration from this brief. Try a shorter duration or clearer topic.",
  hook_terminal_failure:
    "We couldn't lock a strong opening for this brief. Try Auto Hook or Write My Own, then generate again.",
  retention_hard_gate_failure:
    "We couldn't finish a complete story for this brief. Try simplifying the topic or switching Fact Handling, then generate again.",
  quality_failure:
    "We couldn't finish a safe draft for this brief. Simplify the topic or try again.",
  validation_authority_mismatch:
    "ShortForge could not safely finalize this draft. Please retry.",
  rewrite_failure:
    "We couldn't polish this draft further. Try adjusting the brief and generate again.",
  length_enforcement_failure:
    "This story ran long for the selected duration. Try a shorter brief or a longer duration.",
  budget_ledger_failure:
    "This attempt used up its generation budget. Please try again.",
  commit_gate_coherence_failure:
    "We couldn't finalize this story safely. Please try again.",
  production_internal_failure:
    "Something went wrong while generating. Please try again.",
  scenes_only_not_applicable:
    "This request doesn't need narration generation.",
};

export function creatorSafeErrorMessage(
  category: RetentionProductionFailureCategory,
): string {
  return CREATOR_MESSAGES[category];
}

export function mapStoryErrorReason(
  reason: RetentionStoryErrorReason,
): RetentionProductionFailureCategory {
  switch (reason) {
    case "planner_unavailable":
      return "planner_unavailable";
    case "planner_call_failed":
      return "planner_failed";
    case "planner_proposal_invalid":
      return "planner_invalid";
    case "composer_unavailable":
      return "composer_unavailable";
    case "composer_call_failed":
      return "composer_failed";
    case "composer_proposal_invalid":
    case "composer_segment_mismatch":
    case "composer_grounding_invalid":
      return "composer_invalid";
    case "length_enforcement_failed":
      return "length_enforcement_failure";
    case "hook_terminal_failure":
      return "hook_terminal_failure";
    case "model_call_budget_exhausted":
    case "model_call_ledger_invalid":
      return "budget_ledger_failure";
    case "invalid_grounding_context":
    case "invalid_grounding_claim":
    case "grounding_claim_conflict":
    case "grounding_identity_mismatch":
    case "grounding_summary_mismatch":
    case "invalid_research_identity":
      return "grounding_failure";
    case "creator_context_identity_mismatch":
      return "validation_authority_mismatch";
    default:
      if (
        reason.startsWith("invalid_") ||
        reason.includes("format") ||
        reason.includes("hook_style") ||
        reason.includes("generation_path") ||
        reason.includes("contract")
      ) {
        return "contract_normalization_failure";
      }
      return "commit_gate_coherence_failure";
  }
}

export function mapPlannerFailure(
  reason: RetentionStoryPlanFailureReason,
): RetentionProductionFailureCategory {
  if (reason === "planner_unavailable") return "planner_unavailable";
  if (reason === "planner_call_failed") return "planner_failed";
  return "planner_invalid";
}

export function mapHookBridgeFailure(
  reason: RetentionHookBridgeFailureReason,
): RetentionProductionFailureCategory {
  if (reason === "scenes_only") return "scenes_only_not_applicable";
  if (
    reason === "composer_unavailable" ||
    reason === "composer_call_failed" ||
    reason === "composer_proposal_invalid" ||
    reason === "composer_segment_mismatch" ||
    reason === "composer_grounding_invalid" ||
    reason === "length_enforcement_failed"
  ) {
    return mapStoryErrorReason(reason);
  }
  if (
    reason === "model_call_budget_exhausted" ||
    reason === "model_call_ledger_invalid"
  ) {
    return "budget_ledger_failure";
  }
  return "hook_terminal_failure";
}

function isAuthoritySafeReason(safeReasonIds: readonly string[]): boolean {
  return safeReasonIds.some(
    (id) =>
      id === "creator_context_identity_mismatch" ||
      id === "grounding_summary_mismatch" ||
      id === "grounding_identity_mismatch" ||
      id === "validation_authority_mismatch" ||
      id === "authority_mismatch",
  );
}

export function mapTerminalFailure(
  status: Exclude<
    RetentionRewriteTerminalState,
    "pass_without_rewrite" | "pass_after_rewrite" | "skipped_scenes_only"
  >,
  safeReasonIds: readonly string[],
): RetentionProductionFailureCategory {
  if (isAuthoritySafeReason(safeReasonIds)) {
    return "validation_authority_mismatch";
  }
  if (status === "ledger_invalid") return "budget_ledger_failure";
  if (status === "length_enforcement_failed") {
    return "length_enforcement_failure";
  }
  if (
    status === "rewrite_unavailable" ||
    status === "rewrite_call_failed" ||
    status === "rewrite_proposal_invalid" ||
    status === "opening_preservation_failed" ||
    status === "post_rewrite_hook_failed" ||
    status === "post_rewrite_retention_failed"
  ) {
    return "rewrite_failure";
  }
  if (status === "rewrite_not_allowed") {
    // Editorial quality_below_target must never reach here as a terminal fail.
    // Remaining rewrite_not_allowed cases are structural / budget — not score-only.
    if (safeReasonIds.includes("hard_gate_failure")) {
      return "retention_hard_gate_failure";
    }
    if (safeReasonIds.includes("rewrite_budget_unavailable")) {
      return "budget_ledger_failure";
    }
    if (isAuthoritySafeReason(safeReasonIds)) {
      return "validation_authority_mismatch";
    }
    return "retention_hard_gate_failure";
  }
  return "commit_gate_coherence_failure";
}
