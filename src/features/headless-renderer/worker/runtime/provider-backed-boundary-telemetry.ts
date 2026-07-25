/**
 * Sprint 11E Phase 2E.2D.8F.7 — owning-boundary telemetry port.
 * Safe classifications only; never influences execution, CAS, cleanup, or retries.
 */

import {
  pageWorkspaceAttributionToTelemetryFacts,
  sanitizePageWorkspaceAttributionFromTelemetryFacts,
  type PageWorkspaceAttribution,
} from "../chromium/page-workspace-attribution";
import type { HeadlessHostedWorkerEventSink } from "../hosted/hosted-events";
import { emitHostedWorkerEvent } from "../hosted/hosted-events";

export const OWNING_BOUNDARY_EVENT_IDS = Object.freeze([
  "claimed_context_validated",
  "canonical_request_loaded",
  "source_assets_materialization_started",
  "source_assets_materialization_complete",
  "page_workspace_materialization_started",
  "page_workspace_materialization_complete",
  "browser_context_created",
  "page_created",
  "page_navigation_started",
  "page_navigation_complete",
  "page_script_execution_started",
  "page_script_execution_complete",
  "page_contract_observation_started",
  "page_contract_observation_complete",
  "page_bootstrap_started",
  "page_bootstrap_terminal",
  "frame_request_started",
  "frame_request_terminal",
  "chromium_session_cleanup",
  "ffmpeg_preflight_started",
  "ffmpeg_preflight_completed",
  "ffmpeg_process_started",
  "ffmpeg_input_completed",
  "ffmpeg_process_terminal",
  "artifact_upload_started",
  "artifact_upload_completed",
  "owned_object_finalize_started",
  "owned_object_finalize_completed",
  "artifact_binding_validation_started",
  "artifact_binding_validation_completed",
  "job_succeeded_cas_started",
  "job_succeeded_cas_completed",
  "terminal_failure_cas_started",
  "terminal_failure_cas_completed",
  "cleanup_scheduled",
  "cleanup_completed",
] as const);

export type OwningBoundaryEventId =
  (typeof OWNING_BOUNDARY_EVENT_IDS)[number];

export const RENDER_REQUEST_SCHEMA_CLASSES = Object.freeze([
  "valid_v1",
  "invalid",
  "not_reached",
] as const);

export type RenderRequestSchemaClass =
  (typeof RENDER_REQUEST_SCHEMA_CLASSES)[number];

export const RENDER_PROFILE_CLASSES = Object.freeze([
  "phase3_supported",
  "unsupported",
  "not_reached",
] as const);

export type RenderProfileClass = (typeof RENDER_PROFILE_CLASSES)[number];

export const MANIFEST_VALIDATION_CLASSES = Object.freeze([
  "valid",
  "invalid",
  "not_reached",
] as const);

export type ManifestValidationClass =
  (typeof MANIFEST_VALIDATION_CLASSES)[number];

export const BUNDLE_VALIDATION_CLASSES = Object.freeze([
  "valid",
  "invalid",
  "not_reached",
] as const);

export type BundleValidationClass = (typeof BUNDLE_VALIDATION_CLASSES)[number];

export const SLOT_COVERAGE_CLASSES = Object.freeze([
  "complete",
  "incomplete",
  "not_applicable",
] as const);

export type SlotCoverageClass = (typeof SLOT_COVERAGE_CLASSES)[number];

export const SOURCE_ASSET_COUNT_CLASSES = Object.freeze([
  "zero",
  "small",
  "medium",
  "large",
  "not_reached",
] as const);

export type SourceAssetCountClass =
  (typeof SOURCE_ASSET_COUNT_CLASSES)[number];

export const SOURCE_ASSET_MATERIALIZATION_CLASSES = Object.freeze([
  "not_started",
  "in_progress",
  "complete",
  "failed",
  "not_reached",
] as const);

export type SourceAssetMaterializationClass =
  (typeof SOURCE_ASSET_MATERIALIZATION_CLASSES)[number];

export const SOURCE_ASSET_BYTE_VERIFICATION_CLASSES = Object.freeze([
  "all_verified",
  "verification_failed",
  "not_reached",
] as const);

export type SourceAssetByteVerificationClass =
  (typeof SOURCE_ASSET_BYTE_VERIFICATION_CLASSES)[number];

