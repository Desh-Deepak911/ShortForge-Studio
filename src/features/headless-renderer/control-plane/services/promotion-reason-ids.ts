/**
 * Immutable allowlist of Headless promotion diagnostic reason IDs.
 * Never pass through or truncate arbitrary provider/validator messages.
 */

export const HEADLESS_PROMOTION_REASON_IDS = Object.freeze([
  "coverage_incomplete",
  "operation_lineage_mismatch",
  "canonical_pair_invalid",
  "canonical_coherence_invalid",
  "job_identity_mismatch",
  "ownership_mismatch",
  "profile_build_mismatch",
  "snapshot_fingerprint_mismatch",
  "illegal_initial_state",
  "binding_rule_mismatch",
  "timestamp_recoherence_failed",
  "canonical_record_invalid",
  "stale_store_version",
  "already_promoted_mismatch",
  "provisional_not_materializing",
  "promotion_update_failed",
  "promotion_rehydrate_failed",
  "post_write_coherence_failed",
  "dispatch_outbox_ensure_failed",
  "unknown_safe_failure",
] as const);

export type HeadlessPromotionReasonId =
  (typeof HEADLESS_PROMOTION_REASON_IDS)[number];

const REASON_SET = new Set<string>(HEADLESS_PROMOTION_REASON_IDS);

export function sanitizeHeadlessPromotionReasonId(
  value: unknown,
): HeadlessPromotionReasonId | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 64) return null;
  if (/[\0-\x1f\x7f`<>|\\\s]/.test(value)) return null;
  return REASON_SET.has(value) ? (value as HeadlessPromotionReasonId) : null;
}

export function isHeadlessPromotionReasonId(
  value: unknown,
): value is HeadlessPromotionReasonId {
  return sanitizeHeadlessPromotionReasonId(value) != null;
}
