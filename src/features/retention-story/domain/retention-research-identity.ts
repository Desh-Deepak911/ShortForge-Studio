/**
 * Opaque Retention research identity validation — Sprint 10B.1A / 10B.1B.
 * Format: rsr:<1–7 lowercase base36 digits> (32-bit FNV-1a). Never echo raw values in errors.
 */

import {
  RETENTION_MAX_RESEARCH_IDENTITY_CHARS,
  RETENTION_RESEARCH_IDENTITY_PATTERN,
} from "./retention-story-contract.constants";
import { RetentionStoryError } from "./retention-story-errors";

/**
 * Strict opaque research-identity check (no whitespace collapse, no truncation).
 * Returns the validated identity string.
 */
export function assertRetentionResearchIdentity(
  raw: unknown,
): string {
  if (typeof raw !== "string") {
    throw new RetentionStoryError(
      "invalid_research_identity",
      "Research identity must be a Retention semantic identity string.",
    );
  }
  if (raw.length === 0 || raw.length > RETENTION_MAX_RESEARCH_IDENTITY_CHARS) {
    throw new RetentionStoryError(
      "invalid_research_identity",
      "Research identity length is outside the allowed Retention bounds.",
    );
  }
  if (/\s/.test(raw) || raw !== raw.trim()) {
    throw new RetentionStoryError(
      "invalid_research_identity",
      "Research identity must not contain whitespace.",
    );
  }
  if (!RETENTION_RESEARCH_IDENTITY_PATTERN.test(raw)) {
    throw new RetentionStoryError(
      "invalid_research_identity",
      "Research identity does not match the Retention opaque identity format.",
    );
  }
  return raw;
}

/** True when value is a well-formed Retention opaque research identity. */
export function isRetentionResearchIdentity(raw: unknown): raw is string {
  try {
    assertRetentionResearchIdentity(raw);
    return true;
  } catch {
    return false;
  }
}
