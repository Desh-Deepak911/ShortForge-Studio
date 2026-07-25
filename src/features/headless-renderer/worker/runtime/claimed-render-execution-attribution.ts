/**
 * Sprint 11E Phase 2E.2D.8F — safe claimed-render execution substage attribution.
 * Classifications and bounded limits only — never IDs, tokens, paths, or provider text.
 */

import type { PageWorkspaceAttribution } from "../chromium/page-workspace-attribution";
import {
  pageWorkspaceAttributionToTelemetryFacts,
  sanitizePageWorkspaceAttributionFromTelemetryFacts,
  sanitizePageWorkspaceAttributionSnapshot,
} from "../chromium/page-workspace-attribution";
import { resolvePageFailureReasonForAttributionFacts } from "../chromium/page-workspace-attribution-invariant";
import type { SourceBindingAttributionSnapshot } from "./source-binding-resolution";
import {
  sanitizeSourceBindingAttributionFromTelemetryFacts,
  sanitizeSourceBindingAttributionSnapshot,
  sourceBindingAttributionToTelemetryFacts,
} from "./source-binding-resolution";
import type { HeadlessControlPlaneErrorCode } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import type { HeadlessStoreVersionDeltaClass } from "@/features/headless-renderer/control-plane/services/promotion-attribution";
import type { ClaimCoherenceRejectionId } from "./confirm-durable-claim-coherence";
import type {
  ClaimedRenderExecutionKind,
  ClaimedRenderExecutionPhase,
} from "./execute-claimed-render";
import type { HeadlessWorkerFailureReasonId } from "./worker-types";

function classifyStoreVersionDelta(
  before: number,
  after: number,
): HeadlessStoreVersionDeltaClass {
  if (after === before) return "unchanged";
  if (after === before + 1) return "plus_one";
  return "unexpected";
}

export const CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS = Object.freeze([
  "claimed_delivery_received",
  "durable_claim_reread",
  "claim_coherence",
  "render_request_materialization",
  "source_binding_resolution",
  "storage_resolution",
  "workspace_prepare",
  "chromium_preflight",
  "chromium_launch",
  "browser_context_create",
  "page_create",
  "page_navigation_or_content_load",
  "page_bundle_injection",
  "page_contract_ready",
  "page_request_submit",
  "page_response_wait",
  "page_response_validate",
  "page_cleanup",
  "ffmpeg_preflight",
  "ffmpeg_execution",
  "artifact_upload",
  "artifact_finalize",
  "artifact_binding_validation",
  "succeeded_cas",
  "terminal_failure_cas",
  "cleanup",
] as const);

/** @deprecated Legacy telemetry alias — sanitized to page_contract_ready. */
export const LEGACY_PAGE_EXECUTION_SUBSTAGE = "page_execution" as const;

export type ClaimedRenderExecutionSubstageId =
  (typeof CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS)[number];

export const CLAIMED_RENDER_EXECUTION_REASON_IDS = Object.freeze([
  "claimed_delivery_missing",
  "durable_claim_reread_failed",
  "claim_coherence_rejected",
  "claim_token_mismatch",
  "attempt_mismatch",
  "stale_terminal_claim",
  "render_request_materialization_failed",
  "source_binding_resolution_failed",
  "storage_resolution_failed",
  "workspace_prepare_failed",
  "chromium_preflight_failed",
  "chromium_launch_failed",
  "browser_context_failed",
  "page_create_failed",
  "page_load_failed",
  "page_bundle_injection_failed",
  "page_workspace_attribution_missing",
  "owning_boundary_telemetry_incomplete",
  "page_contract_missing",
  "page_contract_version_mismatch",
  "page_request_rejected",
  "page_runtime_exception",
  "page_bootstrap_manifest_invalid",
  "page_bootstrap_bundle_invalid",
  "page_bootstrap_fingerprint_mismatch",
  "page_bootstrap_slot_mismatch",
  "page_bootstrap_asset_missing",
  "page_bootstrap_asset_incoherent",
  "page_bootstrap_unsupported_schema",
  "page_bootstrap_unsupported_profile",
  "page_bootstrap_renderer_mismatch",
  "page_bootstrap_rejected_unknown",
  "page_timeout",
  "page_response_missing",
  "page_response_invalid",
  "page_cleanup_failed",
  "ffmpeg_preflight_failed",
  "ffmpeg_execution_failed",
  "artifact_upload_failed",
  "artifact_finalize_failed",
  "artifact_binding_validation_failed",
  "succeeded_cas_failed",
  "succeeded_cas_lost",
  "terminal_failure_cas_failed",
  "terminal_failure_cas_unconfirmed",
  "cleanup_scheduled",
  "cleanup_unconfirmed",
  "render_aborted",
  "render_succeeded",
  "render_terminalized_failure",
  "worker_timeout",
  "unsupported_capability",
  "terminal_state_immutable",
  "stale_attempt",
  "ownership_transferred",
] as const);

