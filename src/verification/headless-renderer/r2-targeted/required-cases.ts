/**
 * Frozen ordered registry of required R2 targeted case IDs (minimum chain).
 * Targeted PASS authority is exact membership — not “some cases passed”.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { R2TargetedCaseEvidence, R2TargetedCaseStatus } from "./evidence";

export const REQUIRED_R2_TARGETED_CASE_IDS = Object.freeze([
  "env.config",
  "staging.same_snapshot_create",
  "upload.put_bytes",
  "metadata.head",
  "verify.finalize",
  "coverage.reconcile",
  "evidence.privacy",
  "cleanup.verify",
] as const);

export type RequiredR2TargetedCaseId =
  (typeof REQUIRED_R2_TARGETED_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_R2_TARGETED_CASE_IDS);

export const R2_TARGETED_FAILURE_CATEGORIES = Object.freeze([
  "ENV_CONFIG_FAILED",
  "STAGING_SAME_SNAPSHOT_FAILED",
  "UPLOAD_PUT_FAILED",
  "METADATA_HEAD_FAILED",
  "VERIFY_FINALIZE_FAILED",
  "COVERAGE_RECONCILE_FAILED",
  "EVIDENCE_PRIVACY_FAILED",
  "CLEANUP_VERIFY_FAILED",
  "CASE_SHAPE_INVALID",
  "MATRIX_EXCEPTION",
] as const);

export type R2TargetedFailureCategory =
  (typeof R2_TARGETED_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(R2_TARGETED_FAILURE_CATEGORIES);

export function isRequiredR2TargetedCaseId(
  value: string,
): value is RequiredR2TargetedCaseId {
  return REQUIRED_SET.has(value);
}

export function validateR2TargetedCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: R2TargetedCaseEvidence }
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
    if (typeof c.caseId !== "string" || !isRequiredR2TargetedCaseId(c.caseId)) {
      return {
        ok: false,
        message: "caseId is not a required R2 targeted case.",
      };
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
        status: c.status as R2TargetedCaseStatus,
      },
    };
  } catch {
    return { ok: false, message: "Hostile case evidence rejected." };
  }
}

export function assertExactRequiredR2TargetedCasePassAuthority(
  cases: readonly unknown[],
):
  | { readonly ok: true; readonly cases: readonly R2TargetedCaseEvidence[] }
  | { readonly ok: false; readonly message: string } {
  const byId = new Map<string, R2TargetedCaseEvidence>();
  for (const raw of cases) {
    const shaped = validateR2TargetedCaseEvidenceShape(raw);
    if (!shaped.ok) return shaped;
    if (byId.has(shaped.case.caseId)) {
      return { ok: false, message: "Duplicate caseId in evidence." };
    }
    byId.set(shaped.case.caseId, shaped.case);
  }
  if (byId.size !== REQUIRED_R2_TARGETED_CASE_IDS.length) {
    return { ok: false, message: "Case registry membership incomplete." };
  }
  const ordered: R2TargetedCaseEvidence[] = [];
  for (const id of REQUIRED_R2_TARGETED_CASE_IDS) {
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

export function createExactPassR2TargetedCaseResults(): readonly R2TargetedCaseEvidence[] {
  return Object.freeze(
    REQUIRED_R2_TARGETED_CASE_IDS.map((caseId) =>
      Object.freeze({ caseId, status: "PASS" as const }),
    ),
  );
}
