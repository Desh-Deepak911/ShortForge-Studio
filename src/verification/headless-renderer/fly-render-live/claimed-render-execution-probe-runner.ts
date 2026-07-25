/**
 * Targeted hosted render execution probe — production path stages only.
 * Sprint 11E Phase 2E.2D.8F / 8F.1.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { R2UploadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-upload-capability.adapter";
import { NeonHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-render-dispatch-outbox.adapter";
import { UpstashRestQueueProducerAdapter } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import { readConfiguredHeadlessR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  readConfiguredHeadlessUpstashConsumerConfig,
  readConfiguredHeadlessUpstashProducerConfig,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessOwnedObjectStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import {
  HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import { parseHeadlessFlyStagingDualMachineInventoryFromListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";
import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import type { FlyRenderClaimedRenderExecutionAttributionSnapshot } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import { defaultFlyRenderLiveCleanup } from "./cleanup";
import {
  createReadHostedDeliveryEvents,
  defaultReadFlyLogs,
} from "./hosted-delivery-event-ingestion";
import { buildFlyRenderLiveSchemaFingerprint } from "./evidence-authority";
import {
  DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
  type FlyRenderLiveCaseRunner,
} from "./live-matrix";
import {
  sampleHostedRenderProcessTreePeakBytes,
  type HostedRenderProcessTreePeakObservation,
} from "./process-tree-peak-memory";
import { buildHeadlessFlyRenderLiveSmokeBoundary, buildHeadlessFlyRenderLiveSmokeWorkloadEvidence } from "./smoke-workload";
import type {
  FlyRenderLiveMatrixContext,
  FlyRenderLiveSchemaFingerprint,
} from "./types";
import { emptyFlyRenderLiveSession } from "./types";
import type { FlyRenderLiveCaseEvidence } from "./evidence";
import type { RequiredFlyRenderLiveCaseId } from "./required-cases";
import {
  captureBoundedHostedRenderBoundaryLogLines,
  ingestOwningBoundaryEvidenceFromFlyLogs,
  workspaceMaterializationCompletedFromAttribution,
  type IngestOwningBoundaryEvidenceResult,
} from "./owning-boundary-probe-authority";
import type { OwningBoundaryTerminalEvidence } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import type { OwningBoundarySequenceCoherenceResult } from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";

import {
  buildExecutionProbeJobCreateUnconfirmedAttribution,
  extractExecutionProbeJobCreateAttribution,
  type FlyRenderExecutionProbeJobCreateAttribution,
} from "./execution-probe-job-create-attribution";
import {
  type JobCreateAttributionStageId,
} from "./job-create-attribution";
import {
  captureExecutionProbePreCleanupSuccessSignals,
  deriveExecutionProbeSuccessAttribution,
  extractExecutionAttributionFromStageCases,
  type ExecutionProbePreCleanupSuccessSignals,
  type ExecutionProbeSuccessAttributionFailureCategory,
} from "./execution-probe-success-attribution";

const execFileAsync = promisify(execFile);

export const EXECUTION_PROBE_STAGE_IDS = Object.freeze([
  "job.create_queued",
  "dispatch_outbox.intent",
  "upstash.enqueue_render",
  "hosted.render_claim",
  "redis.ack_pending_cleared",
  "hosted.chromium_execution",
  "hosted.ffmpeg_execution",
  "r2.streamed_artifact_upload",
  "owned_object.finalized",
  "artifact.binding_coherence",
  "job.succeeded_cas",
  "dispatch_outbox.completed",
  "cleanup_intent.not_retryable",
  "artifact.download_verify",
  "replay.idempotent",
] as const satisfies readonly RequiredFlyRenderLiveCaseId[]);

export type ExecutionProbeStageId = (typeof EXECUTION_PROBE_STAGE_IDS)[number];

export type ExecutionProbeStageEvidence = {
  readonly stageId: ExecutionProbeStageId;
  readonly status: FlyRenderLiveCaseEvidence["status"];
  readonly failureCategory?: string;
};

export type ExecutionProbeArtifactAuthority = {
  readonly bindingVerified: boolean;
  readonly downloadVerified: boolean;
  readonly replayIdempotent: boolean;
  readonly artifactByteLength: number | null;
};

export type ClaimedRenderExecutionProbeRunResult = {
  readonly overall: "PASS" | "FAIL";
  readonly stages: readonly ExecutionProbeStageEvidence[];
  readonly failedStageId: ExecutionProbeStageId | null;
  readonly executionAttribution: FlyRenderClaimedRenderExecutionAttributionSnapshot | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly resourceObservation: HostedRenderProcessTreePeakObservation | null;
  readonly smokeWorkload: ReturnType<typeof buildHeadlessFlyRenderLiveSmokeWorkloadEvidence>;
  readonly acceptedImageDigestSha256: string;
  readonly executionDurationMs: number | null;
  readonly artifactAuthority: ExecutionProbeArtifactAuthority | null;
  readonly owningBoundaryEvidence:
    | (OwningBoundaryTerminalEvidence & {
        readonly observedSequence: readonly string[];
        readonly cleanupOutcomeClass: "ok" | "failed" | "not_run";
        readonly sequenceCoherence: OwningBoundarySequenceCoherenceResult;
      })
    | null;
  readonly owningBoundaryIngestion: IngestOwningBoundaryEvidenceResult | null;
  readonly boundedBoundaryCaptureLines: readonly string[];
  readonly jobCreateAttribution: FlyRenderExecutionProbeJobCreateAttribution | null;
  readonly successAttributionFailureCategory: ExecutionProbeSuccessAttributionFailureCategory | null;
};

export type ClaimedRenderExecutionProbeRunnerDeps = {
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly connectionProbe?: () => void;
  readonly cleanupRunner?: (
    ctx: FlyRenderLiveMatrixContext,
    preserve?: boolean,
  ) => Promise<"ok" | "failed" | "preserved">;
  readonly caseRunners?: Readonly<
    Partial<Record<RequiredFlyRenderLiveCaseId, FlyRenderLiveCaseRunner>>
  >;
  readonly readFlyLogs?: (appName: string) => Promise<string>;
};

function lastConfirmedJobCreateStage(
  cases: readonly FlyRenderLiveCaseEvidence[],
): JobCreateAttributionStageId | null {
  if (cases.length === 0) return null;
  const failed = cases.find(
    (c) => c.caseId === "job.create_queued" && c.status === "FAIL",
  );
  if (failed?.jobCreateFailureAttribution != null) {
    const stage = failed.jobCreateFailureAttribution.failureStage;
    const stages = [
      "project_ownership_claim",
      "live_manifest_construction",
      "provisional_job_create",
      "provisional_job_reread",
      "owned_object_staging",
      "staging_reference_append",
      "coverage_reconcile",
      "canonical_materialization",
      "promotion_transaction",
      "queued_job_reread",
      "queued_state_assertion",
      "dispatch_outbox_intent_reread",
      "cleanup",
    ] as const satisfies readonly JobCreateAttributionStageId[];
    const idx = stages.indexOf(stage);
    if (idx <= 0) return null;
    return stages[idx - 1] ?? null;
  }
  return null;
}

async function defaultReadFlyTopology(appName: string) {
  const { stdout } = await execFileAsync(
    "fly",
    ["machine", "list", "-a", appName, "--json"],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  let json: unknown;
  try {
    json = JSON.parse(stdout.trim());
  } catch {
    json = [];
  }
  const inventory = parseHeadlessFlyStagingDualMachineInventoryFromListJson(json);
  return {
    verifyCount: inventory.verifyCount,
    renderCount: inventory.renderCount,
    region: inventory.verify?.region ?? inventory.render?.region ?? "",
    verifyMachineId: inventory.verify?.machineId ?? null,
    renderMachineId: inventory.render?.machineId ?? null,
    verifyImageDigestSha256: inventory.verify?.imageDigestSha256 ?? null,
    renderImageDigestSha256: inventory.render?.imageDigestSha256 ?? null,
  };
}

function buildArtifactAuthority(
  stages: readonly ExecutionProbeStageEvidence[],
  ctx: FlyRenderLiveMatrixContext,
): ExecutionProbeArtifactAuthority | null {
  const byId = new Map(stages.map((s) => [s.stageId, s]));
  const binding = byId.get("artifact.binding_coherence")?.status === "PASS";
  const download = byId.get("artifact.download_verify")?.status === "PASS";
  const replay = byId.get("replay.idempotent")?.status === "PASS";
  if (!binding && !download && !replay) return null;
  return Object.freeze({
    bindingVerified: binding,
    downloadVerified: download,
    replayIdempotent: replay,
    artifactByteLength: ctx.session.artifactByteLength,
  });
}

export async function runClaimedRenderExecutionProbeChain(
  deps: ClaimedRenderExecutionProbeRunnerDeps,
): Promise<ClaimedRenderExecutionProbeRunResult> {
  const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
  const acceptedImageDigestSha256 =
    resolveCurrentFlyStagingAcceptedImageDigestSha256();
  const appNameRaw = (deps.env as Record<string, unknown>)
    .HEADLESS_FLY_STAGING_APP_NAME;
  const flyApp =
    typeof appNameRaw === "string" && appNameRaw.length > 0
      ? appNameRaw
      : HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP;
  const readFlyLogs = deps.readFlyLogs ?? defaultReadFlyLogs;
  const resourceStartedAtMs = Date.now();

  deps.connectionProbe?.();

  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashTcpStreamConsumerAdapter | null = null;
  let matrixCtx: FlyRenderLiveMatrixContext | null = null;
  let fingerprint: FlyRenderLiveSchemaFingerprint | null = null;
  const stageCases: FlyRenderLiveCaseEvidence[] = [];
  let cleanupStatus: ClaimedRenderExecutionProbeRunResult["cleanupStatus"] =
    "not_run";
  let finalResourceObservation: HostedRenderProcessTreePeakObservation | null =
    null;
  let preCleanupSuccessSignals: ExecutionProbePreCleanupSuccessSignals | null =
    null;

  try {
    const connectionString = readConfiguredHeadlessDatabaseUrl(deps.env);
    if (connectionString == null) throw new Error("neon_unconfigured");
    sql = createNeonSqlExecutor({ connectionString });

    const preflight = await runHeadlessSchemaPreflight({ sql });
    if (!preflight.ok) throw new Error("schema_preflight_failed");
    fingerprint = buildFlyRenderLiveSchemaFingerprint();

    const r2Config = readConfiguredHeadlessR2Config(deps.env);
    const producerConfig = readConfiguredHeadlessUpstashProducerConfig(deps.env);
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(deps.env);
    if (r2Config == null || producerConfig == null || consumerConfig == null) {
      throw new Error("provider_config_incomplete");
    }

    tcpConsumer = new UpstashTcpStreamConsumerAdapter({
      config: consumerConfig,
      envName: "staging",
    });

    const restProducer = new UpstashRestQueueProducerAdapter({
      config: producerConfig,
    });
    const streamNames = deriveHeadlessQueueStreamNames("staging");
    const runId = randomUUID();

    const jobStore = new NeonHeadlessJobStoreAdapter(sql);
    const ownedObjectStore = new NeonHeadlessOwnedObjectStoreAdapter(sql);
    const projectAuthorization = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const dispatchOutbox = new NeonHeadlessRenderDispatchOutboxAdapter(sql);
    const io = new R2StorageAdapter({
      env: deps.env,
      configOverride: r2Config,
      authorizeOwner: () => true,
    });
    const uploadCapability = new R2UploadCapabilityAdapter({
      ownedObjectStore,
      configOverride: r2Config,
    });

    const ctx: FlyRenderLiveMatrixContext = {
      runId,
      ownerId: `fep_owner_${runId.slice(0, 8)}`,
      otherOwnerId: `fep_other_${runId.slice(0, 8)}`,
      projectId: randomUUID(),
      nowMs: Date.now(),
      env: deps.env,
      flyAppName: flyApp,
      acceptedImageDigestSha256,
      sql,
      jobStore,
      ownedObjectStore,
      projectAuthorization,
      io,
      uploadCapability,
      downloadCapability: null,
      r2Config,
      restProducer,
      tcpConsumer,
      streamNames,
      streamAuthority: "production_env",
      dispatchOutbox,
      preflightFingerprint: fingerprint,
      trackedStreamIds: [],
      runOwnedActiveStreamIds: [],
      createdJobIds: [],
      createdProjectIds: [],
      createdObjectIds: [],
      createdR2Locators: [],
      session: emptyFlyRenderLiveSession(),
      smokePollTimeoutMs: smoke.pollTimeoutMs,
      smokeContentDurationMs: smoke.contentDurationMs,
      resourceObservation: sampleHostedRenderProcessTreePeakBytes({
        startedAtMs: resourceStartedAtMs,
      }),
      readFlyTopology: async () => defaultReadFlyTopology(flyApp),
      readHostedDeliveryEvents: createReadHostedDeliveryEvents({
        flyAppName: flyApp,
        readFlyLogs,
        getSession: () => matrixCtx?.session ?? emptyFlyRenderLiveSession(),
      }),
    };
    matrixCtx = ctx;

    const runners = {
      ...DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
      ...deps.caseRunners,
    };

    let stopped = false;
    for (const stageId of EXECUTION_PROBE_STAGE_IDS) {
      if (stopped) {
        stageCases.push({ caseId: stageId, status: "NOT_TESTED" });
        continue;
      }
      const runner = runners[stageId];
      try {
        const result = await runner(ctx);
        const shaped =
          result.caseId === stageId
            ? result
            : { caseId: stageId, status: "FAIL" as const, failureCategory: "CASE_SHAPE_INVALID" };
        stageCases.push(shaped);
        if (shaped.status === "FAIL") stopped = true;
      } catch {
        stageCases.push({
          caseId: stageId,
          status: "FAIL",
          failureCategory: "MATRIX_EXCEPTION",
        });
        stopped = true;
      }
    }

    finalResourceObservation = sampleHostedRenderProcessTreePeakBytes({
      startedAtMs: resourceStartedAtMs,
    });

    const stageFailed = stageCases.find((entry) => entry.status === "FAIL");
    if (stageFailed == null) {
      const deliveryEvents = await ctx.readHostedDeliveryEvents?.() ?? [];
      preCleanupSuccessSignals = await captureExecutionProbePreCleanupSuccessSignals(
        ctx,
        deliveryEvents,
      );
    }
  } catch {
    return {
      overall: "FAIL",
      stages: EXECUTION_PROBE_STAGE_IDS.map((stageId) => ({
        stageId,
        status: "NOT_TESTED" as const,
      })),
      failedStageId: null,
      executionAttribution: null,
      cleanupStatus: "not_run",
      resourceObservation: null,
      smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
      acceptedImageDigestSha256,
      executionDurationMs: null,
      artifactAuthority: null,
      owningBoundaryEvidence: null,
      owningBoundaryIngestion: null,
      boundedBoundaryCaptureLines: [],
      jobCreateAttribution: buildExecutionProbeJobCreateUnconfirmedAttribution({
        lastConfirmedStage: null,
        cleanupStatus: "not_run",
      }),
      successAttributionFailureCategory: null,
    };
  } finally {
    if (matrixCtx != null) {
      const cleanupRunner = deps.cleanupRunner ?? defaultFlyRenderLiveCleanup;
      cleanupStatus = await cleanupRunner(matrixCtx, false);
    }
    if (tcpConsumer?.close != null) {
      try {
        await tcpConsumer.close();
      } catch {
        // ignore
      }
    }
  }

  if (matrixCtx == null) {
    return {
      overall: "FAIL",
      stages: [],
      failedStageId: null,
      executionAttribution: null,
      cleanupStatus,
      resourceObservation: null,
      smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
      acceptedImageDigestSha256,
      executionDurationMs: null,
      artifactAuthority: null,
      owningBoundaryEvidence: null,
      owningBoundaryIngestion: null,
      boundedBoundaryCaptureLines: [],
      jobCreateAttribution: extractExecutionProbeJobCreateAttribution({
        stageCases: [],
        failedStageId: null,
        cleanupStatus,
        setupFailed: true,
        lastConfirmedStage: null,
      }),
      successAttributionFailureCategory: null,
    };
  }

  const ctx = matrixCtx;
  const stages = stageCases.map((c) =>
    Object.freeze({
      stageId: c.caseId as ExecutionProbeStageId,
      status: c.status,
      ...(c.failureCategory != null ? { failureCategory: c.failureCategory } : {}),
    }),
  );
  const failed = stageCases.find((c) => c.status === "FAIL");
  const stagesAllPass = failed == null;
  const stageAttribution = extractExecutionAttributionFromStageCases(stageCases);
  let executionAttribution = stageAttribution;
  const observationBoundaryMs =
    ctx.session.probeObservationBoundaryMs ??
    ctx.session.renderEnqueuedAtMs ??
    ctx.session.renderStartedAtMs ??
    resourceStartedAtMs;
  const observationEndedMs = Date.now();
  let renderMachineId: string | undefined =
    ctx.session.baselineRenderMachineId ?? undefined;
  if (renderMachineId == null) {
    try {
      const topology = await defaultReadFlyTopology(flyApp);
      renderMachineId = topology.renderMachineId ?? undefined;
    } catch {
      renderMachineId = undefined;
    }
  }
  let owningBoundaryIngestion: IngestOwningBoundaryEvidenceResult | null = null;
  let flyLogText = "";
  try {
    flyLogText = await readFlyLogs(flyApp);
    owningBoundaryIngestion = ingestOwningBoundaryEvidenceFromFlyLogs({
      flyLogText,
      observationBoundaryMs,
      observationEndedMs,
      renderMachineId,
      workspaceMaterializationCompleted:
        workspaceMaterializationCompletedFromAttribution(
          executionAttribution?.pageWorkspaceAttribution,
        ),
      terminalReasonId:
        executionAttribution?.pageFailureReason ??
        (executionAttribution?.dispositionKind === "terminal_failure"
          ? "render_terminalized_failure"
          : null),
      terminalSubstage: executionAttribution?.executionSubstage ?? null,
      cleanupOutcomeClass:
        cleanupStatus === "ok" || cleanupStatus === "preserved"
          ? "ok"
          : cleanupStatus === "failed"
            ? "failed"
            : "not_run",
    });
  } catch {
    owningBoundaryIngestion = Object.freeze({
      ok: true,
      evidence: null,
      reasonId: "no_correlated_boundary_events" as const,
      emissionClassification: "provider_log_read_failed" as const,
    });
  }
  const emissionClassification =
    owningBoundaryIngestion?.emissionClassification ?? null;
  const boundedBoundaryCaptureLines =
    emissionClassification === "log_window_expired" ||
    emissionClassification === "provider_log_read_failed"
      ? captureBoundedHostedRenderBoundaryLogLines({
          flyLogText,
          observationBoundaryMs,
          observationEndedMs,
          renderMachineId,
        })
      : [];
  const owningBoundaryEvidence =
    owningBoundaryIngestion != null &&
    owningBoundaryIngestion.ok &&
    owningBoundaryIngestion.evidence != null
      ? owningBoundaryIngestion.evidence
      : null;
  const executionDurationMs =
    ctx.session.renderStartedAtMs != null &&
    ctx.session.renderCompletedAtMs != null
      ? ctx.session.renderCompletedAtMs - ctx.session.renderStartedAtMs
      : ctx.session.renderStartedAtMs != null
        ? Date.now() - ctx.session.renderStartedAtMs
        : null;

  const failedStageId =
    failed != null ? (failed.caseId as ExecutionProbeStageId) : null;
  const jobCreateAttribution = extractExecutionProbeJobCreateAttribution({
    stageCases,
    failedStageId,
    cleanupStatus,
    setupFailed: false,
    lastConfirmedStage: lastConfirmedJobCreateStage(stageCases),
  });

  let successAttributionFailureCategory: ExecutionProbeSuccessAttributionFailureCategory | null =
    null;
  let allPass =
    stagesAllPass &&
    (cleanupStatus === "ok" || cleanupStatus === "preserved");

  if (allPass) {
    const derived = deriveExecutionProbeSuccessAttribution({
      stageIds: EXECUTION_PROBE_STAGE_IDS,
      stages,
      cleanupStatus,
      stageAttribution,
      preCleanupSignals: preCleanupSuccessSignals,
      owningBoundaryEvidence,
      owningBoundaryIngestion,
    });
    if (!derived.ok) {
      allPass = false;
      successAttributionFailureCategory = derived.failureCategory;
    } else {
      executionAttribution = derived.attribution;
    }
  }

  return {
    overall: allPass ? "PASS" : "FAIL",
    stages,
    failedStageId,
    executionAttribution,
    cleanupStatus,
    resourceObservation: finalResourceObservation ?? ctx.resourceObservation,
    smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
    acceptedImageDigestSha256,
    executionDurationMs,
    artifactAuthority: buildArtifactAuthority(stages, ctx),
    owningBoundaryEvidence,
    owningBoundaryIngestion,
    boundedBoundaryCaptureLines,
    jobCreateAttribution,
    successAttributionFailureCategory,
  };
}
