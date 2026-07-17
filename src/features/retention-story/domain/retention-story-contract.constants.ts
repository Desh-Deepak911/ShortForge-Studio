/**
 * Retention Story Contract constants — Sprint 10B.
 * Retention-owned. Do not import Hook constants.
 */

export const RETENTION_STORY_CONTRACT_VERSION = "retention-story-contract/1" as const;

export const RETENTION_CONTRACT_FINGERPRINT_PREFIX = "rsc:" as const;
export const RETENTION_RESEARCH_FINGERPRINT_PREFIX = "rsr:" as const;
export const RETENTION_IDENTITY_FINGERPRINT_PREFIX = "rsi:" as const;

/** Production Hook-capable narration envelope (seconds). */
export const RETENTION_MIN_DURATION_SEC = 15;
export const RETENTION_MAX_DURATION_SEC = 60;
export const RETENTION_DEFAULT_DURATION_SEC = 30;

export const RETENTION_MAX_TOPIC_CHARS = 240;
export const RETENTION_MAX_MANUAL_CONTEXT_CHARS = 4_000;
export const RETENTION_MAX_USER_INSTRUCTIONS_CHARS = 2_000;
export const RETENTION_MAX_USER_AUTHORED_HOOK_CHARS = 280;
export const RETENTION_MAX_CLAIM_ID_CHARS = 128;
export const RETENTION_MAX_CLAIM_TEXT_CHARS = 480;
export const RETENTION_MAX_CLAIM_SOURCE_REF_CHARS = 160;
export const RETENTION_MAX_PI_BEAT_ID_CHARS = 64;
export const RETENTION_MAX_PI_FACT_ROLE_CHARS = 96;
export const RETENTION_MAX_GROUNDING_CLAIMS = 64;
export const RETENTION_MAX_RESEARCH_IDENTITY_CHARS = 96;

/**
 * Opaque research identity format produced by Retention FNV-1a → base36:
 * `rsr:` + at most 7 lowercase base36 digits (32-bit digest).
 * Also bounded by RETENTION_MAX_RESEARCH_IDENTITY_CHARS.
 */
export const RETENTION_RESEARCH_IDENTITY_PATTERN = /^rsr:[0-9a-z]{1,7}$/;

export const RETENTION_FORMAT_STRATEGY_REGISTRY_VERSION = "retention-format-strategy/1" as const;
