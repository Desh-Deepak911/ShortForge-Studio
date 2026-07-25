/**
 * Immutable canonical registry of required R2 live case IDs.
 * Live PASS authority is exact membership — not “some cases passed”.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { R2LiveCaseEvidence, R2LiveCaseStatus } from "./evidence";

export const REQUIRED_R2_LIVE_CASE_IDS = Object.freeze([
  "env.config",
  "staging.create",
  "upload.capability_issue",
  "upload.put_bytes",
  "metadata.head",
  "verify.conditional_stream",
  "verify.sha256_length_mime",
  "finalize.neon_atomic",
  "coverage.reconcile",
  "replay.idempotent",
  "mutate.precondition_reject",
  "digest.mismatch",
  "length.mismatch",
  "mime.mismatch",
  "expiry.reject",
  "claim.race",
  "claim.stale_reclaim",
  "cross_owner.denied",
  "cleanup.delete",
  "download.artifact_only",
  "evidence.privacy",
] as const);

export type RequiredR2LiveCaseId = (typeof REQUIRED_R2_LIVE_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_R2_LIVE_CASE_IDS);

export const R2_LIVE_FAILURE_CATEGORIES = Object.freeze([
  "ENV_CONFIG_FAILED",
  "STAGING_CREATE_FAILED",
  "UPLOAD_CAPABILITY_FAILED",
  "UPLOAD_PUT_FAILED",
  "METADATA_HEAD_FAILED",
  "CONDITIONAL_STREAM_FAILED",
  "VERIFY_FACTS_FAILED",
  "FINALIZE_FAILED",
  "COVERAGE_RECONCILE_FAILED",
  "REPLAY_FAILED",
  "PRECONDITION_NOT_REJECTED",
  "DIGEST_MISMATCH_FAILED",
  "LENGTH_MISMATCH_FAILED",
  "MIME_MISMATCH_FAILED",
  "EXPIRY_REJECT_FAILED",
  "CLAIM_RACE_FAILED",
  "STALE_RECLAIM_FAILED",
  "CROSS_OWNER_NOT_FORBIDDEN",
  "CLEANUP_FAILED",
  "DOWNLOAD_ARTIFACT_FAILED",
  "EVIDENCE_PRIVACY_FAILED",
  "CASE_SHAPE_INVALID",
  "MATRIX_EXCEPTION",
] as const);

export type R2LiveFailureCategory =
  (typeof R2_LIVE_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(R2_LIVE_FAILURE_CATEGORIES);

export function isRequiredR2LiveCaseId(
  value: string,
): value is RequiredR2LiveCaseId {
  return REQUIRED_SET.has(value);
}

export function validateR2LiveCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: R2LiveCaseEvidence }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile case evidence rejected." };
    }
    if (
      value == null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return { ok: false, message: "Case evidence must be a plain object." };
    }
    const c = value as Record<string, unknown>;
    if (typeof c.caseId !== "string" || !isRequiredR2LiveCaseId(c.caseId)) {
      return { ok: false, message: "caseId is not a required R2 live case." };
    }
    if (
      c.status !== "PASS" &&
      c.status !== "FAIL" &&
      c.status !== "NOT_TESTED"
    ) {
      return { ok: false, message: "status invalid." };
    }
    if (c.status === "FAIL") {
      if (
        typeof c.failureCategory !== "string" ||
        !FAILURE_SET.has(c.failureCategory)
      ) {
        return { ok: false, message: "failureCategory invalid." };
      }
      return {
        ok: true,
        case: {
          caseId: c.caseId,
          status: "FAIL",
          failureCategory: c.failureCategory,
        },
      };
    }
    return {
      ok: true,
      case: {
        caseId: c.caseId,
        status: c.status as R2LiveCaseStatus,
      },
    };
  } catch {
    return { ok: false, message: "Hostile case evidence rejected." };
  }
}

export function assertExactRequiredR2LiveCasePassAuthority(
  cases: readonly unknown[],
):
  | { readonly ok: true; readonly cases: readonly R2LiveCaseEvidence[] }
  | { readonly ok: false; readonly message: string } {
  const byId = new Map<string, R2LiveCaseEvidence>();
  for (const raw of cases) {
    const shaped = validateR2LiveCaseEvidenceShape(raw);
    if (!shaped.ok) return shaped;
    if (byId.has(shaped.case.caseId)) {
      return { ok: false, message: "Duplicate caseId in evidence." };
    }
    byId.set(shaped.case.caseId, shaped.case);
  }
  if (byId.size !== REQUIRED_R2_LIVE_CASE_IDS.length) {
    return { ok: false, message: "Case registry membership incomplete." };
  }
  const ordered: R2LiveCaseEvidence[] = [];
  for (const id of REQUIRED_R2_LIVE_CASE_IDS) {
    const c = byId.get(id);
    if (c == null) {
      return { ok: false, message: `Missing required case ${id}.` };
    }
    if (c.status !== "PASS") {
      return { ok: false, message: `Required case ${id} is not PASS.` };
    }
    ordered.push(c);
  }
  return { ok: true, cases: Object.freeze(ordered) };
}

export function createExactPassR2CaseResults(): readonly R2LiveCaseEvidence[] {
  return Object.freeze(
    REQUIRED_R2_LIVE_CASE_IDS.map((caseId) =>
      Object.freeze({ caseId, status: "PASS" as const }),
    ),
  );
}