export const SOURCE_WORKSPACE_COLLISION_CLASSES = Object.freeze([
  "none",
  "reserved_path_collision",
  "not_reached",
] as const);

export type SourceWorkspaceCollisionClass =
  (typeof SOURCE_WORKSPACE_COLLISION_CLASSES)[number];

export const PAGE_RESERVED_PATH_INTEGRITY_CLASSES = Object.freeze([
  "intact",
  "pre_materialization_mismatch",
  "post_materialization_mismatch",
  "not_reached",
] as const);

export type PageReservedPathIntegrityClass =
  (typeof PAGE_RESERVED_PATH_INTEGRITY_CLASSES)[number];

export const STORAGE_ADAPTER_CLASSES = Object.freeze([
  "memory",
  "r2_job_bound",
  "unavailable",
  "not_reached",
] as const);

export type StorageAdapterClass = (typeof STORAGE_ADAPTER_CLASSES)[number];

export const CANONICAL_JOB_IDENTITY_COHERENCE_CLASSES = Object.freeze([
  "coherent",
  "incoherent",
  "not_reached",
] as const);

export type CanonicalJobIdentityCoherenceClass =
  (typeof CANONICAL_JOB_IDENTITY_COHERENCE_CLASSES)[number];

export type ProviderContextClassifications = Readonly<{
  renderRequestSchemaClass: RenderRequestSchemaClass;
  renderProfileClass: RenderProfileClass;
  manifestValidationClass: ManifestValidationClass;
  bundleValidationClass: BundleValidationClass;
  expectedSlotCoverageClass: SlotCoverageClass;
  finalizedSourceObjectCoverageClass: SlotCoverageClass;
  sourceAssetCountClass: SourceAssetCountClass;
  sourceAssetMaterializationClass: SourceAssetMaterializationClass;
  sourceAssetByteVerificationClass: SourceAssetByteVerificationClass;
  sourceWorkspaceCollisionClass: SourceWorkspaceCollisionClass;
  pageReservedPathIntegrityClass: PageReservedPathIntegrityClass;
  storageAdapterClass: StorageAdapterClass;
  canonicalJobIdentityCoherenceClass: CanonicalJobIdentityCoherenceClass;
}>;

export const ARTIFACT_LIFECYCLE_ROLE_CLASSES = Object.freeze([
  "primary_output",
  "not_applicable",
] as const);

export type ArtifactLifecycleRoleClass =
  (typeof ARTIFACT_LIFECYCLE_ROLE_CLASSES)[number];

export const ARTIFACT_FINALIZE_SUBSTAGE_CLASSES = Object.freeze([
  "canonical_artifact_attachment",
  "binding_coherence",
  "binding_validation",
  "finalized_coherence_assertion",
  "provider_finalize",
  "r2_upload",
  "not_applicable",
] as const);

export type ArtifactFinalizeSubstageClass =
  (typeof ARTIFACT_FINALIZE_SUBSTAGE_CLASSES)[number];

export type OwningBoundaryTelemetryPayload = Readonly<{
  providerContext?: ProviderContextClassifications;
  workspaceAttribution?: PageWorkspaceAttribution;
  bootstrapOutcomeClass?:
    | "accepted"
    | "rejected"
    | "missing_contract"
    | "version_mismatch"
    | "not_applicable";
  frameOutcomeClass?: "succeeded" | "failed" | "not_applicable";
  cleanupOutcomeClass?: "ok" | "failed" | "not_run";
  ffmpegOutcomeClass?: "succeeded" | "failed" | "not_applicable";
  uploadOutcomeClass?: "succeeded" | "failed" | "not_applicable";
  finalizeOutcomeClass?: "succeeded" | "failed" | "not_applicable";
  casOutcomeClass?: "succeeded" | "failed" | "not_applicable";
  artifactLifecycleRole?: ArtifactLifecycleRoleClass;
  finalizeSubstage?: ArtifactFinalizeSubstageClass;
}>;

export type OwningBoundaryTelemetryObservation = Readonly<{
  boundaryId: OwningBoundaryEventId;
  sequence: number;
  atMs: number;
  facts: Readonly<Record<string, string>>;
}>;

export type OwningBoundaryTelemetryCallbackFailure = Readonly<{
  readonly marker: "telemetry_callback_failed";
  readonly expectedPriorBoundary: OwningBoundaryEventId;
  readonly attemptedBoundary: OwningBoundaryEventId;
  readonly atMs: number;
}>;

