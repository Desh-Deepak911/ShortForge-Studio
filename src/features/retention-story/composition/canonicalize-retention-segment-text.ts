/**
 * Canonical Retention segment-text normalizer — Sprint 10E.1.
 *
 * Fail-closed: no silent truncation, no non-canonical whitespace retention.
 */

import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import { retentionBeatTextHasForbiddenMarker } from "../planning/retention-beat-semantics";
import { RETENTION_MAX_SEGMENT_TEXT_CHARS } from "./retention-narration-candidate.constants";

/**
 * Return canonical segment text, or null when the input is non-canonical / unsafe.
 */
export function canonicalizeRetentionSegmentText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const nfcCollapsed = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!nfcCollapsed) return null;
  if (nfcCollapsed.length > RETENTION_MAX_SEGMENT_TEXT_CHARS) return null;
  // Reject silent truncation — sanitize must be an identity on canonical input.
  const sanitized = sanitizeRetentionText(
    raw,
    RETENTION_MAX_SEGMENT_TEXT_CHARS,
  );
  if (sanitized !== nfcCollapsed) return null;
  if (retentionBeatTextHasForbiddenMarker(sanitized)) return null;
  return sanitized;
}
