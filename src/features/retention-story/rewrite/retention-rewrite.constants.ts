/**
 * Retention Studio body-rewrite constants — Sprint 10F.2.
 */

export const RETENTION_REWRITE_VERSION = 1 as const;

export const RETENTION_REWRITE_TERMINAL_STATES = Object.freeze([
  "pass_without_rewrite",
  "pass_after_rewrite",
  "skipped_scenes_only",
  "rewrite_not_allowed",
  "rewrite_unavailable",
  "rewrite_call_failed",
  "rewrite_proposal_invalid",
  "opening_preservation_failed",
  "length_enforcement_failed",
  "post_rewrite_hook_failed",
  "post_rewrite_retention_failed",
  "ledger_invalid",
] as const);
