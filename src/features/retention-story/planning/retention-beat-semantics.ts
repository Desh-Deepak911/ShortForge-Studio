/**
 * Retention beat semantic-text sanitization and safety bounds — Sprint 10D.
 * Never echoes creator/planner text in errors. Rejects prompt labels / CoT /
 * system-instruction leakage. Truncation yields canonical (idempotent) text.
 */

import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import { RETENTION_BEAT_FORBIDDEN_LABELS } from "./retention-story-plan.constants";

/** True when text carries a forbidden planning label or instruction-leak marker. */
export function retentionBeatTextHasForbiddenMarker(text: string): boolean {
  const lower = text.toLowerCase();
  for (const label of RETENTION_BEAT_FORBIDDEN_LABELS) {
    if (lower.includes(label)) return true;
  }
  return false;
}

/**
 * Canonicalize beat text: NFC, collapse whitespace, trim, bound by maxChars.
 * The result is idempotent under re-sanitization.
 */
export function sanitizeRetentionBeatText(
  raw: unknown,
  maxChars: number,
): string {
  return sanitizeRetentionText(raw, maxChars);
}

/**
 * Return canonical beat text or null when unusable (empty, non-canonical/over-limit,
 * or containing a forbidden marker). Callers decide whether null is fatal.
 */
export function canonicalRetentionBeatText(
  raw: unknown,
  maxChars: number,
): string | null {
  if (typeof raw !== "string") return null;
  const canonical = sanitizeRetentionBeatText(raw, maxChars);
  if (!canonical) return null;
  // Reject non-canonical input (e.g. over-limit that had to be truncated).
  if (canonical !== raw.normalize("NFC").replace(/\s+/g, " ").trim()) {
    return null;
  }
  if (retentionBeatTextHasForbiddenMarker(canonical)) return null;
  return canonical;
}