export type ClaimedRenderExecutionReasonId =
  (typeof CLAIMED_RENDER_EXECUTION_REASON_IDS)[number];

export const EXECUTION_DISPOSITION_KINDS = Object.freeze([
  "succeeded",
  "terminal_failure",
  "aborted",
  "stale_claim",
  "coherence_rejected",
  "upload_finalize_failed",
  "succeeded_cas_lost",
  "cleanup_scheduled",
  "cleanup_unconfirmed",
  "in_progress",
] as const);

export type ExecutionDispositionKind =
  (typeof EXECUTION_DISPOSITION_KINDS)[number];

export const DURABLE_JOB_STATE_CLASSES = Object.freeze([
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading",
  "succeeded",
  "failed",
  "cancelled",
  "terminal_unknown",
  "provisional",
] as const);

export type DurableJobStateClass =
  (typeof DURABLE_JOB_STATE_CLASSES)[number];

export const CLAIM_TOKEN_COHERENCE_CLASSES = Object.freeze([
  "active_match",
  "cleared_after_terminal",
  "mismatch",
  "never_set",
  "not_observed",
] as const);

export type ClaimTokenCoherenceClass =
  (typeof CLAIM_TOKEN_COHERENCE_CLASSES)[number];

export const CLEANUP_SCHEDULED_CLASSES = Object.freeze([
  "not_applicable",
  "scheduled",
  "confirmed",
  "unconfirmed",
  "not_run",
] as const);

export type CleanupScheduledClass =
  (typeof CLEANUP_SCHEDULED_CLASSES)[number];

export const BINARY_COMPONENT_CLASSES = Object.freeze([
  "none",
  "chromium",
  "ffmpeg",
  "ffprobe",
  "workspace",
  "storage",
] as const);

export type BinaryComponentClass =
  (typeof BINARY_COMPONENT_CLASSES)[number];

export const BOUNDED_DURATION_CLASSES = Object.freeze([
  "instant",
  "sub_second",
  "under_5s",
  "under_30s",
  "under_180s",
  "exceeded_poll",
  "not_observed",
] as const);

export type BoundedDurationClass =
  (typeof BOUNDED_DURATION_CLASSES)[number];

export type PageResponseClassification =
  | "not_reached"
  | "missing_api"
  | "rejected"
  | "runtime_exception"
  | "timeout"
  | "missing_payload"
  | "invalid_payload"
  | "valid";

export type FlyRenderClaimedRenderExecutionAttributionSnapshot = {
  readonly executionSubstage: ClaimedRenderExecutionSubstageId;
  readonly dispositionKind: ExecutionDispositionKind;
  readonly safeWorkerCode?: HeadlessWorkerFailureReasonId | HeadlessControlPlaneErrorCode;
  readonly durableJobStateClass: DurableJobStateClass;
  readonly storeVersionDelta?: HeadlessStoreVersionDeltaClass;
  readonly claimTokenCoherenceClass: ClaimTokenCoherenceClass;
  readonly cleanupScheduledClass: CleanupScheduledClass;
  readonly binaryComponentClass: BinaryComponentClass;
  readonly boundedDurationClass: BoundedDurationClass;
  readonly pageFailureReason?: ClaimedRenderExecutionReasonId;
  readonly pageResponseClass?: PageResponseClassification;
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
  readonly sourceBindingAttribution?: SourceBindingAttributionSnapshot;
  readonly primaryExecutionSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasOutcome?: import("./post-frame-failure-containment").SecondaryTerminalCasOutcomeClass;
  readonly terminalCasStoreVersionDelta?: HeadlessStoreVersionDeltaClass;
};