export type ProviderBackedBoundaryTelemetryPort = Readonly<{
  /** Stable identity — same port object must reach every nested owning boundary. */
  readonly portId: string;
  emit: (
    boundaryId: OwningBoundaryEventId,
    payload?: OwningBoundaryTelemetryPayload,
  ) => void;
  /** Read-only collector surface for tests and probe attribution. */
  readonly observations: readonly OwningBoundaryTelemetryObservation[];
  readonly callbackFailures: readonly OwningBoundaryTelemetryCallbackFailure[];
}>;

export type BoundaryTelemetryCorrelation = Readonly<{
  readonly machineClass: "exact_render";
  readonly concurrencyClass: "single";
  readonly executionWindowClass: "bounded";
  readonly claimAckCorrelationClass: "current_run";
  readonly observationBoundaryMs: number;
}>;

const BOUNDARY_SET = new Set<string>(OWNING_BOUNDARY_EVENT_IDS);
const SCHEMA_SET = new Set<string>(RENDER_REQUEST_SCHEMA_CLASSES);
const PROFILE_SET = new Set<string>(RENDER_PROFILE_CLASSES);
const MANIFEST_SET = new Set<string>(MANIFEST_VALIDATION_CLASSES);
const BUNDLE_SET = new Set<string>(BUNDLE_VALIDATION_CLASSES);
const SLOT_SET = new Set<string>(SLOT_COVERAGE_CLASSES);
const COUNT_SET = new Set<string>(SOURCE_ASSET_COUNT_CLASSES);
const MAT_SET = new Set<string>(SOURCE_ASSET_MATERIALIZATION_CLASSES);
const BYTE_SET = new Set<string>(SOURCE_ASSET_BYTE_VERIFICATION_CLASSES);
const COLLISION_SET = new Set<string>(SOURCE_WORKSPACE_COLLISION_CLASSES);
const PATH_SET = new Set<string>(PAGE_RESERVED_PATH_INTEGRITY_CLASSES);
const STORAGE_SET = new Set<string>(STORAGE_ADAPTER_CLASSES);
const IDENTITY_SET = new Set<string>(CANONICAL_JOB_IDENTITY_COHERENCE_CLASSES);

const FORBIDDEN_TELEMETRY =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_|R2_|password=|token=|BEGIN PRIVATE KEY|\/Users\/|\/tmp\/|https?:\/\/|file:\/\/|@sha256:|process\.env|0x[a-f0-9]{16,})/i;

function pickAllowlisted<T extends string>(
  value: unknown,
  allowlist: ReadonlySet<string>,
): T | undefined {
  return typeof value === "string" && allowlist.has(value)
    ? (value as T)
    : undefined;
}

function scrubFactValue(value: string): string {
  if (FORBIDDEN_TELEMETRY.test(value)) return "redacted";
  if (value.length > 64) return "truncated";
  return value;
}

export function classifySourceAssetCountClass(
  count: number,
): SourceAssetCountClass {
  if (count <= 0) return "zero";
  if (count <= 4) return "small";
  if (count <= 16) return "medium";
  return "large";
}

export function createInitialProviderContextClassifications(
  storageAdapterClass: StorageAdapterClass = "not_reached",
): ProviderContextClassifications {
  return Object.freeze({
    renderRequestSchemaClass: "not_reached",
    renderProfileClass: "not_reached",
    manifestValidationClass: "not_reached",
    bundleValidationClass: "not_reached",
    expectedSlotCoverageClass: "not_applicable",
    finalizedSourceObjectCoverageClass: "not_applicable",
    sourceAssetCountClass: "not_reached",
    sourceAssetMaterializationClass: "not_started",
    sourceAssetByteVerificationClass: "not_reached",
    sourceWorkspaceCollisionClass: "not_reached",
    pageReservedPathIntegrityClass: "not_reached",
    storageAdapterClass,
    canonicalJobIdentityCoherenceClass: "not_reached",
  });
}

