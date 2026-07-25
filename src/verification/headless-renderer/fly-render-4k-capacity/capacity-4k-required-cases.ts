/**
 * Sprint 11E Phase 2E.2D.8K — frozen hosted 4K capacity matrix case registry.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { FlyRender4kCapacityCaseEvidence } from "./capacity-4k-evidence";

const SHARED_PREFIX = Object.freeze([
  "env.config",
  "fly.verify_machine_healthy",
  "fly.render_machine_healthy",
  "fly.render_vm_shape",
  "fly.immutable_image_equality",
  "neon.schema_fingerprint",
  "outbox.quiescence",
] as const);

const PROFILE_PATH_SUFFIXES = Object.freeze([
  "job.create_queued",
  "dispatch_outbox.intent",
  "upstash.enqueue_render",
  "hosted.render_claim",
  "hosted.chromium_execution",
  "hosted.ffmpeg_execution",
  "r2.streamed_artifact_upload",
  "owned_object.finalized",
  "artifact.binding_coherence",
  "job.succeeded_cas",
  "artifact.download_verify",
  "replay.idempotent",
  "cleanup.complete",
] as const);

function profileCases(prefix: "4k.webm" | "4k.mp4"): readonly string[] {
  return Object.freeze(
    PROFILE_PATH_SUFFIXES.map((suffix) => `${prefix}.${suffix}`),
  );
}

/** Smallest separately authorized short hosted 4K matrix — both profiles, full path. */
export const REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS = Object.freeze([
  ...SHARED_PREFIX,
  ...profileCases("4k.webm"),
  ...profileCases("4k.mp4"),
  "process_tree.memory_observation",
  "evidence.privacy",
] as const);

export type RequiredFlyRender4kCapacityCaseId =
  (typeof REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS);

export const FLY_RENDER_4K_CAPACITY_FAILURE_CATEGORIES = Object.freeze([
  "ENV_CONFIG_FAILED",
  "FLY_VERIFY_UNHEALTHY",
  "FLY_RENDER_UNHEALTHY",
  "FLY_RENDER_VM_SHAPE_MISMATCH",
  "FLY_IMAGE_MISMATCH",
  "SCHEMA_FINGERPRINT_FAILED",
  "OUTBOX_NOT_QUIESCENT",
  "JOB_CREATE_QUEUED_FAILED",
  "DISPATCH_OUTBOX_INTENT_FAILED",
  "UPSTASH_ENQUEUE_RENDER_FAILED",
  "HOSTED_RENDER_CLAIM_FAILED",
  "HOSTED_CHROMIUM_EXECUTION_FAILED",
  "HOSTED_FFMPEG_EXECUTION_FAILED",
  "R2_STREAMED_UPLOAD_FAILED",
  "OWNED_OBJECT_FINALIZED_FAILED",
  "ARTIFACT_BINDING_INCOHERENT",
  "JOB_SUCCEEDED_CAS_FAILED",
  "ARTIFACT_DOWNLOAD_VERIFY_FAILED",
  "WRONG_DIMENSIONS",
  "WRONG_CODEC_CONTAINER",
  "PRESENTED_720P_AS_4K",
  "REPLAY_NOT_IDEMPOTENT",
  "CLEANUP_FAILED",
  "PROCESS_TREE_MEMORY_INCOMPLETE",
  "NODE_ONLY_RSS_SUBSTITUTION",
  "OOM_OR_RESTART_OBSERVED",
  "INSUFFICIENT_MEMORY_HEADROOM",
  "ONE_FORMAT_PASS_OTHER_FAIL",
  "EVIDENCE_PRIVACY_FAILED",
  "CASE_SHAPE_INVALID",
  "MATRIX_EXCEPTION",
  "HOSTED_POLL_TIMEOUT",
  "GATE_OFF",
  "MISSING_4K_GATE",
  "PRECONTACT_REFUSED",
] as const);

export type FlyRender4kCapacityFailureCategory =
  (typeof FLY_RENDER_4K_CAPACITY_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(FLY_RENDER_4K_CAPACITY_FAILURE_CATEGORIES);

export function isRequiredFlyRender4kCapacityCaseId(
  value: string,
): value is RequiredFlyRender4kCapacityCaseId {
  return REQUIRED_SET.has(value);
}

export function validateFlyRender4kCapacityCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: FlyRender4kCapacityCaseEvidence }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile case evidence rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Case evidence must be a plain object." };
    }
    const c = value as Record<string, unknown>;
    if (
      typeof c.caseId !== "string" ||
      !isRequiredFlyRender4kCapacityCaseId(c.caseId)
    ) {
      return { ok: false, message: "caseId is not a required 4K capacity case." };
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
        status: c.status as FlyRender4kCapacityCaseEvidence["status"],
      },
    };
  } catch {
    return { ok: false, message: "Hostile case evidence rejected." };
  }
}

export function assertExactRequiredFlyRender4kCapacityCasePassAuthority(
  cases: readonly unknown[],
):
  | {
      readonly ok: true;
      readonly cases: readonly FlyRender4kCapacityCaseEvidence[];
    }
  | { readonly ok: false; readonly message: string } {
  const byId = new Map<string, FlyRender4kCapacityCaseEvidence>();
  for (const raw of cases) {
    const shaped = validateFlyRender4kCapacityCaseEvidenceShape(raw);
    if (!shaped.ok) return shaped;
    if (byId.has(shaped.case.caseId)) {
      return { ok: false, message: "Duplicate caseId in evidence." };
    }
    byId.set(shaped.case.caseId, shaped.case);
  }
  if (byId.size !== REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.length) {
    return { ok: false, message: "Case registry membership incomplete." };
  }
  const ordered: FlyRender4kCapacityCaseEvidence[] = [];
  for (const id of REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS) {
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

export function createExactPassFlyRender4kCapacityCaseResults(): readonly FlyRender4kCapacityCaseEvidence[] {
  return Object.freeze(
    REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.map((caseId) =>
      Object.freeze({ caseId, status: "PASS" as const }),
    ),
  );
}

export function countRequiredFlyRender4kCapacityProfileCases(
  _prefix: "4k.webm" | "4k.mp4",
): number {
  return PROFILE_PATH_SUFFIXES.length;
}
