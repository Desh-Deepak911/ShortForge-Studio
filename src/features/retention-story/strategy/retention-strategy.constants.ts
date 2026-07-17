/**
 * Retention strategy constants — Sprint 10C.
 * Retention-owned. Do not import Hook constants.
 */

export const RETENTION_STRATEGY_SEED_VERSION = 1 as const;

export const RETENTION_CONTROLLING_IDEA_REGISTRY_VERSION =
  "retention-controlling-idea/1" as const;

export const RETENTION_EMOTION_STRATEGY_REGISTRY_VERSION =
  "retention-emotion-strategy/1" as const;

export const RETENTION_STRATEGY_SEED_FINGERPRINT_PREFIX = "rss:" as const;
export const RETENTION_EMOTION_BLUEPRINT_FINGERPRINT_PREFIX = "reb:" as const;
export const RETENTION_CONTROLLING_IDEA_CANDIDATE_ID_PREFIX = "rici:" as const;

/** Controlling-idea statement bounds (hard reject outside). */
export const RETENTION_MAX_CONTROLLING_IDEA_CHARS = 180;
export const RETENTION_MAX_CONTROLLING_IDEA_WORDS = 28;
export const RETENTION_MIN_CONTROLLING_IDEA_WORDS = 4;

export const RETENTION_MAX_CONTROLLING_IDEA_CANDIDATES = 12;
export const RETENTION_MAX_CONTROLLING_IDEA_CLAIM_REFS = 4;

/** Prompt/planning labels that must not appear in a controlling idea. */
export const RETENTION_CONTROLLING_IDEA_FORBIDDEN_LABELS = Object.freeze([
  "controlling idea",
  "emotional arc",
  "beat plan",
  "hook strategy",
  "system prompt",
  "chain of thought",
  "chain-of-thought",
  "narration candidate",
  "retention story plan",
] as const);

/** Generic introductions that cannot be a controlling idea. */
export const RETENTION_CONTROLLING_IDEA_GENERIC_INTROS = Object.freeze([
  "in this video",
  "today we will",
  "today we'll",
  "let's talk about",
  "welcome back",
  "hey guys",
  "in today's video",
  "this video is about",
] as const);
