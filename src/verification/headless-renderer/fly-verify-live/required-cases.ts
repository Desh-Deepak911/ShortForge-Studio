/**
 * Frozen ordered registry — hosted Fly verifier live matrix (2E.2D.7A).
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { FlyVerifyLiveCaseEvidence, FlyVerifyLiveCaseStatus } from "./evidence";

export const REQUIRED_FLY_VERIFY_LIVE_CASE_IDS = Object.freeze([
  "env.config",
  "fly.verify_machine_ready",
  "neon.schema_fingerprint",
  "provisional.create",
  "owned_object.stage",
  "r2.upload_manifest",
  "upstash.enqueue_verify",
  "hosted.verify_claim",
  "hosted.stream_verify",
  "owned_object.finalized",
  "coverage.reconciled",
  "coverage.incomplete",
  "promotion.not_run",
  "render_dispatch.absent",
  "verify_pending_cleared",
  "replay.idempotent",
  "fly.verify_still_healthy",
  "render_machine.absent",
  "cleanup.complete",
  "evidence.privacy",
] as const);

export type RequiredFlyVerifyLiveCaseId =
  (typeof REQUIRED_FLY_VERIFY_LIVE_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_FLY_VERIFY_LIVE_CASE_IDS);

export const FLY_VERIFY_LIVE_FAILURE_CATEGORIES = Object.freeze([
  "ENV_CONFIG_FAILED",
  "FLY_VERIFY_NOT_READY",
  "SCHEMA_FINGERPRINT_FAILED",
  "PROVISIONAL_CREATE_FAILED",
  "OWNED_OBJECT_STAGE_FAILED",
  "R2_UPLOAD_MANIFEST_FAILED",
  "UPSTASH_ENQUEUE_VERIFY_FAILED",
  "HOSTED_VERIFY_CLAIM_FAILED",
  "HOSTED_STREAM_VERIFY_FAILED",
  "OWNED_OBJECT_FINALIZED_FAILED",
  "COVERAGE_RECONCILE_FAILED",
  "COVERAGE_INCOMPLETE_FAILED",
  "PROMOTION_RAN_UNEXPECTEDLY",
  "RENDER_DISPATCH_PRESENT",
  "VERIFY_PENDING_NOT_CLEARED",
  "REPLAY_NOT_IDEMPOTENT",
  "FLY_VERIFY_UNHEALTHY",
  "RENDER_MACHINE_PRESENT",
  "CLEANUP_FAILED",
  "EVIDENCE_PRIVACY_FAILED",
  "CASE_SHAPE_INVALID",
  "MATRIX_EXCEPTION",
  "STUB_RUNNERS_REFUSED",
  "HOSTED_POLL_TIMEOUT",
] as const);

export type FlyVerifyLiveFailureCategory =
  (typeof FLY_VERIFY_LIVE_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(FLY_VERIFY_LIVE_FAILURE_CATEGORIES);

export function isRequiredFlyVerifyLiveCaseId(
  value: string,
): value is RequiredFlyVerifyLiveCaseId {
  return REQUIRED_SET.has(value);
}

export function validateFlyVerifyLiveCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: FlyVerifyLiveCaseEvidence }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile case evidence rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Case evidence must be a plain object." };
    }
    const c = value as Record<string, unknown>;
    if (typeof c.caseId !== "string" || !isRequiredFlyVerifyLiveCaseId(c.caseId)) {
      return { ok: false, message: "caseId is not a required fly verify live case." };
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
        status: c.status as FlyVerifyLiveCaseStatus,
      },
    };
  } catch {
    return { ok: false, message: "Hostile case evidence rejected." };
  }
}

export function assertExactRequiredFlyVerifyLiveCasePassAuthority(
  cases: readonly unknown[],
):
  | { readonly ok: true; readonly cases: readonly FlyVerifyLiveCaseEvidence[] }
  | { readonly ok: false; readonly message: string } {
  const byId = new Map<string, FlyVerifyLiveCaseEvidence>();
  for (const raw of cases) {
    const shaped = validateFlyVerifyLiveCaseEvidenceShape(raw);
    if (!shaped.ok) return shaped;
    if (byId.has(shaped.case.caseId)) {
      return { ok: false, message: "Duplicate caseId in evidence." };
    }
    byId.set(shaped.case.caseId, shaped.case);
  }
  if (byId.size !== REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length) {
    return { ok: false, message: "Case registry membership incomplete." };
  }
  const ordered: FlyVerifyLiveCaseEvidence[] = [];
  for (const id of REQUIRED_FLY_VERIFY_LIVE_CASE_IDS) {
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

export function createExactPassFlyVerifyLiveCaseResults(): readonly FlyVerifyLiveCaseEvidence[] {
  return Object.freeze(
    REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.map((caseId) =>
      Object.freeze({ caseId, status: "PASS" as const }),
    ),
  );
}

export function padFlyVerifyLiveCasesAfterFirstFail(
  executed: readonly FlyVerifyLiveCaseEvidence[],
): readonly FlyVerifyLiveCaseEvidence[] {
  const out: FlyVerifyLiveCaseEvidence[] = [...executed];
  const executedIds = new Set(executed.map((c) => c.caseId));
  for (const id of REQUIRED_FLY_VERIFY_LIVE_CASE_IDS) {
    if (executedIds.has(id)) continue;
    out.push({ caseId: id, status: "NOT_TESTED" });
  }
  return Object.freeze(out);
}

/**
 * Prefix-FAIL with NOT_TESTED padding: registry-ordered full length.
 */
