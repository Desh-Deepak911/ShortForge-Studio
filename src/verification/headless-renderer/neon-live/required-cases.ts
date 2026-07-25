/**
 * Immutable canonical registry of required Neon live case IDs.
 * Live PASS authority is exact membership — not “some cases passed”.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { NeonLiveCaseEvidence, NeonLiveCaseStatus } from "./evidence";

export const REQUIRED_NEON_LIVE_CASE_IDS = Object.freeze([
  "ownership.first_claim",
  "ownership.same_owner_access",
  "ownership.cross_owner_denied",
  "job.provisional_create",
  "job.idempotent_replay",
  "job.semantic_conflict",
  "job.pk_collision_savepoint",
  "job.provisional_cas_staging",
  "job.verification_coverage",
  "job.promote_atomic",
  "job.already_promoted_replay",
  "job.forged_job_fingerprint_rejected",
  "job.forged_request_fingerprint_rejected",
  "job.forged_operation_lineage_rejected",
  "job.forged_profile_build_rejected",
  "job.queue_listing",
  "job.claim_race",
  "job.stale_cas",
  "job.terminal_immutability",
  "job.recovery_live_claim_not_stolen",
  "job.recovery_expired_claim",
  "job.recovery_store_authority",
  "job.recovery_old_token_rejected",
  "job.recovery_terminal_rejected",
  "job.recovery_concurrent_one_winner",
  "job.recovery_cross_owner_rejected",
  "job.bigint_decoding",
  "job.cross_owner_read_rejected",
  "job.malformed_json_fail_closed",
] as const);

export type RequiredNeonLiveCaseId =
  (typeof REQUIRED_NEON_LIVE_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_NEON_LIVE_CASE_IDS);

/** Bounded failure categories permitted on FAIL case evidence. */
export const NEON_LIVE_FAILURE_CATEGORIES = Object.freeze([
  "CLAIM_FAILED",
  "ACCESS_FAILED",
  "CROSS_OWNER_NOT_FORBIDDEN",
  "PROVISIONAL_CREATE_FAILED",
  "REPLAY_FAILED",
  "SEMANTIC_CONFLICT_FAILED",
  "PK_COLLISION_FAILED",
  "PK_COLLISION_TX_UNUSABLE",
  "EMPTY_STAGING_CREATE_FAILED",
  "STAGING_APPEND_FAILED",
  "STAGING_CAS_FAILED",
  "COVERAGE_INCOMPLETE",
  "COVERAGE_CAS_FAILED",
  "PROMOTE_FAILED",
  "ALREADY_PROMOTED_FAILED",
  "FORGED_PROMOTE_NOT_REJECTED",
  "QUEUE_LIST_FAILED",
  "CLAIM_PRECONDITION_FAILED",
  "CLAIM_RACE_FAILED",
  "STALE_PRECONDITION_FAILED",
  "STALE_TRANSITION_BUILD_FAILED",
  "STALE_CAS_FAILED",
  "TERMINAL_PRECONDITION_FAILED",
  "TERMINAL_TRANSITION_BUILD_FAILED",
  "TERMINAL_CAS_FAILED",
  "TERMINAL_LOCK_FAILED",
  "RECOVERY_LIVE_STOLEN",
  "RECOVERY_EXPIRED_FAILED",
  "RECOVERY_STORE_AUTHORITY_FAILED",
  "RECOVERY_OLD_TOKEN_MUTATED",
  "RECOVERY_TERMINAL_NOT_REJECTED",
  "RECOVERY_CONCURRENT_FAILED",
  "RECOVERY_CROSS_OWNER_FAILED",
  "BIGINT_DECODE_FAILED",
  "CROSS_OWNER_READ_FAILED",
  "MALFORMED_NOT_REJECTED",
  "MALFORMED_INSERT_UNAVAILABLE",
  "MATRIX_EXCEPTION",
  "CASE_STEP_EXCEPTION",
  "CASE_SHAPE_INVALID",
  "CASE_MEMBERSHIP_INVALID",
  "SCHEMA_MISSING",
  "SCHEMA_DRIFT",
  "SCHEMA_INCOHERENT",
  "DATABASE_UNAVAILABLE",
  "CLEANUP_FAILED",
  "CLEANUP_VERIFY_FAILED",
  "EVIDENCE_INVALID",
] as const);