const SUBSTAGE_SET = new Set<string>(CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS);
const REASON_SET = new Set<string>(CLAIMED_RENDER_EXECUTION_REASON_IDS);
const DISPOSITION_SET = new Set<string>(EXECUTION_DISPOSITION_KINDS);
const JOB_STATE_SET = new Set<string>(DURABLE_JOB_STATE_CLASSES);
const CLAIM_COHERENCE_SET = new Set<string>(CLAIM_TOKEN_COHERENCE_CLASSES);
const CLEANUP_SET = new Set<string>(CLEANUP_SCHEDULED_CLASSES);
const BINARY_SET = new Set<string>(BINARY_COMPONENT_CLASSES);
const DURATION_SET = new Set<string>(BOUNDED_DURATION_CLASSES);

const PAGE_RESPONSE_SET = new Set<string>([
  "not_reached",
  "missing_api",
  "rejected",
  "runtime_exception",
  "timeout",
  "missing_payload",
  "invalid_payload",
  "valid",
]);

function normalizeExecutionSubstage(
  substage: string,
): ClaimedRenderExecutionSubstageId | undefined {
  if (substage === LEGACY_PAGE_EXECUTION_SUBSTAGE) {
    return "page_contract_ready";
  }
  if (SUBSTAGE_SET.has(substage)) {
    return substage as ClaimedRenderExecutionSubstageId;
  }
  return undefined;
}

const ALLOWLISTED_WORKER_CODES = new Set<string>([
  "WORKER_FAILED",
  "WORKER_TIMEOUT",
  "UNSUPPORTED_CAPABILITY",
  "CANCELLED_BY_USER",
  "TERMINAL_STATE_IMMUTABLE",
  "STALE_ATTEMPT",
  "CLAIM_LEASE_EXPIRED",
  "WORKSPACE_QUOTA_EXCEEDED",
  "ARTIFACT_CLEANUP_UNCONFIRMED",
  "SUCCEEDED_CAS_REJECTED",
  "SUCCEEDED_CAS_TERMINAL_LOCKED",
  "DATABASE_UNAVAILABLE",
  "JOB_NOT_FOUND",
  "STALE_TRANSITION",
  "CLAIM_REJECTED",
]);

export function classifyDurableJobStateClass(
  state: string | null | undefined,
  stage: "provisional" | "canonical" = "canonical",
): DurableJobStateClass {
  if (stage === "provisional") return "provisional";
  if (state == null) return "terminal_unknown";
  if (JOB_STATE_SET.has(state)) return state as DurableJobStateClass;
  return "terminal_unknown";
}

export function classifyBoundedDurationClass(
  durationMs: number | null | undefined,
): BoundedDurationClass {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "not_observed";
  }
  if (durationMs < 100) return "instant";
  if (durationMs < 1_000) return "sub_second";
  if (durationMs < 5_000) return "under_5s";
  if (durationMs < 30_000) return "under_30s";
  if (durationMs < 180_000) return "under_180s";
  return "exceeded_poll";
}

export function mapExecutionPhaseToSubstage(
  phase: ClaimedRenderExecutionPhase,
  executionSubstage?: ClaimedRenderExecutionSubstageId,
): ClaimedRenderExecutionSubstageId {
  if (executionSubstage != null && SUBSTAGE_SET.has(executionSubstage)) {
    return executionSubstage;
  }
  switch (phase) {
    case "coherence":
      return "claim_coherence";
    case "render":
      return "page_contract_ready";
    case "upload":
      return "artifact_upload";
    case "binding":
      return "artifact_finalize";
    case "succeeded_cas":
      return "succeeded_cas";
    case "cleanup":
      return "cleanup";
    default:
      return "terminal_failure_cas";
  }
}

