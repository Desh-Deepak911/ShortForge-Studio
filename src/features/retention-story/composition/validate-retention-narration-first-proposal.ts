/**
 * Narration-first proposal validation — story-quality Prompt 3 / 8.
 * Delegates to the single canonical spoken-narration acceptance authority.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import { evaluateRetentionCanonicalNarrationAcceptance } from "./evaluate-retention-canonical-narration-acceptance";
import type { RetentionNarrationFirstProposal } from "./retention-narration-first.types";

export type RetentionNarrationFirstRejection =
  | "malformed_composer_proposal"
  | "unsupported_claim_or_claim_reference_rejection"
  | "hook_body_relationship_rejection"
  | "duration_or_compression_rejection"
  | "narration_hard_gate_rejection";

function throwRejected(
  stage: RetentionNarrationFirstRejection,
  message: string,
): never {
  throw new RetentionStoryError("composer_proposal_invalid", message, {
    normalizeSeam: stage,
  });
}

function isNarrationFirstRecord(
  raw: unknown,
): raw is Record<string, unknown> & { narration: string } {
  return (
    raw != null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { narration?: unknown }).narration === "string" &&
    (raw as { narration: string }).narration.trim().length > 0
  );
}

export function isRetentionNarrationFirstProposal(
  raw: unknown,
): raw is RetentionNarrationFirstProposal {
  return isNarrationFirstRecord(raw);
}

export function validateRetentionNarrationFirstProposal(input: {
  readonly raw: unknown;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
  readonly userWrittenHookAccepted?: boolean;
}): RetentionNarrationFirstProposal {
  const accepted = evaluateRetentionCanonicalNarrationAcceptance(input);
  if (accepted.decision !== "accept" || accepted.proposal == null) {
    throwRejected(
      accepted.stage ?? "malformed_composer_proposal",
      accepted.textualRepairEligible
        ? "Canonical narration requires one targeted textual repair."
        : "Canonical narration acceptance rejected the spoken proposal.",
    );
  }
  return accepted.proposal;
}
