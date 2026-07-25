/**
 * Immutable allowlists for progressive diagnostic attribution fields.
 * Unknown / provider-shaped values become null — never sliced or regex-accepted.
 */

import { HEADLESS_PG_SQLSTATE } from "@/features/headless-renderer/control-plane/runtime/map-database-failure";

/** Stable control-plane / preflight codes permitted in progressive evidence. */
export const PROGRESSIVE_SAFE_CONTROL_PLANE_CODES = Object.freeze([
  "CONFIGURATION_UNAVAILABLE",
  "UNAUTHENTICATED",
  "AUTHENTICATION_FAILED",
  "FORBIDDEN",
  "INVALID_TRANSPORT",
  "UNKNOWN_FIELD",
  "BODY_TOO_LARGE",
  "MANIFEST_NOT_FOUND",
  "MANIFEST_DIGEST_MISMATCH",
  "MANIFEST_EXPIRED",
  "MANIFEST_TOO_LARGE",
  "MANIFEST_MALFORMED",
  "BUNDLE_NOT_FOUND",
  "BUNDLE_FINGERPRINT_MISMATCH",
  "BUNDLE_EXPIRED",
  "OBJECT_OWNERSHIP_MISMATCH",
  "REMOTE_FETCH_FORBIDDEN",
  "IDEMPOTENCY_CONFLICT",
  "JOB_NOT_FOUND",
  "STALE_TRANSITION",
  "TERMINAL_IMMUTABLE",
  "CANCEL_REJECTED",
  "CLAIM_REJECTED",
  "HOSTILE_INPUT",
  "INTERNAL_ERROR",
  "ASSET_NOT_FOUND",
  "ASSET_PURPOSE_MISMATCH",
  "ASSET_DIGEST_MISMATCH",
  "ASSET_LENGTH_MISMATCH",
  "ASSET_MIME_MISMATCH",
  "ASSET_LOCATOR_MISMATCH",
  "ASSET_EXPIRED",
  "ASSET_LEASE_INSUFFICIENT",
  "ASSET_BYTES_OVERFLOW",
  "ASSET_EXPIRY_MISMATCH",
  "ASSET_EXPIRY_UNSAFE",
  "ASSET_LEASE_OVERFLOW",
  "OBJECT_INTEGRITY_FAILED",
  "JOB_STORE_COHERENCE_REJECTED",
  "DATABASE_UNAVAILABLE",
  "QUEUE_ENQUEUE_FAILED",
  "DISPATCH_RECOVERY_REJECTED",
  "OPERATION_ABORTED",
  "ARTIFACT_CLEANUP_UNCONFIRMED",
  "SCHEMA_MISSING",
  "SCHEMA_DRIFT",
  "SCHEMA_INCOHERENT",
] as const);

export type ProgressiveSafeControlPlaneCode =
  (typeof PROGRESSIVE_SAFE_CONTROL_PLANE_CODES)[number];

const CONTROL_PLANE_SET = new Set<string>(PROGRESSIVE_SAFE_CONTROL_PLANE_CODES);

/** Repository-owned constraint / unique-index names only. */
export const PROGRESSIVE_SAFE_CONSTRAINT_IDS = Object.freeze([
  "headless_schema_migrations_pkey",
  "headless_schema_migrations_id_nonempty",
  "headless_schema_migrations_checksum_format",
  "headless_schema_migrations_applied_at_ms_nonneg",
  "headless_project_ownership_pkey",
  "headless_project_ownership_project_owner_unique",
  "headless_project_ownership_project_id_nonempty",
  "headless_project_ownership_project_id_uuid_v4",
  "headless_project_ownership_owner_id_nonempty",
  "headless_project_ownership_created_at_ms_nonneg",
  "headless_jobs_pkey",
  "headless_jobs_job_id_nonempty",
  "headless_jobs_owner_id_nonempty",
  "headless_jobs_project_id_nonempty",
  "headless_jobs_operation_id_nonempty",
  "headless_jobs_idempotency_key_format",
  "headless_jobs_store_version_positive",
  "headless_jobs_timestamps_nonneg",
  "headless_jobs_stage_valid",
  "headless_jobs_provisional_state_valid",
  "headless_jobs_canonical_state_valid",
  "headless_jobs_canonical_state_matches_json",
  "headless_jobs_provisional_payload_only",
  "headless_jobs_canonical_payload_required",
  "headless_jobs_provisional_requested_output",
  "headless_jobs_canonical_no_provisional_columns",
  "headless_jobs_render_claim_paired",
  "headless_jobs_verification_claim_paired",
  "headless_jobs_provisional_no_render_claim",
  "headless_jobs_binding_state_rules",
  "headless_jobs_provisional_terminal_reason",
  "headless_jobs_fk_project_owner",
  "uidx_headless_jobs_idempotency_authority",
] as const);

export type ProgressiveSafeConstraintId =
  (typeof PROGRESSIVE_SAFE_CONSTRAINT_IDS)[number];

const CONSTRAINT_SET = new Set<string>(PROGRESSIVE_SAFE_CONSTRAINT_IDS);

/** Exact SQLSTATE values from bounded PostgreSQL mapping policy. */
export const PROGRESSIVE_SAFE_SQLSTATES = Object.freeze(
  Object.values(HEADLESS_PG_SQLSTATE),
);

const SQLSTATE_SET = new Set<string>(PROGRESSIVE_SAFE_SQLSTATES);

const UNSAFE_FIELD_RE = /[\0-\x08\x0a-\x1f\x7f`<>|\\]|password|secret|postgresql:\/\/|DATABASE_URL/i;

function isSafeToken(value: string, maxLen: number): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > maxLen) return false;
  if (UNSAFE_FIELD_RE.test(value)) return false;
  return true;
}

export function sanitizeProgressiveControlPlaneCode(
  value: unknown,
): ProgressiveSafeControlPlaneCode | null {
  if (typeof value !== "string") return null;
  if (!isSafeToken(value, 64)) return null;
  return CONTROL_PLANE_SET.has(value)
    ? (value as ProgressiveSafeControlPlaneCode)
    : null;
}

export function sanitizeProgressiveConstraintId(
  value: unknown,
): ProgressiveSafeConstraintId | null {
  if (typeof value !== "string") return null;
  if (!isSafeToken(value, 128)) return null;
  return CONSTRAINT_SET.has(value)
    ? (value as ProgressiveSafeConstraintId)
    : null;
}

export function sanitizeProgressiveSqlState(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!isSafeToken(value, 5)) return null;
  return SQLSTATE_SET.has(value) ? value : null;
}

export function isSafeProgressiveMarkdownToken(value: string): boolean {
  return isSafeToken(value, 128);
}