export function mapWorkerFailureReasonToExecutionReason(
  reasonId: string,
  substage: ClaimedRenderExecutionSubstageId,
): ClaimedRenderExecutionReasonId {
  if (reasonId === "WORKER_TIMEOUT") return "worker_timeout";
  if (reasonId === "UNSUPPORTED_CAPABILITY") return "unsupported_capability";
  if (reasonId === "TERMINAL_STATE_IMMUTABLE") return "terminal_state_immutable";
  if (reasonId === "STALE_ATTEMPT") return "stale_attempt";
  if (reasonId === "CANCELLED_BY_USER") return "render_aborted";
  if (reasonId === "ARTIFACT_CLEANUP_UNCONFIRMED") return "cleanup_unconfirmed";
  switch (substage) {
    case "claim_coherence":
      return "claim_coherence_rejected";
    case "chromium_preflight":
      return "chromium_preflight_failed";
    case "chromium_launch":
      return "chromium_launch_failed";
    case "browser_context_create":
      return "browser_context_failed";
    case "page_create":
      return "page_create_failed";
    case "page_navigation_or_content_load":
      return "page_load_failed";
    case "page_bundle_injection":
      return "page_bundle_injection_failed";
    case "page_contract_ready":
      return "page_contract_missing";
    case "page_request_submit":
      return "page_request_rejected";
    case "page_response_wait":
      return "page_response_missing";
    case "page_response_validate":
      return "page_response_invalid";
    case "page_cleanup":
      return "page_cleanup_failed";
    case "ffmpeg_preflight":
      return "ffmpeg_preflight_failed";
    case "ffmpeg_execution":
      return "ffmpeg_execution_failed";
    case "source_binding_resolution":
      return "source_binding_resolution_failed";
    case "workspace_prepare":
      return "workspace_prepare_failed";
    case "storage_resolution":
      return "storage_resolution_failed";
    case "artifact_upload":
      return "artifact_upload_failed";
    case "artifact_finalize":
      return "artifact_finalize_failed";
    case "artifact_binding_validation":
      return "artifact_binding_validation_failed";
    case "succeeded_cas":
      return "succeeded_cas_failed";
    case "terminal_failure_cas":
      return "terminal_failure_cas_failed";
    case "cleanup":
      return "cleanup_unconfirmed";
    default:
      return "render_terminalized_failure";
  }
}

export function mapClaimCoherenceRejectionToReason(
  rejection: ClaimCoherenceRejectionId,
): ClaimedRenderExecutionReasonId {
  if (rejection === "claim_token_mismatch") return "claim_token_mismatch";
  if (rejection === "attempt_mismatch") return "attempt_mismatch";
  if (rejection === "terminal") return "stale_terminal_claim";
  return "claim_coherence_rejected";
}

export function mapExecutionKindToDisposition(
  kind: ClaimedRenderExecutionKind | string,
): ExecutionDispositionKind {
  switch (kind) {
    case "succeeded":
      return "succeeded";
    case "cancelled":
      return "aborted";
    case "claim_coherence_rejected":
      return "coherence_rejected";
    case "cleanup_unconfirmed":
      return "cleanup_unconfirmed";
    case "preserved_terminal":
    case "ownership_transferred":
      return "stale_claim";
    case "failed":
      return "terminal_failure";
    default:
      return "terminal_failure";
  }
}

export function mapSubstageToBinaryComponent(
  substage: ClaimedRenderExecutionSubstageId,
): BinaryComponentClass {
  if (
    substage === "chromium_preflight" ||
    substage === "chromium_launch" ||
    substage === "browser_context_create" ||
    substage === "page_create" ||
    substage === "page_navigation_or_content_load" ||
    substage === "page_bundle_injection" ||
    substage === "page_contract_ready" ||
    substage === "page_request_submit" ||
    substage === "page_response_wait" ||
    substage === "page_response_validate" ||
    substage === "page_cleanup"
  ) {
    return "chromium";
  }
  if (
    substage === "ffmpeg_preflight" ||
    substage === "ffmpeg_execution"
  ) {
    return "ffmpeg";
  }
  if (substage === "workspace_prepare") return "workspace";
  if (
    substage === "storage_resolution" ||
    substage === "source_binding_resolution" ||
    substage === "artifact_upload" ||
    substage === "artifact_finalize"
  ) {
    return "storage";
  }
  return "none";
}

