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
/** Legacy planner/avoidance bound. Composer inclusion is adaptive, not this cap. */
export const RETENTION_MAX_COMPOSER_REQUEST_CLAIMS = 8;
/** Hard safety bound so ranking/participants cannot vanish from an arbitrary 8-cap. */
export const RETENTION_MAX_COMPOSER_REQUEST_CLAIMS_HARD = 24;
export const RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_ULTRA_SHORT = 2_800;
export const RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_SHORT = 4_500;
export const RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_EXTENDED = 7_000;
