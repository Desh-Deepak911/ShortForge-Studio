/**
 * Immutable Retention narration-candidate origin registry — Sprint 10E.1.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionNarrationCandidateOrigin } from "./retention-narration-candidate.types";

export const RETENTION_NARRATION_CANDIDATE_ORIGINS = Object.freeze([
  "initial_compose",
  "after_hook_approval",
  "after_length_enforcement",
  "after_body_rewrite",
  "final",
] as const satisfies readonly RetentionNarrationCandidateOrigin[]);

const ORIGIN_SET: ReadonlySet<string> = new Set(
  RETENTION_NARRATION_CANDIDATE_ORIGINS,
);

export function isRetentionNarrationCandidateOrigin(
  value: unknown,
): value is RetentionNarrationCandidateOrigin {
  return typeof value === "string" && ORIGIN_SET.has(value);
}

export function assertRetentionNarrationCandidateOrigin(
  value: unknown,
): RetentionNarrationCandidateOrigin {
  if (!isRetentionNarrationCandidateOrigin(value)) {
    throw new RetentionStoryError(
      "candidate_fingerprint_mismatch",
      "Retention narration candidate origin is not registered.",
    );
  }
  return value;
}