export function buildClaimedRenderExecutionAttributionSnapshot(input: {
  readonly executionSubstage: ClaimedRenderExecutionSubstageId;
  readonly dispositionKind: ExecutionDispositionKind;
  readonly safeWorkerCode?: string;
  readonly durableJobStateClass: DurableJobStateClass;
  readonly storeVersionBefore?: number;
  readonly storeVersionAfter?: number;
  readonly claimTokenCoherenceClass: ClaimTokenCoherenceClass;
  readonly cleanupScheduledClass?: CleanupScheduledClass;
  readonly boundedDurationMs?: number;
  readonly pageFailureReason?: ClaimedRenderExecutionReasonId;
  readonly pageResponseClass?: PageResponseClassification;
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
  readonly sourceBindingAttribution?: SourceBindingAttributionSnapshot;
  readonly primaryExecutionSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasOutcome?: import("./post-frame-failure-containment").SecondaryTerminalCasOutcomeClass;
  readonly terminalCasStoreVersionDelta?: HeadlessStoreVersionDeltaClass;
}): FlyRenderClaimedRenderExecutionAttributionSnapshot {
  const code =
    input.safeWorkerCode != null &&
    ALLOWLISTED_WORKER_CODES.has(input.safeWorkerCode)
      ? (input.safeWorkerCode as HeadlessWorkerFailureReasonId)
      : undefined;
  const delta =
    input.terminalCasStoreVersionDelta ??
    (input.storeVersionBefore != null && input.storeVersionAfter != null
      ? classifyStoreVersionDelta(
          input.storeVersionBefore,
          input.storeVersionAfter,
        )
      : undefined);
  const attributedSubstage =
    input.primaryExecutionSubstage != null &&
    input.primaryExecutionSubstage !== input.executionSubstage &&
    input.executionSubstage === "terminal_failure_cas"
      ? input.primaryExecutionSubstage
      : input.executionSubstage;
  return Object.freeze({
    executionSubstage: attributedSubstage,
    dispositionKind: input.dispositionKind,
    durableJobStateClass: input.durableJobStateClass,
    claimTokenCoherenceClass: input.claimTokenCoherenceClass,
    cleanupScheduledClass: input.cleanupScheduledClass ?? "not_applicable",
    binaryComponentClass: mapSubstageToBinaryComponent(attributedSubstage),
    boundedDurationClass: classifyBoundedDurationClass(
      input.boundedDurationMs,
    ),
    ...(code != null ? { safeWorkerCode: code } : {}),
    ...(delta != null ? { storeVersionDelta: delta } : {}),
    ...(input.pageFailureReason != null &&
    REASON_SET.has(input.pageFailureReason)
      ? { pageFailureReason: input.pageFailureReason }
      : {}),
    ...(input.pageResponseClass != null &&
    PAGE_RESPONSE_SET.has(input.pageResponseClass)
      ? { pageResponseClass: input.pageResponseClass }
      : {}),
    ...(input.pageWorkspaceAttribution != null
      ? { pageWorkspaceAttribution: input.pageWorkspaceAttribution }
      : {}),
    ...(input.sourceBindingAttribution != null
      ? { sourceBindingAttribution: input.sourceBindingAttribution }
      : {}),
    ...(input.primaryExecutionSubstage != null
      ? { primaryExecutionSubstage: input.primaryExecutionSubstage }
      : {}),
    ...(input.secondaryTerminalCasSubstage != null
      ? { secondaryTerminalCasSubstage: input.secondaryTerminalCasSubstage }
      : {}),
    ...(input.secondaryTerminalCasOutcome != null
      ? { secondaryTerminalCasOutcome: input.secondaryTerminalCasOutcome }
      : {}),
    ...(input.terminalCasStoreVersionDelta != null
      ? { terminalCasStoreVersionDelta: input.terminalCasStoreVersionDelta }
      : {}),
  });
}