export function providerContextToTelemetryFacts(
  ctx: ProviderContextClassifications,
): Readonly<Record<string, string>> {
  return Object.freeze({
    render_request_schema_class: ctx.renderRequestSchemaClass,
    render_profile_class: ctx.renderProfileClass,
    manifest_validation_class: ctx.manifestValidationClass,
    bundle_validation_class: ctx.bundleValidationClass,
    expected_slot_coverage_class: ctx.expectedSlotCoverageClass,
    finalized_source_object_coverage_class:
      ctx.finalizedSourceObjectCoverageClass,
    source_asset_count_class: ctx.sourceAssetCountClass,
    source_asset_materialization_class: ctx.sourceAssetMaterializationClass,
    source_asset_byte_verification_class: ctx.sourceAssetByteVerificationClass,
    source_workspace_collision_class: ctx.sourceWorkspaceCollisionClass,
    page_reserved_path_integrity_class: ctx.pageReservedPathIntegrityClass,
    storage_adapter_class: ctx.storageAdapterClass,
    canonical_job_identity_coherence_class:
      ctx.canonicalJobIdentityCoherenceClass,
  });
}

export function sanitizeProviderContextFromTelemetryFacts(
  facts: Readonly<Record<string, unknown>>,
): ProviderContextClassifications | undefined {
  const renderRequestSchemaClass = pickAllowlisted<RenderRequestSchemaClass>(
    facts.render_request_schema_class,
    SCHEMA_SET,
  );
  const renderProfileClass = pickAllowlisted<RenderProfileClass>(
    facts.render_profile_class,
    PROFILE_SET,
  );
  const manifestValidationClass = pickAllowlisted<ManifestValidationClass>(
    facts.manifest_validation_class,
    MANIFEST_SET,
  );
  const bundleValidationClass = pickAllowlisted<BundleValidationClass>(
    facts.bundle_validation_class,
    BUNDLE_SET,
  );
  const expectedSlotCoverageClass = pickAllowlisted<SlotCoverageClass>(
    facts.expected_slot_coverage_class,
    SLOT_SET,
  );
  const finalizedSourceObjectCoverageClass = pickAllowlisted<SlotCoverageClass>(
    facts.finalized_source_object_coverage_class,
    SLOT_SET,
  );
  const sourceAssetCountClass = pickAllowlisted<SourceAssetCountClass>(
    facts.source_asset_count_class,
    COUNT_SET,
  );
  const sourceAssetMaterializationClass =
    pickAllowlisted<SourceAssetMaterializationClass>(
      facts.source_asset_materialization_class,
      MAT_SET,
    );
  const sourceAssetByteVerificationClass =
    pickAllowlisted<SourceAssetByteVerificationClass>(
      facts.source_asset_byte_verification_class,
      BYTE_SET,
    );
  const sourceWorkspaceCollisionClass =
    pickAllowlisted<SourceWorkspaceCollisionClass>(
      facts.source_workspace_collision_class,
      COLLISION_SET,
    );
  const pageReservedPathIntegrityClass =
    pickAllowlisted<PageReservedPathIntegrityClass>(
      facts.page_reserved_path_integrity_class,
      PATH_SET,
    );
  const storageAdapterClass = pickAllowlisted<StorageAdapterClass>(
    facts.storage_adapter_class,
    STORAGE_SET,
  );
  const canonicalJobIdentityCoherenceClass =
    pickAllowlisted<CanonicalJobIdentityCoherenceClass>(
      facts.canonical_job_identity_coherence_class,
      IDENTITY_SET,
    );
  if (
    renderRequestSchemaClass == null ||
    renderProfileClass == null ||
    manifestValidationClass == null ||
    bundleValidationClass == null ||
    expectedSlotCoverageClass == null ||
    finalizedSourceObjectCoverageClass == null ||
    sourceAssetCountClass == null ||
    sourceAssetMaterializationClass == null ||
    sourceAssetByteVerificationClass == null ||
    sourceWorkspaceCollisionClass == null ||
    pageReservedPathIntegrityClass == null ||
    storageAdapterClass == null ||
    canonicalJobIdentityCoherenceClass == null
  ) {
    return undefined;
  }
  return Object.freeze({
    renderRequestSchemaClass,
    renderProfileClass,
    manifestValidationClass,
    bundleValidationClass,
    expectedSlotCoverageClass,
    finalizedSourceObjectCoverageClass,
    sourceAssetCountClass,
    sourceAssetMaterializationClass,
    sourceAssetByteVerificationClass,
    sourceWorkspaceCollisionClass,
    pageReservedPathIntegrityClass,
    storageAdapterClass,
    canonicalJobIdentityCoherenceClass,
  });
}