export type NeonLiveFailureCategory =
  (typeof NEON_LIVE_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(NEON_LIVE_FAILURE_CATEGORIES);

const CASE_KEYS = Object.freeze(["caseId", "status", "failureCategory"] as const);

export type LiveCaseAuthorityResult =
  | { readonly ok: true; readonly cases: readonly NeonLiveCaseEvidence[] }
  | { readonly ok: false; readonly code: NeonLiveFailureCategory; readonly message: string };

function isPlainCaseObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

/**
 * Validate exact-key, hostile-safe case evidence shape.
 */
export function validateNeonLiveCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: NeonLiveCaseEvidence }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile case evidence rejected." };
    }
    if (!isPlainCaseObject(value)) {
      return { ok: false, message: "Case evidence must be a plain object." };
    }
    const keys = Object.keys(value).sort();
    const allowed = new Set<string>(CASE_KEYS);
    for (const key of keys) {
      if (!allowed.has(key)) {
        return { ok: false, message: "Case evidence has unknown key." };
      }
    }
    if (typeof value.caseId !== "string" || value.caseId.length === 0) {
      return { ok: false, message: "caseId must be a non-empty string." };
    }
    if (value.caseId.length > 128) {
      return { ok: false, message: "caseId exceeds bound." };
    }
    if (
      value.status !== "PASS" &&
      value.status !== "FAIL" &&
      value.status !== "NOT_TESTED"
    ) {
      return { ok: false, message: "status is not a bounded case status." };
    }
    if (value.failureCategory !== undefined) {
      if (typeof value.failureCategory !== "string") {
        return { ok: false, message: "failureCategory must be a string." };
      }
      if (!FAILURE_SET.has(value.failureCategory)) {
        return { ok: false, message: "failureCategory is not allowlisted." };
      }
    }
    if (value.status === "FAIL" && value.failureCategory === undefined) {
      return { ok: false, message: "FAIL cases require failureCategory." };
    }
    if (value.status === "PASS" && value.failureCategory !== undefined) {
      return { ok: false, message: "PASS cases must not carry failureCategory." };
    }
    const shaped: NeonLiveCaseEvidence = {
      caseId: value.caseId,
      status: value.status as NeonLiveCaseStatus,
      ...(value.failureCategory !== undefined
        ? { failureCategory: value.failureCategory as NeonLiveFailureCategory }
        : {}),
    };
    return { ok: true, case: shaped };
  } catch {
    return { ok: false, message: "Hostile case evidence rejected." };
  }
}

/**
 * Exact required membership + shape + all PASS.
 * Replaces weak `cases.length > 0 && every(PASS)`.
 */
export function assertExactRequiredLiveCasePassAuthority(
  cases: unknown,
): LiveCaseAuthorityResult {
  if (!Array.isArray(cases)) {
    return {
      ok: false,
      code: "CASE_SHAPE_INVALID",
      message: "Live cases must be an array.",
    };
  }
  if (cases.length !== REQUIRED_NEON_LIVE_CASE_IDS.length) {
    return {
      ok: false,
      code: "CASE_MEMBERSHIP_INVALID",
      message: "Live case count does not match required registry.",
    };
  }

  const seen = new Set<string>();
  const normalized: NeonLiveCaseEvidence[] = [];
  for (const raw of cases) {
    const shaped = validateNeonLiveCaseEvidenceShape(raw);
    if (!shaped.ok) {
      return {
        ok: false,
        code: "CASE_SHAPE_INVALID",
        message: shaped.message,
      };
    }
    if (seen.has(shaped.case.caseId)) {
      return {
        ok: false,
        code: "CASE_MEMBERSHIP_INVALID",
        message: "Duplicate live case ID.",
      };
    }
    seen.add(shaped.case.caseId);
    if (!REQUIRED_SET.has(shaped.case.caseId)) {
      return {
        ok: false,
        code: "CASE_MEMBERSHIP_INVALID",
        message: "Unknown live case ID.",
      };
    }
    if (shaped.case.status !== "PASS") {
      return {
        ok: false,
        code: "CASE_MEMBERSHIP_INVALID",
        message: "Required live case is not PASS.",
      };
    }
    normalized.push(shaped.case);
  }

  for (const required of REQUIRED_NEON_LIVE_CASE_IDS) {
    if (!seen.has(required)) {
      return {
        ok: false,
        code: "CASE_MEMBERSHIP_INVALID",
        message: "Required live case is missing.",
      };
    }
  }

  // Order-independent: rebuild in registry order for evidence stability.
  const byId = new Map(normalized.map((c) => [c.caseId, c]));
  const ordered = REQUIRED_NEON_LIVE_CASE_IDS.map((id) => byId.get(id)!);
  return { ok: true, cases: ordered };
}