export function sanitizeClaimedRenderExecutionAttributionSnapshot(
  value: unknown,
): FlyRenderClaimedRenderExecutionAttributionSnapshot | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (
    !SUBSTAGE_SET.has(String(v.executionSubstage)) &&
    String(v.executionSubstage) !== LEGACY_PAGE_EXECUTION_SUBSTAGE
  ) {
    return undefined;
  }
  const normalizedSubstage = normalizeExecutionSubstage(String(v.executionSubstage));
  if (normalizedSubstage == null) return undefined;
  if (
    !DISPOSITION_SET.has(String(v.dispositionKind)) ||
    !JOB_STATE_SET.has(String(v.durableJobStateClass)) ||
    !CLAIM_COHERENCE_SET.has(String(v.claimTokenCoherenceClass)) ||
    !CLEANUP_SET.has(String(v.cleanupScheduledClass)) ||
    !BINARY_SET.has(String(v.binaryComponentClass)) ||
    !DURATION_SET.has(String(v.boundedDurationClass))
  ) {
    return undefined;
  }
  const code =
    v.safeWorkerCode != null &&
    typeof v.safeWorkerCode === "string" &&
    ALLOWLISTED_WORKER_CODES.has(v.safeWorkerCode)
      ? v.safeWorkerCode
      : undefined;
  const delta = v.storeVersionDelta;
  const deltaOk =
    delta === "unchanged" || delta === "plus_one" || delta === "unexpected"
      ? delta
      : undefined;
  const pageFailureReason =
    v.pageFailureReason != null &&
    typeof v.pageFailureReason === "string" &&
    REASON_SET.has(v.pageFailureReason)
      ? (v.pageFailureReason as ClaimedRenderExecutionReasonId)
      : undefined;
  const pageResponseClass =
    v.pageResponseClass != null &&
    typeof v.pageResponseClass === "string" &&
    PAGE_RESPONSE_SET.has(v.pageResponseClass)
      ? (v.pageResponseClass as PageResponseClassification)
      : undefined;
  const pageWorkspaceAttribution = sanitizePageWorkspaceAttributionSnapshot(
    v.pageWorkspaceAttribution,
  );
  const sourceBindingAttribution = sanitizeSourceBindingAttributionSnapshot(
    v.sourceBindingAttribution,
  );
  const built = buildClaimedRenderExecutionAttributionSnapshot({
    executionSubstage: normalizedSubstage,
    dispositionKind: v.dispositionKind as ExecutionDispositionKind,
    safeWorkerCode: code,
    durableJobStateClass: v.durableJobStateClass as DurableJobStateClass,
    claimTokenCoherenceClass:
      v.claimTokenCoherenceClass as ClaimTokenCoherenceClass,
    cleanupScheduledClass: v.cleanupScheduledClass as CleanupScheduledClass,
    boundedDurationMs: 0,
    pageFailureReason,
    pageResponseClass,
    pageWorkspaceAttribution,
    sourceBindingAttribution,
  });
  return Object.freeze({
    ...built,
    binaryComponentClass: v.binaryComponentClass as BinaryComponentClass,
    boundedDurationClass: v.boundedDurationClass as BoundedDurationClass,
    ...(deltaOk != null ? { storeVersionDelta: deltaOk } : {}),
    ...(pageWorkspaceAttribution != null ? { pageWorkspaceAttribution } : {}),
    ...(sourceBindingAttribution != null ? { sourceBindingAttribution } : {}),
  });
}