function buildBoundaryFacts(input: {
  boundaryId: OwningBoundaryEventId;
  sequence: number;
  correlation: BoundaryTelemetryCorrelation;
  payload?: OwningBoundaryTelemetryPayload;
}): Readonly<Record<string, string>> {
  const facts: Record<string, string> = {
    owning_boundary: input.boundaryId,
    boundary_sequence: String(input.sequence),
    machine_class: input.correlation.machineClass,
    concurrency_class: input.correlation.concurrencyClass,
    execution_window_class: input.correlation.executionWindowClass,
    claim_ack_correlation_class: input.correlation.claimAckCorrelationClass,
  };
  if (input.payload?.providerContext != null) {
    Object.assign(
      facts,
      providerContextToTelemetryFacts(input.payload.providerContext),
    );
  }
  if (input.payload?.workspaceAttribution != null) {
    Object.assign(
      facts,
      pageWorkspaceAttributionToTelemetryFacts(
        input.payload.workspaceAttribution,
      ),
    );
  }
  if (input.payload?.bootstrapOutcomeClass != null) {
    facts.bootstrap_outcome_class = input.payload.bootstrapOutcomeClass;
  }
  if (input.payload?.frameOutcomeClass != null) {
    facts.frame_outcome_class = input.payload.frameOutcomeClass;
  }
  if (input.payload?.cleanupOutcomeClass != null) {
    facts.cleanup_outcome_class = input.payload.cleanupOutcomeClass;
  }
  if (input.payload?.ffmpegOutcomeClass != null) {
    facts.ffmpeg_outcome_class = input.payload.ffmpegOutcomeClass;
  }
  if (input.payload?.uploadOutcomeClass != null) {
    facts.upload_outcome_class = input.payload.uploadOutcomeClass;
  }
  if (input.payload?.finalizeOutcomeClass != null) {
    facts.finalize_outcome_class = input.payload.finalizeOutcomeClass;
  }
  if (input.payload?.finalizeSubstage != null) {
    facts.finalize_substage = input.payload.finalizeSubstage;
  }
  if (input.payload?.artifactLifecycleRole != null) {
    facts.artifact_lifecycle_role = input.payload.artifactLifecycleRole;
  }
  if (input.payload?.casOutcomeClass != null) {
    facts.cas_outcome_class = input.payload.casOutcomeClass;
  }
  for (const [key, value] of Object.entries(facts)) {
    facts[key] = scrubFactValue(value);
  }
  return Object.freeze(facts);
}

function createTelemetryPort(input: {
  readonly portId: string;
  correlation: BoundaryTelemetryCorrelation;
  nowMs: () => number;
  onObservation: (observation: OwningBoundaryTelemetryObservation) => void;
}): ProviderBackedBoundaryTelemetryPort {
  const observations: OwningBoundaryTelemetryObservation[] = [];
  const callbackFailures: OwningBoundaryTelemetryCallbackFailure[] = [];
  const emitted = new Set<OwningBoundaryEventId>();
  let sequence = 0;

  const emit = (
    boundaryId: OwningBoundaryEventId,
    payload?: OwningBoundaryTelemetryPayload,
  ) => {
    try {
      if (!BOUNDARY_SET.has(boundaryId)) return;
      const expectedPrior = nextExpectedOwningBoundary([...emitted]);
      if (
        expectedPrior != null &&
        expectedPrior !== boundaryId &&
        !emitted.has(expectedPrior)
      ) {
        callbackFailures.push(
          Object.freeze({
            marker: "telemetry_callback_failed",
            expectedPriorBoundary: expectedPrior,
            attemptedBoundary: boundaryId,
            atMs: input.nowMs(),
          }),
        );
      }
      sequence += 1;
      const atMs = input.nowMs();
      if (atMs < input.correlation.observationBoundaryMs) return;
      const facts = buildBoundaryFacts({
        boundaryId,
        sequence,
        correlation: input.correlation,
        payload,
      });
      const observation = Object.freeze({
        boundaryId,
        sequence,
        atMs,
        facts,
      });
      observations.push(observation);
      emitted.add(boundaryId);
      input.onObservation(observation);
    } catch {
      // Telemetry must never influence execution.
    }
  };

  return Object.freeze({
    portId: input.portId,
    emit,
    get observations() {
      return Object.freeze([...observations]);
    },
    get callbackFailures() {
      return Object.freeze([...callbackFailures]);
    },
  });
}

export const NO_OP_BOUNDARY_TELEMETRY_PORT_ID = "noop" as const;

