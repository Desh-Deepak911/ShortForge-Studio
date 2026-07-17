/**
 * Retention narration candidate constants — Sprint 10E.
 */

export const RETENTION_NARRATION_CANDIDATE_VERSION = 1 as const;
export const RETENTION_CANDIDATE_FINGERPRINT_PREFIX = "rnc:" as const;

/** Canonical separator between ordered beat segments. */
export const RETENTION_SEGMENT_SEPARATOR = "\n\n" as const;

export const RETENTION_MAX_SEGMENT_TEXT_CHARS = 800;
export const RETENTION_MAX_SEGMENT_CLAIM_REFS = 8;
export const RETENTION_MAX_COMPOSER_TITLE_CHARS = 120;
export const RETENTION_MAX_COMPOSER_REQUEST_CLAIMS = 8;