export function executionAttributionToSafeTelemetryFacts(
  snapshot: FlyRenderClaimedRenderExecutionAttributionSnapshot,
): Readonly<Record<string, string>> {
  return Object.freeze({
    execution_substage: snapshot.executionSubstage,
    disposition_kind: snapshot.dispositionKind,
    durable_job_state_class: snapshot.durableJobStateClass,
    claim_token_coherence_class: snapshot.claimTokenCoherenceClass,
    cleanup_scheduled_class: snapshot.cleanupScheduledClass,
    binary_component_class: snapshot.binaryComponentClass,
    bounded_duration_class: snapshot.boundedDurationClass,
    ...(snapshot.safeWorkerCode != null
      ? { safe_worker_code: snapshot.safeWorkerCode }
      : {}),
    ...(snapshot.storeVersionDelta != null
      ? { store_version_delta: snapshot.storeVersionDelta }
      : {}),
    ...(snapshot.primaryExecutionSubstage != null
      ? { primary_execution_substage: snapshot.primaryExecutionSubstage }
      : {}),
    ...(snapshot.secondaryTerminalCasSubstage != null
      ? { secondary_terminal_cas_substage: snapshot.secondaryTerminalCasSubstage }
      : {}),
    ...(snapshot.secondaryTerminalCasOutcome != null
      ? { secondary_terminal_cas_outcome: snapshot.secondaryTerminalCasOutcome }
      : {}),
    ...(snapshot.terminalCasStoreVersionDelta != null
      ? { terminal_cas_store_version_delta: snapshot.terminalCasStoreVersionDelta }
      : {}),
    ...(snapshot.pageFailureReason != null
      ? { page_failure_reason: snapshot.pageFailureReason }
      : {}),
    ...(snapshot.pageResponseClass != null
      ? { page_response_class: snapshot.pageResponseClass }
      : {}),
    ...(snapshot.pageWorkspaceAttribution != null
      ? pageWorkspaceAttributionToTelemetryFacts(snapshot.pageWorkspaceAttribution)
      : {}),
    ...(snapshot.sourceBindingAttribution != null
      ? sourceBindingAttributionToTelemetryFacts(snapshot.sourceBindingAttribution)
      : {}),
  });
}

export function buildExecutionAttributionFromClaimedResult(input: {
  readonly result: {
    readonly kind: ClaimedRenderExecutionKind;
    readonly phase: ClaimedRenderExecutionPhase;
    readonly reasonId: string;
    readonly coherenceRejection?: ClaimCoherenceRejectionId | null;
    readonly orphanCleanup?: { readonly status: string } | null;
    readonly succeededCasLost?: boolean;
  };
  readonly executionSubstage?: ClaimedRenderExecutionSubstageId;
  readonly durableJobState: string;
  readonly storeVersionBefore?: number;
  readonly storeVersionAfter?: number;
  readonly claimTokenCoherenceClass?: ClaimTokenCoherenceClass;
  readonly boundedDurationMs?: number;
  readonly pageFailureReason?: ClaimedRenderExecutionReasonId;
  readonly pageResponseClass?: import("../chromium/page-execution-attribution").PageResponseClassification;
  readonly pageWorkspaceAttribution?: PageWorkspaceAttribution;
  readonly sourceBindingAttribution?: SourceBindingAttributionSnapshot;
  readonly primaryExecutionSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasOutcome?: import("./post-frame-failure-containment").SecondaryTerminalCasOutcomeClass;
  readonly terminalCasStoreVersionDelta?: HeadlessStoreVersionDeltaClass;
  readonly storeVersionAtTerminalAttempt?: number;
}): FlyRenderClaimedRenderExecutionAttributionSnapshot {
  const substage = mapExecutionPhaseToSubstage(
    input.result.phase,
    input.executionSubstage,
  );
  let disposition = mapExecutionKindToDisposition(input.result.kind);
  if (input.result.phase === "upload" && input.result.kind === "failed") {
    disposition = "upload_finalize_failed";
  }
  if (input.result.succeededCasLost) {
    disposition = "succeeded_cas_lost";
  }
  if (input.result.orphanCleanup?.status === "scheduled") {
    disposition = "cleanup_scheduled";
  }
  if (input.result.orphanCleanup?.status === "unconfirmed") {
    disposition = "cleanup_unconfirmed";
  }

  let cleanupClass: CleanupScheduledClass = "not_applicable";
  if (input.result.orphanCleanup?.status === "scheduled") {
    cleanupClass = "scheduled";
  } else if (input.result.orphanCleanup?.status === "deleted") {
    cleanupClass = "confirmed";
  } else if (input.result.orphanCleanup?.status === "unconfirmed") {
    cleanupClass = "unconfirmed";
  } else if (substage === "cleanup") {
    cleanupClass = "not_run";
  }

  const terminalCasDelta =
    input.terminalCasStoreVersionDelta ??
    (input.storeVersionAtTerminalAttempt != null &&
    input.storeVersionAfter != null
      ? classifyStoreVersionDelta(
          input.storeVersionAtTerminalAttempt,
          input.storeVersionAfter,
        )
      : undefined);

  const reportedSubstage =
    input.primaryExecutionSubstage != null &&
    substage === "terminal_failure_cas" &&
    input.primaryExecutionSubstage !== "terminal_failure_cas"
      ? input.primaryExecutionSubstage
      : substage;

  return buildClaimedRenderExecutionAttributionSnapshot({
    executionSubstage: reportedSubstage,
    dispositionKind: disposition,
    safeWorkerCode: input.result.reasonId,
    durableJobStateClass: classifyDurableJobStateClass(input.durableJobState),
    storeVersionBefore: input.storeVersionBefore,
    storeVersionAfter: input.storeVersionAfter,
    claimTokenCoherenceClass:
      input.claimTokenCoherenceClass ?? "not_observed",
    cleanupScheduledClass: cleanupClass,
    boundedDurationMs: input.boundedDurationMs,
    pageFailureReason: resolvePageFailureReasonForAttributionFacts({
      executionSubstage: reportedSubstage,
      pageFailureReason: input.pageFailureReason,
      pageWorkspaceAttribution: input.pageWorkspaceAttribution,
    }),
    pageResponseClass: input.pageResponseClass,
    pageWorkspaceAttribution: input.pageWorkspaceAttribution,
    sourceBindingAttribution: input.sourceBindingAttribution,
    primaryExecutionSubstage: input.primaryExecutionSubstage,
    secondaryTerminalCasSubstage: input.secondaryTerminalCasSubstage,
    secondaryTerminalCasOutcome: input.secondaryTerminalCasOutcome,
    terminalCasStoreVersionDelta: terminalCasDelta,
  });
}