export function createNoOpProviderBackedBoundaryTelemetry(): ProviderBackedBoundaryTelemetryPort {
  return Object.freeze({
    portId: NO_OP_BOUNDARY_TELEMETRY_PORT_ID,
    emit: () => undefined,
    get observations() {
      return Object.freeze([] as const);
    },
    get callbackFailures() {
      return Object.freeze([] as const);
    },
  });
}

export function createCollectingProviderBackedBoundaryTelemetry(input?: {
  readonly observationBoundaryMs?: number;
  readonly nowMs?: () => number;
  readonly portId?: string;
}): ProviderBackedBoundaryTelemetryPort {
  return createTelemetryPort({
    portId: input?.portId ?? "collecting",
    correlation: Object.freeze({
      machineClass: "exact_render",
      concurrencyClass: "single",
      executionWindowClass: "bounded",
      claimAckCorrelationClass: "current_run",
      observationBoundaryMs: input?.observationBoundaryMs ?? 0,
    }),
    nowMs: input?.nowMs ?? (() => Date.now()),
    onObservation: () => undefined,
  });
}

export function createHostedProviderBackedBoundaryTelemetry(input: {
  readonly eventSink?: HeadlessHostedWorkerEventSink;
  readonly correlation: BoundaryTelemetryCorrelation;
  readonly nowMs: () => number;
  readonly mode?: "render";
  readonly portId?: string;
}): ProviderBackedBoundaryTelemetryPort {
  return createTelemetryPort({
    portId: input.portId ?? "hosted",
    correlation: input.correlation,
    nowMs: input.nowMs,
    onObservation: (observation) => {
      emitHostedWorkerEvent(input.eventSink, {
        name: "hosted.render.boundary",
        atMs: observation.atMs,
        mode: input.mode ?? "render",
        action: observation.boundaryId,
        facts: observation.facts,
      });
    },
  });
}

export function isOwningBoundaryEventId(value: unknown): value is OwningBoundaryEventId {
  return typeof value === "string" && BOUNDARY_SET.has(value);
}

export function nextExpectedOwningBoundary(
  observed: readonly OwningBoundaryEventId[],
): OwningBoundaryEventId | null {
  for (const expected of OWNING_BOUNDARY_EVENT_IDS) {
    if (!observed.includes(expected)) return expected;
  }
  return null;
}

export function classifyOwningBoundaryTerminalBranch(input: {
  readonly observedSequence: readonly OwningBoundaryEventId[];
}): "success" | "failure" | "incomplete" {
  const observed = input.observedSequence;
  if (observed.includes("job_succeeded_cas_completed")) {
    return "success";
  }
  if (
    observed.includes("terminal_failure_cas_started") ||
    observed.includes("terminal_failure_cas_completed")
  ) {
    return "failure";
  }
  if (observed.includes("artifact_binding_validation_completed")) {
    return "incomplete";
  }
  return "incomplete";
}

export function resolveBranchAwareMissingNextBoundary(input: {
  readonly observedSequence: readonly OwningBoundaryEventId[];
  readonly lastObservedBoundary: OwningBoundaryEventId | null;
}): OwningBoundaryEventId | null {
  const { observedSequence, lastObservedBoundary } = input;
  if (lastObservedBoundary == null) {
    return nextExpectedOwningBoundary(observedSequence);
  }
  const branch = classifyOwningBoundaryTerminalBranch({
    observedSequence,
  });
  if (branch === "success") {
    if (lastObservedBoundary === "cleanup_completed") {
      return null;
    }
    if (lastObservedBoundary === "cleanup_scheduled") {
      return "cleanup_completed";
    }
    if (lastObservedBoundary === "job_succeeded_cas_completed") {
      return observedSequence.includes("cleanup_scheduled")
        ? "cleanup_completed"
        : "cleanup_scheduled";
    }
    return null;
  }
  if (branch === "failure") {
    if (lastObservedBoundary === "cleanup_completed") {
      return null;
    }
    if (lastObservedBoundary === "terminal_failure_cas_completed") {
      return observedSequence.includes("cleanup_scheduled")
        ? "cleanup_completed"
        : "cleanup_scheduled";
    }
    if (lastObservedBoundary === "artifact_binding_validation_completed") {
      return "terminal_failure_cas_started";
    }
  }
  const idx = OWNING_BOUNDARY_EVENT_IDS.indexOf(lastObservedBoundary);
  if (idx < 0 || idx >= OWNING_BOUNDARY_EVENT_IDS.length - 1) {
    return null;
  }
  return OWNING_BOUNDARY_EVENT_IDS[idx + 1] ?? null;
}

