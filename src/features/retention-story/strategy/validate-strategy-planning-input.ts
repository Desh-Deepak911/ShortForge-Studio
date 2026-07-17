/**
 * Planning-input coherence for Retention strategy — Sprint 10C.
 * Never echoes raw creator text or claim content in errors.
 */

import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import {
  RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
} from "../domain/retention-story-contract.constants";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { buildRetentionSemanticIdentity } from "../domain/retention-story-fingerprint";
import { normalizeRetentionGroundingContext } from "../grounding/retention-grounding-normalization";
import type {
  BuildRetentionStrategySeedInput,
  RetentionStrategyPlanningContext,
} from "./retention-strategy.types";
import { extractRetentionSubjectTokens } from "./retention-subject-tokens";

function summarizeGrounding(grounding: ReturnType<typeof normalizeRetentionGroundingContext>) {
  let eligible = 0;
  let forbidden = 0;
  for (const claim of grounding.claims) {
    if (
      claim.forbidden ||
      claim.verification === "forbidden" ||
      claim.verification === "rejected"
    ) {
      forbidden += 1;
    }
    if (
      claim.permittedFactualUse &&
      claim.verification === "verified" &&
      !claim.forbidden
    ) {
      eligible += 1;
    }
  }
  return { claimCount: grounding.claims.length, eligible, forbidden };
}

/**
 * Validate contract/grounding/creator-text coherence and return planning context.
 * Scenes-only callers should short-circuit before calling this.
 */
export function validateRetentionStrategyPlanningInput(
  input: BuildRetentionStrategySeedInput,
): RetentionStrategyPlanningContext {
  const { contract } = input;
  if (!contract || typeof contract !== "object") {
    throw new RetentionStoryError(
      "strategy_input_mismatch",
      "Strategy planning requires a normalized Story Contract.",
    );
  }

  if (contract.generationPath === "scenes_only") {
    throw new RetentionStoryError(
      "strategy_not_applicable",
      "Retention strategy planning does not apply to scenes-only generation.",
    );
  }

  const grounding = normalizeRetentionGroundingContext(input.grounding);
  const summary = summarizeGrounding(grounding);
  const expected = contract.groundingSummary;

  const opaqueZeroClaim =
    summary.claimCount === 0 &&
    expected.claimCount === 0 &&
    expected.eligibleClaimCount === 0 &&
    expected.forbiddenClaimCount === 0;

  if (
    summary.claimCount !== expected.claimCount ||
    summary.eligible !== expected.eligibleClaimCount ||
    summary.forbidden !== expected.forbiddenClaimCount
  ) {
    throw new RetentionStoryError(
      "grounding_summary_mismatch",
      "Grounding summary does not match the normalized Story Contract.",
    );
  }

  if (opaqueZeroClaim) {
    // Zero-claim / opaque research contexts grant no factual authority.
    // Grounding may omit the opaque identity when the contract already carries it.
    if (
      grounding.researchIdentity != null &&
      expected.researchIdentity != null &&
      grounding.researchIdentity !== expected.researchIdentity
    ) {
      throw new RetentionStoryError(
        "grounding_summary_mismatch",
        "Opaque research identity does not match the normalized Story Contract.",
      );
    }
  } else if (grounding.researchIdentity !== expected.researchIdentity) {
    throw new RetentionStoryError(
      "grounding_summary_mismatch",
      "Grounding research identity does not match the normalized Story Contract.",
    );
  }

  const manualContext = sanitizeRetentionText(
    input.manualContext ?? "",
    RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  );
  const userInstructions = sanitizeRetentionText(
    input.userInstructions ?? "",
    RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
  );

  const manualIdentity = manualContext
    ? buildRetentionSemanticIdentity({
        kind: "manual_context",
        text: manualContext,
      })
    : null;
  const instructionsIdentity = userInstructions
    ? buildRetentionSemanticIdentity({
        kind: "user_instructions",
        text: userInstructions,
      })
    : null;

  if (manualIdentity !== contract.identities.manualContextIdentity) {
    throw new RetentionStoryError(
      "creator_context_identity_mismatch",
      "Manual context identity does not match the normalized Story Contract.",
    );
  }
  if (instructionsIdentity !== contract.identities.userInstructionsIdentity) {
    throw new RetentionStoryError(
      "creator_context_identity_mismatch",
      "User instructions identity does not match the normalized Story Contract.",
    );
  }

  const subjectTokens = extractRetentionSubjectTokens(contract.topic);
  if (subjectTokens.length === 0) {
    throw new RetentionStoryError(
      "invalid_controlling_idea",
      "Topic has no meaningful subject anchor for Retention strategy.",
    );
  }

  return Object.freeze({
    contract,
    grounding,
    manualContext,
    userInstructions,
    subjectTokens,
  });
}
