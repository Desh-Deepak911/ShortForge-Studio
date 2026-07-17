/**
 * Deterministic controlling-idea selection — Sprint 10C / 10C.1.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import { assertCanonicalControllingIdeaCandidates } from "./controlling-idea-candidate-identity";
import type {
  ControllingIdeaCandidate,
  ControllingIdeaSelection,
  RetentionStrategyPlanningContext,
} from "./retention-strategy.types";

function sourcePriority(source: ControllingIdeaCandidate["source"]): number {
  switch (source) {
    case "grounded_claim":
      return 1;
    case "deterministic_mode_strategy":
      return 2;
    case "planner_model_proposal":
      return 3;
    default:
      return 99;
  }
}

function groundedClaimPriority(
  candidate: ControllingIdeaCandidate,
  context: RetentionStrategyPlanningContext,
): number {
  if (candidate.source !== "grounded_claim" || candidate.claimRefs.length === 0) {
    return 50;
  }
  const claim = context.grounding.claims.find(
    (c) => c.claimId === candidate.claimRefs[0],
  );
  if (!claim) return 50;
  const roles = new Set((claim.piFactRole ?? "").split("+").filter(Boolean));
  if (roles.has("required")) return 1;
  if (roles.has("opening_intent") || roles.has("opening_hook")) return 2;
  return 3;
}

/**
 * Validate candidates canonically and select exactly one controlling idea.
 * Stale/forged candidates fail closed (typed error) — never silent relabel.
 */
export function selectControllingIdea(
  candidates: readonly ControllingIdeaCandidate[],
  context: RetentionStrategyPlanningContext,
): ControllingIdeaSelection {
  const valid = assertCanonicalControllingIdeaCandidates(candidates, context);

  if (valid.length === 0) {
    throw new RetentionStoryError(
      "no_valid_controlling_idea",
      "No valid controlling idea candidate could be selected.",
    );
  }

  const sorted = [...valid].sort((a, b) => {
    const bySource = sourcePriority(a.source) - sourcePriority(b.source);
    if (bySource !== 0) return bySource;
    const byGrounded =
      groundedClaimPriority(a, context) - groundedClaimPriority(b, context);
    if (byGrounded !== 0) return byGrounded;
    if (a.factualRisk !== b.factualRisk) {
      return a.factualRisk ? 1 : -1;
    }
    return a.candidateId.localeCompare(b.candidateId);
  });

  const selected = sorted[0]!;
  return Object.freeze({
    controllingIdea: Object.freeze({
      statement: selected.statement,
      mustPreserveThroughCompression: true as const,
    }),
    selectedCandidateId: selected.candidateId,
    source: selected.source,
    claimRefs: Object.freeze([...selected.claimRefs]),
  });
}