export function sanitizeOwningBoundaryObservation(
  raw: Readonly<Record<string, unknown>>,
): OwningBoundaryTelemetryObservation | undefined {
  const boundaryId = pickAllowlisted<OwningBoundaryEventId>(
    raw.owning_boundary ?? raw.boundaryId ?? raw.action,
    BOUNDARY_SET,
  );
  if (boundaryId == null) return undefined;
  const sequenceRaw = raw.boundary_sequence ?? raw.sequence;
  const sequence =
    typeof sequenceRaw === "number"
      ? sequenceRaw
      : typeof sequenceRaw === "string"
        ? Number.parseInt(sequenceRaw, 10)
        : NaN;
  if (!Number.isFinite(sequence) || sequence < 1) return undefined;
  const atMs =
    typeof raw.atMs === "number"
      ? raw.atMs
      : typeof raw.at_ms === "number"
        ? raw.at_ms
        : Date.now();
  const factsInput =
    raw.facts != null && typeof raw.facts === "object"
      ? (raw.facts as Record<string, unknown>)
      : raw;
  const facts: Record<string, string> = {};
  for (const [key, value] of Object.entries(factsInput)) {
    if (typeof value !== "string") continue;
    facts[key] = scrubFactValue(value);
  }
  facts.owning_boundary = boundaryId;
  facts.boundary_sequence = String(sequence);
  return Object.freeze({ boundaryId, sequence, atMs, facts: Object.freeze(facts) });
}

export const OWNING_BOUNDARY_TELEMETRY_INCOMPLETE_REASON =
  "owning_boundary_telemetry_incomplete" as const;

export type OwningBoundaryTerminalEvidence = Readonly<{
  lastObservedBoundary: OwningBoundaryEventId | null;
  missingNextBoundary: OwningBoundaryEventId | null;
  providerContext: ProviderContextClassifications | null;
  workspaceAttribution: PageWorkspaceAttribution | null;
  owningBoundaryTelemetryIncomplete: boolean;
}>;

export function buildOwningBoundaryTerminalEvidence(input: {
  readonly observations: readonly OwningBoundaryTelemetryObservation[];
  readonly workspaceMaterializationCompleted: boolean;
  readonly terminalReasonId: string | null;
}): OwningBoundaryTerminalEvidence {
  const observedIds = input.observations.map((o) => o.boundaryId);
  const lastObservedBoundary =
    observedIds.length > 0 ? observedIds[observedIds.length - 1]! : null;
  const missingNextBoundary = resolveBranchAwareMissingNextBoundary({
    observedSequence: observedIds,
    lastObservedBoundary,
  });
  const lastFacts =
    input.observations.length > 0
      ? input.observations[input.observations.length - 1]!.facts
      : null;
  const providerContext: ProviderContextClassifications | null =
    lastFacts != null
      ? sanitizeProviderContextFromTelemetryFacts(lastFacts) ?? null
      : null;
  const workspaceFacts =
    lastFacts != null
      ? sanitizePageWorkspaceAttributionFromTelemetryFacts(lastFacts)
      : undefined;
  const workspaceFromComplete = input.observations.find(
    (o) => o.boundaryId === "page_workspace_materialization_complete",
  );
  const workspaceAttribution: PageWorkspaceAttribution | null =
    workspaceFromComplete != null
      ? sanitizePageWorkspaceAttributionFromTelemetryFacts(
          workspaceFromComplete.facts,
        ) ?? null
      : workspaceFacts ?? null;
  const directWorkspaceEventPresent = input.observations.some(
    (o) => o.boundaryId === "page_workspace_materialization_complete",
  );
  const owningBoundaryTelemetryIncomplete =
    input.workspaceMaterializationCompleted && !directWorkspaceEventPresent;
  void input.terminalReasonId;
  return Object.freeze({
    lastObservedBoundary,
    missingNextBoundary,
    providerContext,
    workspaceAttribution,
    owningBoundaryTelemetryIncomplete,
  });
}

export function owningBoundaryFactsAreHostile(
  facts: Readonly<Record<string, string>>,
): boolean {
  return Object.values(facts).some((v) => FORBIDDEN_TELEMETRY.test(v));
}