export function createExactPassCaseResults(): readonly NeonLiveCaseEvidence[] {
  return REQUIRED_NEON_LIVE_CASE_IDS.map((caseId) => ({
    caseId,
    status: "PASS" as const,
  }));
}

export type LiveCasePrefixFailAuthorityResult =
  | {
      readonly ok: true;
      readonly cases: readonly NeonLiveCaseEvidence[];
      readonly failedCaseId: RequiredNeonLiveCaseId;
      readonly lastCompletedRequiredCase: RequiredNeonLiveCaseId | null;
    }
  | { readonly ok: false; readonly code: NeonLiveFailureCategory; readonly message: string };

/**
 * Canonical stop-on-first-fail prefix: zero or more PASS required cases,
 * then exactly one FAIL required case; nothing after. Registry order exact.
 */
export function assertExactRequiredLiveCasePrefixFailAuthority(
  cases: unknown,
): LiveCasePrefixFailAuthorityResult {
  if (!Array.isArray(cases)) {
    return {
      ok: false,
      code: "CASE_SHAPE_INVALID",
      message: "Live cases must be an array.",
    };
  }
  if (cases.length === 0) {
    return {
      ok: false,
      code: "CASE_MEMBERSHIP_INVALID",
      message: "Prefix-FAIL requires at least one recorded required case.",
    };
  }
  if (cases.length > REQUIRED_NEON_LIVE_CASE_IDS.length) {
    return {
      ok: false,
      code: "CASE_MEMBERSHIP_INVALID",
      message: "Prefix-FAIL exceeds required registry length.",
    };
  }

  const normalized: NeonLiveCaseEvidence[] = [];
  for (let i = 0; i < cases.length; i++) {
    const shaped = validateNeonLiveCaseEvidenceShape(cases[i]);
    if (!shaped.ok) {
      return {
        ok: false,
        code: "CASE_SHAPE_INVALID",
        message: shaped.message,
      };
    }
    const expectedId = REQUIRED_NEON_LIVE_CASE_IDS[i];
    if (expectedId == null || shaped.case.caseId !== expectedId) {
      return {
        ok: false,
        code: "CASE_MEMBERSHIP_INVALID",
        message: "Prefix-FAIL case order or membership is invalid.",
      };
    }
    const isLast = i === cases.length - 1;
    if (isLast) {
      if (shaped.case.status !== "FAIL" || shaped.case.failureCategory == null) {
        return {
          ok: false,
          code: "CASE_MEMBERSHIP_INVALID",
          message: "Prefix-FAIL terminal case must be FAIL with category.",
        };
      }
    } else if (shaped.case.status !== "PASS") {
      return {
        ok: false,
        code: "CASE_MEMBERSHIP_INVALID",
        message: "Prefix-FAIL preceding cases must be PASS.",
      };
    }
    normalized.push(shaped.case);
  }

  const failed = normalized[normalized.length - 1]!;
  const lastPass =
    normalized.length >= 2 ? normalized[normalized.length - 2]! : null;
  return {
    ok: true,
    cases: normalized,
    failedCaseId: failed.caseId as RequiredNeonLiveCaseId,
    lastCompletedRequiredCase:
      lastPass != null ? (lastPass.caseId as RequiredNeonLiveCaseId) : null,
  };
}
