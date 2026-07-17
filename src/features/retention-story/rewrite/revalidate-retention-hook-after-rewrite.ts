/**
 * Pure post-rewrite Hook revalidation — Sprint 10F.2 / 10F.2A.
 * No Hook repair, fallback, opening replacement, strategy reselection, or model calls.
 */

import { buildHookCandidate } from "@/features/hook-engine/validation/build-hook-candidate";
import { validateHookCandidate } from "@/features/hook-engine/validation/validate-hook-candidate";

import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionApprovedOpeningAuthority } from "./retention-rewrite.types";
import type {
  RetentionPostRewriteHookEvidence,
  RetentionTerminalHookAuthority,
} from "./retention-terminal-hook-authority.types";
import { assertExactApprovedOpeningPreserved } from "./reconcile-retention-candidate-after-body-rewrite";

export interface RevalidateRetentionHookAfterRewriteResult {
  readonly ok: true;
  readonly openingText: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
  readonly evidence: RetentionPostRewriteHookEvidence;
}

/**
 * Revalidate rewritten narration against the actual active terminal Hook plan.
 * Returns canonical rebuilt Hook candidate + recomputed validation evidence.
 */
export function revalidateRetentionHookAfterRewrite(input: {
  readonly narration: string;
  readonly terminalHookAuthority: RetentionTerminalHookAuthority;
  readonly approvedOpening: RetentionApprovedOpeningAuthority;
  readonly candidate: RetentionNarrationCandidate;
}): RevalidateRetentionHookAfterRewriteResult {
  const { terminalHookAuthority: authority, approvedOpening } = input;

  assertExactApprovedOpeningPreserved(input.narration, approvedOpening);

  if (
    authority.request.requestFingerprint !==
    authority.activePlan.requestFingerprint
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook authority request/plan fingerprint mismatch.",
    );
  }

  // Must revalidate against the active terminal plan (fallback-aware).
  if (
    authority.validation.planFingerprint !==
    authority.activePlan.planFingerprint
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook authority validation plan does not match active plan.",
    );
  }

  if (
    authority.approvedCandidate.planFingerprint !==
    authority.activePlan.planFingerprint
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook authority candidate plan does not match active plan.",
    );
  }

  let hookCandidate;
  try {
    hookCandidate = buildHookCandidate({
      narration: input.narration,
      request: authority.request,
      plan: authority.activePlan,
      origin: "post_retention_body_rewrite",
      claimRefs: authority.openingClaimRefs,
    });
  } catch {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook candidate construction failed.",
    );
  }

  if (hookCandidate.openingText !== approvedOpening.openingText) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook opening text does not match approved opening.",
    );
  }
  if (hookCandidate.openingStartOffset !== approvedOpening.openingStartOffset) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook opening start offset changed.",
    );
  }
  if (hookCandidate.openingEndOffset !== approvedOpening.openingEndOffset) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook opening end offset changed.",
    );
  }
  if (
    input.narration.slice(
      approvedOpening.openingStartOffset,
      approvedOpening.openingEndOffset,
    ) !== approvedOpening.openingText
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite narration opening slice mismatch.",
    );
  }

  const validation = validateHookCandidate({
    request: authority.request,
    plan: authority.activePlan,
    candidate: hookCandidate,
    repairBoundExceeded: true,
  });

  if (!validation.ok) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook validation failed.",
    );
  }
  if (
    !validation.hardGatesPassed.grounding ||
    !validation.hardGatesPassed.safety
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook hard gates failed.",
    );
  }
  if (
    !validation.strategyThresholdsPassed.provocativeness ||
    !validation.strategyThresholdsPassed.clarity
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook thresholds failed.",
    );
  }
  if (
    !validation.openingLimitsPassed.wordLimit ||
    !validation.openingLimitsPassed.spokenDurationLimit
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook opening limits failed.",
    );
  }
  if (validation.planFingerprint !== authority.activePlan.planFingerprint) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook validation used the wrong active plan.",
    );
  }
  if (validation.candidateId !== hookCandidate.candidateId) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Post-rewrite Hook validation candidate identity mismatch.",
    );
  }

  return Object.freeze({
    ok: true as const,
    openingText: hookCandidate.openingText,
    openingStartOffset: hookCandidate.openingStartOffset,
    openingEndOffset: hookCandidate.openingEndOffset,
    evidence: Object.freeze({
      rebuiltCandidate: hookCandidate,
      validation: Object.freeze({ ...validation }),
    }),
  });
}
