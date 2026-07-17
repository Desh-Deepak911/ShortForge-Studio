/**
 * Hook Engine contract constants — Sprint 7B.1.
 */

import type { HookContractVersion, HookStrategyId } from "./hook-contract.types";

export const HOOK_CONTRACT_VERSION = "hook-contract/1" as const satisfies HookContractVersion;

export const HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID =
  "compatibility_punchy" as const satisfies HookStrategyId;

export const HOOK_USER_DIRECTED_STRATEGY_ID = "user_directed" as const satisfies HookStrategyId;

export const HOOK_EVIDENCE_SURPRISE_STRATEGY_ID =
  "evidence_surprise" as const satisfies HookStrategyId;

export const HOOK_REQUEST_FINGERPRINT_PREFIX = "hr:" as const;
export const HOOK_PLAN_FINGERPRINT_PREFIX = "hp:" as const;

/** Default duration (seconds) when normalizing incomplete adapter input. */
export const HOOK_DEFAULT_DURATION_SECONDS = 30;

/** Supported project duration range (seconds), aligned with studio narration budgets. */
export const HOOK_MIN_DURATION_SECONDS = 15;
export const HOOK_MAX_DURATION_SECONDS = 60;

/**
 * Deterministic speaking-rate rule for opening constraint pairs.
 * Matches product narration pacing (`NARRATION_WORDS_PER_SECOND`).
 */
export const HOOK_SPEAKING_WORDS_PER_SECOND = 2.4;

/** Safe maximum length for sanitized opening-style advisory text. */
export const HOOK_MAX_OPENING_STYLE_ADVISORY_CHARS = 280;

/** Safe maximum length for sanitized user-authored hook text. */
export const HOOK_MAX_USER_AUTHORED_HOOK_CHARS = 200;

/**
 * Write My Own opening word maximum (Sprint 7E.6A).
 * Aligns with default strategy `maxOpeningWords` (5).
 */
export const HOOK_MAX_USER_AUTHORED_HOOK_WORDS = 5;

/** Safe maximum length for claim IDs and claim text. */
export const HOOK_MAX_CLAIM_ID_CHARS = 64;
export const HOOK_MAX_CLAIM_TEXT_CHARS = 400;

/** Explicit Prompt Intelligence opening intention for evidence-led hooks. */
export const HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE = "evidence_led_surprise" as const;