export function sanitizeExecutionAttributionFromTelemetryFacts(
  facts: Readonly<Record<string, string | number | boolean | null>> | undefined,
): FlyRenderClaimedRenderExecutionAttributionSnapshot | undefined {
  if (facts == null) return undefined;
  const rawSubstage = facts.execution_substage;
  const substage =
    typeof rawSubstage === "string"
      ? normalizeExecutionSubstage(rawSubstage)
      : undefined;
  if (substage == null) {
    return undefined;
  }
  const pageFailureReason =
    facts.page_failure_reason != null &&
    typeof facts.page_failure_reason === "string" &&
    REASON_SET.has(facts.page_failure_reason)
      ? (facts.page_failure_reason as ClaimedRenderExecutionReasonId)
      : undefined;
  const pageResponseClass =
    facts.page_response_class != null &&
    typeof facts.page_response_class === "string" &&
    PAGE_RESPONSE_SET.has(facts.page_response_class)
      ? (facts.page_response_class as PageResponseClassification)
      : undefined;
  const pageWorkspaceAttribution =
    sanitizePageWorkspaceAttributionFromTelemetryFacts(facts);
  const sourceBindingAttribution =
    sanitizeSourceBindingAttributionFromTelemetryFacts(facts);
  return sanitizeClaimedRenderExecutionAttributionSnapshot({
    executionSubstage: substage,
    dispositionKind: facts.disposition_kind,
    durableJobStateClass: facts.durable_job_state_class,
    claimTokenCoherenceClass: facts.claim_token_coherence_class,
    cleanupScheduledClass: facts.cleanup_scheduled_class,
    binaryComponentClass: facts.binary_component_class,
    boundedDurationClass: facts.bounded_duration_class,
    safeWorkerCode: facts.safe_worker_code,
    storeVersionDelta: facts.store_version_delta,
    pageFailureReason,
    pageResponseClass,
    ...(pageWorkspaceAttribution != null ? { pageWorkspaceAttribution } : {}),
    ...(sourceBindingAttribution != null ? { sourceBindingAttribution } : {}),
  });
}

export function isClaimedRenderExecutionSubstageId(
  value: unknown,
): value is ClaimedRenderExecutionSubstageId {
  return typeof value === "string" && SUBSTAGE_SET.has(value);
}

export function isClaimedRenderExecutionReasonId(
  value: unknown,
): value is ClaimedRenderExecutionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}