export function assertExactRequiredFlyVerifyLiveCasePrefixFailAuthority(
  cases: readonly FlyVerifyLiveCaseEvidence[],
):
  | {
      readonly ok: true;
      readonly failedCaseId: RequiredFlyVerifyLiveCaseId;
      readonly lastCompletedRequiredCase: RequiredFlyVerifyLiveCaseId | null;
    }
  | { readonly ok: false; readonly message: string } {
  if (cases.length !== REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length) {
    return {
      ok: false,
      message: `Prefix-FAIL requires exactly ${REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length} cases.`,
    };
  }
  let failIndex = -1;
  for (let i = 0; i < cases.length; i++) {
    const shaped = validateFlyVerifyLiveCaseEvidenceShape(cases[i]);
    if (!shaped.ok) {
      return { ok: false, message: shaped.message };
    }
    const expectedId = REQUIRED_FLY_VERIFY_LIVE_CASE_IDS[i]!;
    if (shaped.case.caseId !== expectedId) {
      return { ok: false, message: "Prefix-FAIL case order invalid." };
    }
    if (shaped.case.status === "FAIL") {
      if (failIndex >= 0) {
        return { ok: false, message: "Prefix-FAIL allows exactly one FAIL." };
      }
      if (shaped.case.failureCategory == null) {
        return { ok: false, message: "FAIL requires failureCategory." };
      }
      failIndex = i;
      continue;
    }
    if (shaped.case.status === "NOT_TESTED") {
      if (failIndex < 0) {
        return {
          ok: false,
          message: "NOT_TESTED before first FAIL is invalid.",
        };
      }
      continue;
    }
    if (failIndex >= 0) {
      return {
        ok: false,
        message: "PASS after FAIL is invalid in prefix-FAIL authority.",
      };
    }
  }
  if (failIndex < 0) {
    return { ok: false, message: "Prefix-FAIL requires exactly one FAIL." };
  }
  const failedCaseId = REQUIRED_FLY_VERIFY_LIVE_CASE_IDS[failIndex]!;
  const lastCompletedRequiredCase =
    failIndex > 0 ? REQUIRED_FLY_VERIFY_LIVE_CASE_IDS[failIndex - 1]! : null;
  return { ok: true, failedCaseId, lastCompletedRequiredCase };
}
