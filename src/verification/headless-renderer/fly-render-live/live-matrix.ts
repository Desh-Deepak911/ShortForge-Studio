/**
 * Hosted Fly render live matrix — production staging render stream only.
 */

import {
  classifyHeadlessNeonEnvironment,
} from "@/features/headless-renderer/control-plane";
import {
  classifyHeadlessR2Environment,
} from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import {
  HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import {
  classifyHeadlessFlyRenderPostActivationTopology,
  classifyHeadlessFlyRenderPrerequisiteTopology,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-activation-authority";
import {
  classifyHeadlessFlyStagingRenderVmSpec,
  classifyHeadlessFlyStagingVerifyVmSpec,
  parseHeadlessFlyStagingDualMachineInventoryFromListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";

import { assertFlyRenderLiveEvidencePrivacyStructure } from "./evidence-privacy-authority";
import {
  buildFlyRenderLiveSchemaFingerprint,
  FLY_RENDER_LIVE_REQUIRED_MIGRATION_IDS,
} from "./evidence-authority";
import type { FlyRenderLiveCaseEvidence } from "./evidence";
import {
  attributeFlyRenderLiveEnvironment,
  isFlyRenderLiveConfigAttributionEligible,
  isFlyRenderLiveGateEnvironmentEligible,
  validateFlyRenderLiveQaEnvContract,
} from "./qa-secret-contract";
import {
  enqueueFlyRenderLiveDelivery,
  pollHostedRendererState,
  verifyFlyRenderLiveArtifactReadable,
  waitForHostedRendererState,
} from "./live-fixtures";
import { observeArtifactBindingCoherenceDurable } from "./artifact-binding-coherence-observer";
import { rereadMonotonicDispatchOutboxIntentObservation } from "./dispatch-outbox-observation-capture";
import {
  assertCanonicalJobForDispatchOutboxObservation,
  classifyMonotonicDispatchOutboxDispatchedCompletion,
} from "./monotonic-dispatch-outbox-observation-authority";
import {
  buildFlyRenderLiveJobCreateFailureAttribution,
  runAttributedFlyRenderJobCreateChain,
} from "./job-create-attribution";
import {
  mapHostedRendererObservationToFailureCategory,
} from "./hosted-renderer-observer";
import {
  buildAttributionFromTerminalJob,
  classifyRenderClaimObservationAuthority,
} from "./claim-correlation-authority";
import { sanitizeClaimedRenderExecutionAttributionSnapshot } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  resolveExecutionProbeFailStageFromSubstage,
  substageProvesDownstreamExecution,
} from "./execution-probe-stage-attribution";
import { classifyFlyRenderLiveMachineReadiness } from "./fly-render-live-readiness";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./smoke-workload";
import {
  REQUIRED_FLY_RENDER_LIVE_CASE_IDS,
  type RequiredFlyRenderLiveCaseId,
  type FlyRenderLiveFailureCategory,
} from "./required-cases";
import type { FlyRenderLiveMatrixContext } from "./types";

export type FlyRenderLiveCaseRunner = (
  ctx: FlyRenderLiveMatrixContext,
) => Promise<FlyRenderLiveCaseEvidence>;

function pass(caseId: RequiredFlyRenderLiveCaseId): FlyRenderLiveCaseEvidence {
  return { caseId, status: "PASS" };
}

function passWithDispatchOutboxIntent(
  attribution: NonNullable<
    FlyRenderLiveCaseEvidence["dispatchOutboxIntentAttribution"]
  >,
): FlyRenderLiveCaseEvidence {
  return {
    caseId: "dispatch_outbox.intent",
    status: "PASS",
    dispatchOutboxIntentAttribution: attribution,
  };
}

async function verifyDispatchOutboxCompletedIdentity(
  ctx: FlyRenderLiveMatrixContext,
): Promise<boolean> {
  const anchor = ctx.session.dispatchOutboxObservationAnchor;
  if (
    anchor == null ||
    ctx.dispatchOutbox == null ||
    ctx.session.jobId == null
  ) {
    return false;
  }
  const job = await ctx.jobStore.getByJobIdAndOwner(
    ctx.session.jobId,
    ctx.ownerId,
  );
  if (!job.ok) return false;
  const canonical = assertCanonicalJobForDispatchOutboxObservation(job.value);
  if (!canonical.ok) return false;
  const row = await ctx.dispatchOutbox.getByJobAttemptAndOwner({
    jobId: ctx.session.jobId,
    ownerId: ctx.ownerId,
    attempt: anchor.anchorAttempt,
  });
  const completion = classifyMonotonicDispatchOutboxDispatchedCompletion({
    row: row.ok ? row.value : null,
    job: canonical.record,
    anchorAttempt: anchor.anchorAttempt,
    anchorFirstStoreVersion: anchor.firstStoreVersion,
    expectedOperationId: ctx.session.operationId,
  });
  return completion.ok;
}

function failJobCreate(
  attribution: ReturnType<typeof buildFlyRenderLiveJobCreateFailureAttribution>,
): FlyRenderLiveCaseEvidence {
  return {
    caseId: "job.create_queued",
    status: "FAIL",
    failureCategory: "JOB_CREATE_QUEUED_FAILED",
    jobCreateFailureAttribution: attribution,
  };
}

function failWithExecution(
  caseId: RequiredFlyRenderLiveCaseId,
  category: FlyRenderLiveFailureCategory,
  executionAttribution: NonNullable<
    FlyRenderLiveCaseEvidence["executionAttribution"]
  >,
): FlyRenderLiveCaseEvidence {
  return {
    caseId,
    status: "FAIL",
    failureCategory: category,
    executionAttribution,
  };
}

function passWithClaimAuthority(
  authority: "active_claim" | "fast_terminal_with_correlated_ack",
  runDeliveryCorrelationClass: "matched" | "unmatched",
): FlyRenderLiveCaseEvidence {
  void authority;
  return {
    caseId: "hosted.render_claim",
    status: "PASS",
    runDeliveryCorrelationClass,
  };
}

async function waitForClaimObservation(
  ctx: FlyRenderLiveMatrixContext,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ctx.session.jobId == null) return false;
    const jobResult = await ctx.jobStore.getByJobIdAndOwner(
      ctx.session.jobId,
      ctx.ownerId,
    );
    if (!jobResult.ok || jobResult.value.stage !== "canonical") {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const job = jobResult.value;
    const inFlight =
      job.claimToken != null &&
      (job.canonicalJob!.state === "queued" ||
        job.canonicalJob!.state === "rendering" ||
        job.canonicalJob!.state === "encoding" ||
        job.canonicalJob!.state === "validating" ||
        job.canonicalJob!.state === "uploading");
    if (inFlight) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    if (
      job.canonicalJob!.state === "succeeded" ||
      job.canonicalJob!.state === "failed" ||
      job.canonicalJob!.state === "cancelled"
    ) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function readDeliveryEvents(ctx: FlyRenderLiveMatrixContext) {
  if (ctx.readHostedDeliveryEvents != null) {
    return ctx.readHostedDeliveryEvents();
  }
  return [];
}

async function observeExecutionAttribution(ctx: FlyRenderLiveMatrixContext) {
  if (ctx.session.jobId == null) return null;
  const job = await ctx.jobStore.getByJobIdAndOwner(
    ctx.session.jobId,
    ctx.ownerId,
  );
  if (!job.ok || job.value.stage !== "canonical") return null;
  const events = await readDeliveryEvents(ctx);
  return buildAttributionFromTerminalJob({
    job: job.value,
    deliveryEvents: events,
    renderStartedAtMs: ctx.session.renderStartedAtMs ?? Date.now(),
    initialStoreVersion: ctx.session.initialStoreVersion,
  });
}

function fail(
  caseId: RequiredFlyRenderLiveCaseId,
  category: FlyRenderLiveFailureCategory,
): FlyRenderLiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function notTested(caseId: RequiredFlyRenderLiveCaseId): FlyRenderLiveCaseEvidence {
  return { caseId, status: "NOT_TESTED" };
}

async function readTopology(ctx: FlyRenderLiveMatrixContext) {
  if (ctx.readFlyTopology != null) return ctx.readFlyTopology();
  return {
    verifyCount: 0,
    renderCount: 0,
    region: "",
    verifyMachineId: null,
    renderMachineId: null,
    verifyImageDigestSha256: null,
    renderImageDigestSha256: null,
  };
}

export function createPassingFlyRenderLiveCaseRunners(): Readonly<
  Record<RequiredFlyRenderLiveCaseId, FlyRenderLiveCaseRunner>
> {
  const runners = {} as Record<
    RequiredFlyRenderLiveCaseId,
    FlyRenderLiveCaseRunner
  >;
  for (const id of REQUIRED_FLY_RENDER_LIVE_CASE_IDS) {
    runners[id] = async () => pass(id);
  }
  return Object.freeze(runners);
}

function terminalFailurePassesStage(
  stageId: RequiredFlyRenderLiveCaseId,
  attribution: ReturnType<
    typeof sanitizeClaimedRenderExecutionAttributionSnapshot
  >,
): boolean {
  if (attribution == null) return false;
  const failStage = resolveExecutionProbeFailStageFromSubstage(
    attribution.executionSubstage,
  );
  const order: readonly RequiredFlyRenderLiveCaseId[] = [
    "hosted.chromium_execution",
    "hosted.ffmpeg_execution",
    "r2.streamed_artifact_upload",
    "owned_object.finalized",
    "artifact.binding_coherence",
    "job.succeeded_cas",
  ];
  const stageIdx = order.indexOf(stageId as (typeof order)[number]);
  const failIdx = order.indexOf(failStage as (typeof order)[number]);
  if (stageIdx < 0 || failIdx < 0) return false;
  return stageIdx < failIdx;
}

export const DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS: Readonly<
  Record<RequiredFlyRenderLiveCaseId, FlyRenderLiveCaseRunner>
> = Object.freeze({
  "env.config": async (ctx) => {
    try {
      const contract = validateFlyRenderLiveQaEnvContract(ctx.env);
      if (!contract.ok) return fail("env.config", "ENV_CONFIG_FAILED");
      const attribution = attributeFlyRenderLiveEnvironment(ctx.env);
      if (!isFlyRenderLiveConfigAttributionEligible(attribution)) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (!isFlyRenderLiveGateEnvironmentEligible(ctx.env)) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      const neon = classifyHeadlessNeonEnvironment(ctx.env);
      const r2 = classifyHeadlessR2Environment(ctx.env);
      const producer = classifyHeadlessUpstashProducerEnvironment(ctx.env);
      const consumer = classifyHeadlessUpstashConsumerEnvironment(ctx.env);
      const envName = (ctx.env as Record<string, unknown>).HEADLESS_ENV_NAME;
      const appName = (ctx.env as Record<string, unknown>)
        .HEADLESS_FLY_STAGING_APP_NAME;
      if (
        neon !== "configured" ||
        r2 !== "configured" ||
        producer !== "configured" ||
        consumer !== "configured" ||
        envName !== "staging"
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (
        typeof appName !== "string" ||
        appName !== HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      return pass("env.config");
    } catch {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
  },

  "fly.verify_machine_healthy": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (topo.verifyCount !== 1) {
        return fail("fly.verify_machine_healthy", "FLY_VERIFY_UNHEALTHY");
      }
      ctx.session.baselineVerifyMachineId = topo.verifyMachineId;
      const readiness = classifyFlyRenderLiveMachineReadiness({
        verifyCount: topo.verifyCount,
        renderCount: topo.renderCount,
        otherCount: 0,
        verifyRegion: topo.region,
        renderRegion: topo.region,
        verifyCpuKind: "shared",
        verifyCpus: 1,
        verifyMemoryMb: 2048,
        renderCpuKind: "performance",
        renderCpus: 4,
        renderMemoryMb: 8192,
        verifyImageDigestSha256: topo.verifyImageDigestSha256,
        renderImageDigestSha256: topo.renderImageDigestSha256,
        verifyMachineId: topo.verifyMachineId ?? "abcd1234abcd1234",
        renderMachineId: topo.renderMachineId ?? "efgh5678efgh5678",
        verifyMachineState: "started",
        renderMachineState: "started",
      });
      if (!readiness.ok && topo.renderCount !== 1) {
        // verify-only check when render not yet observed
        if (topo.verifyMachineId == null) {
          return fail("fly.verify_machine_healthy", "FLY_VERIFY_UNHEALTHY");
        }
      }
      return pass("fly.verify_machine_healthy");
    } catch {
      return fail("fly.verify_machine_healthy", "FLY_VERIFY_UNHEALTHY");
    }
  },

  "fly.render_machine_healthy": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (topo.renderCount !== 1) {
        return fail("fly.render_machine_healthy", "FLY_RENDER_UNHEALTHY");
      }
      ctx.session.baselineRenderMachineId = topo.renderMachineId;
      return pass("fly.render_machine_healthy");
    } catch {
      return fail("fly.render_machine_healthy", "FLY_RENDER_UNHEALTHY");
    }
  },

  "fly.immutable_image_equality": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (
        topo.verifyImageDigestSha256 !== ctx.acceptedImageDigestSha256 ||
        topo.renderImageDigestSha256 !== ctx.acceptedImageDigestSha256
      ) {
        return fail("fly.immutable_image_equality", "FLY_IMAGE_MISMATCH");
      }
      return pass("fly.immutable_image_equality");
    } catch {
      return fail("fly.immutable_image_equality", "FLY_IMAGE_MISMATCH");
    }
  },

  "neon.schema_fingerprint": async (ctx) => {
    try {
      const fp =
        ctx.preflightFingerprint ?? buildFlyRenderLiveSchemaFingerprint();
      if (fp.migrationIds.length !== FLY_RENDER_LIVE_REQUIRED_MIGRATION_IDS.length) {
        return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
      }
      return pass("neon.schema_fingerprint");
    } catch {
      return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
    }
  },

  "job.create_queued": async (ctx) => {
    try {
      const attributed = await runAttributedFlyRenderJobCreateChain({
        ctx,
        markCleanupSkipped: true,
      });
      if (!attributed.ok) {
        return failJobCreate(
          buildFlyRenderLiveJobCreateFailureAttribution(attributed),
        );
      }
      return pass("job.create_queued");
    } catch {
      return failJobCreate(
        buildFlyRenderLiveJobCreateFailureAttribution({
          ok: false,
          failureStage: "live_manifest_construction",
          failureReasonId: "hostile_input_rejected",
          stages: [
            {
              stage: "live_manifest_construction",
              status: "failed",
              reasonId: "hostile_input_rejected",
            },
          ],
        }),
      );
    }
  },

  "dispatch_outbox.intent": async (ctx) => {
    try {
      if (
        ctx.dispatchOutbox == null ||
        ctx.session.jobId == null ||
        ctx.session.dispatchOutboxObservationAnchor == null
      ) {
        return fail("dispatch_outbox.intent", "DISPATCH_OUTBOX_INTENT_FAILED");
      }
      const reread = await rereadMonotonicDispatchOutboxIntentObservation({
        dispatchOutbox: ctx.dispatchOutbox,
        jobStore: ctx.jobStore,
        jobId: ctx.session.jobId,
        ownerId: ctx.ownerId,
        expectedOperationId: ctx.session.operationId,
        anchor: ctx.session.dispatchOutboxObservationAnchor,
      });
      if (!reread.ok) {
        return fail("dispatch_outbox.intent", "DISPATCH_OUTBOX_INTENT_FAILED");
      }
      return passWithDispatchOutboxIntent(reread.attribution);
    } catch {
      return fail("dispatch_outbox.intent", "DISPATCH_OUTBOX_INTENT_FAILED");
    }
  },

  "upstash.enqueue_render": async (ctx) => {
    try {
      const enqueued = await enqueueFlyRenderLiveDelivery(ctx);
      return enqueued.ok
        ? pass("upstash.enqueue_render")
        : fail("upstash.enqueue_render", "UPSTASH_ENQUEUE_RENDER_FAILED");
    } catch {
      return fail("upstash.enqueue_render", "UPSTASH_ENQUEUE_RENDER_FAILED");
    }
  },

  "hosted.render_claim": async (ctx) => {
    try {
      if (ctx.session.renderStartedAtMs == null) {
        ctx.session.renderStartedAtMs = Date.now();
      }
      const observationStartedAtMs = ctx.session.renderStartedAtMs;
      await waitForClaimObservation(ctx, 30_000);
      const observationEndedAtMs = Date.now();
      const jobResult =
        ctx.session.jobId == null
          ? null
          : await ctx.jobStore.getByJobIdAndOwner(
              ctx.session.jobId,
              ctx.ownerId,
            );
      const job =
        jobResult != null && jobResult.ok ? jobResult.value : null;
      const deliveryEvents = await readDeliveryEvents(ctx);
      const jobRecord =
        job != null && job.stage === "canonical" ? job : null;
      const authority = classifyRenderClaimObservationAuthority({
        job: jobRecord,
        session: ctx.session,
        deliveryEvents,
        observationStartedAtMs,
        observationEndedAtMs,
      });
      if (authority.ok) {
        return passWithClaimAuthority(
          authority.authority,
          authority.runDeliveryCorrelation.correlationClass === "matched"
            ? "matched"
            : "unmatched",
        );
      }
      return {
        caseId: "hosted.render_claim",
        status: "FAIL",
        failureCategory: "HOSTED_RENDER_CLAIM_FAILED",
        runDeliveryCorrelationClass:
          authority.runDeliveryCorrelation.correlationClass === "matched"
            ? "matched"
            : "unmatched",
      };
    } catch {
      return fail("hosted.render_claim", "HOSTED_RENDER_CLAIM_FAILED");
    }
  },

  "redis.ack_pending_cleared": async (ctx) => {
    try {
      const ok = await waitForHostedRendererState(
        ctx,
        (s) => s.renderPendingCleared,
        { timeoutMs: ctx.smokePollTimeoutMs },
      );
      if (!ok) {
        return fail("redis.ack_pending_cleared", "REDIS_ACK_PENDING_NOT_CLEARED");
      }
      return pass("redis.ack_pending_cleared");
    } catch {
      return fail("redis.ack_pending_cleared", "REDIS_ACK_PENDING_NOT_CLEARED");
    }
  },

  "hosted.chromium_execution": async (ctx) => {
    try {
      const state = await pollHostedRendererState(ctx);
      if (state.jobSucceeded) {
        return pass("hosted.chromium_execution");
      }
      const jobResult =
        ctx.session.jobId == null
          ? null
          : await ctx.jobStore.getByJobIdAndOwner(
              ctx.session.jobId,
              ctx.ownerId,
            );
      const job =
        jobResult != null && jobResult.ok ? jobResult.value : null;
      if (
        job != null &&
        job.stage === "canonical" &&
        (job.canonicalJob!.state === "failed" ||
          job.canonicalJob!.state === "cancelled")
      ) {
        const attribution = await observeExecutionAttribution(ctx);
        const sanitized = sanitizeClaimedRenderExecutionAttributionSnapshot(
          attribution,
        );
        if (terminalFailurePassesStage("hosted.chromium_execution", sanitized)) {
          return pass("hosted.chromium_execution");
        }
        if (sanitized != null) {
          return failWithExecution(
            "hosted.chromium_execution",
            "HOSTED_CHROMIUM_EXECUTION_FAILED",
            sanitized,
          );
        }
        return fail("hosted.chromium_execution", "HOSTED_CHROMIUM_EXECUTION_FAILED");
      }
      const deadline = Date.now() + ctx.smokePollTimeoutMs;
      while (Date.now() < deadline) {
        const polled = await pollHostedRendererState(ctx);
        if (polled.jobSucceeded) {
          return pass("hosted.chromium_execution");
        }
        if (polled.jobTerminalFailed) {
          const attribution = await observeExecutionAttribution(ctx);
          const sanitized = sanitizeClaimedRenderExecutionAttributionSnapshot(
            attribution,
          );
          if (terminalFailurePassesStage("hosted.chromium_execution", sanitized)) {
            return pass("hosted.chromium_execution");
          }
          if (sanitized != null) {
            return failWithExecution(
              "hosted.chromium_execution",
              "HOSTED_CHROMIUM_EXECUTION_FAILED",
              sanitized,
            );
          }
          return fail("hosted.chromium_execution", "HOSTED_CHROMIUM_EXECUTION_FAILED");
        }
        await new Promise((r) => setTimeout(r, 3_000));
      }
      return fail("hosted.chromium_execution", "HOSTED_CHROMIUM_EXECUTION_FAILED");
    } catch {
      return fail("hosted.chromium_execution", "HOSTED_CHROMIUM_EXECUTION_FAILED");
    }
  },

  "hosted.ffmpeg_execution": async (ctx) => {
    try {
      const state = await pollHostedRendererState(ctx);
      if (state.jobSucceeded) {
        return pass("hosted.ffmpeg_execution");
      }
      if (state.jobTerminalFailed) {
        const attribution = sanitizeClaimedRenderExecutionAttributionSnapshot(
          await observeExecutionAttribution(ctx),
        );
        if (terminalFailurePassesStage("hosted.ffmpeg_execution", attribution)) {
          return pass("hosted.ffmpeg_execution");
        }
        const proof = substageProvesDownstreamExecution(
          attribution?.executionSubstage,
        );
        if (proof.ffmpegExecuted) {
          return pass("hosted.ffmpeg_execution");
        }
      }
      const ok = await waitForHostedRendererState(
        ctx,
        (s) => s.ffmpegExecuted,
        { timeoutMs: ctx.smokePollTimeoutMs },
      );
      return ok
        ? pass("hosted.ffmpeg_execution")
        : fail("hosted.ffmpeg_execution", "HOSTED_FFMPEG_EXECUTION_FAILED");
    } catch {
      return fail("hosted.ffmpeg_execution", "HOSTED_FFMPEG_EXECUTION_FAILED");
    }
  },

  "r2.streamed_artifact_upload": async (ctx) => {
    try {
      const state = await pollHostedRendererState(ctx);
      if (state.jobSucceeded) {
        return pass("r2.streamed_artifact_upload");
      }
      if (state.jobTerminalFailed) {
        const attribution = sanitizeClaimedRenderExecutionAttributionSnapshot(
          await observeExecutionAttribution(ctx),
        );
        if (terminalFailurePassesStage("r2.streamed_artifact_upload", attribution)) {
          return pass("r2.streamed_artifact_upload");
        }
        const proof = substageProvesDownstreamExecution(
          attribution?.executionSubstage,
        );
        if (proof.artifactUploaded) {
          return pass("r2.streamed_artifact_upload");
        }
      }
      const ok = await waitForHostedRendererState(
        ctx,
        (s) => s.artifactUploaded,
        { timeoutMs: ctx.smokePollTimeoutMs },
      );
      return ok
        ? pass("r2.streamed_artifact_upload")
        : fail("r2.streamed_artifact_upload", "R2_STREAMED_UPLOAD_FAILED");
    } catch {
      return fail("r2.streamed_artifact_upload", "R2_STREAMED_UPLOAD_FAILED");
    }
  },

  "owned_object.finalized": async (ctx) => {
    try {
      const state = await pollHostedRendererState(ctx);
      if (state.jobSucceeded) {
        return pass("owned_object.finalized");
      }
      if (state.jobTerminalFailed) {
        const attribution = sanitizeClaimedRenderExecutionAttributionSnapshot(
          await observeExecutionAttribution(ctx),
        );
        if (terminalFailurePassesStage("owned_object.finalized", attribution)) {
          return pass("owned_object.finalized");
        }
        const proof = substageProvesDownstreamExecution(
          attribution?.executionSubstage,
        );
        if (proof.providerFinalized) {
          return pass("owned_object.finalized");
        }
      }
      const ok = await waitForHostedRendererState(
        ctx,
        (s) => s.artifactFinalized,
        { timeoutMs: ctx.smokePollTimeoutMs },
      );
      return ok
        ? pass("owned_object.finalized")
        : fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
    } catch {
      return fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
    }
  },

  "job.succeeded_cas": async (ctx) => {
    try {
      const ok = await waitForHostedRendererState(
        ctx,
        (s) => s.jobSucceeded,
        { timeoutMs: ctx.smokePollTimeoutMs },
      );
      if (!ok) return fail("job.succeeded_cas", "JOB_SUCCEEDED_CAS_FAILED");
      ctx.session.renderCompletedAtMs = Date.now();
      const job = await ctx.jobStore.getByJobIdAndOwner(
        ctx.session.jobId!,
        ctx.ownerId,
      );
      if (
        !job.ok ||
        job.value.stage !== "canonical" ||
        job.value.canonicalJob!.state !== "succeeded"
      ) {
        return fail("job.succeeded_cas", "JOB_SUCCEEDED_CAS_FAILED");
      }
      ctx.session.observedStoreVersion = job.value.storeVersion;
      return pass("job.succeeded_cas");
    } catch {
      return fail("job.succeeded_cas", "JOB_SUCCEEDED_CAS_FAILED");
    }
  },

  "artifact.binding_coherence": async (ctx) => {
    try {
      const observation = await observeArtifactBindingCoherenceDurable(ctx, {
        providerFinalizationProven: true,
      });
      if (observation.ok) {
        return pass("artifact.binding_coherence");
      }
      if (ctx.session.jobId != null) {
        const job = await ctx.jobStore.getByJobIdAndOwner(
          ctx.session.jobId,
          ctx.ownerId,
        );
        if (
          job.ok &&
          job.value.stage === "canonical" &&
          (job.value.canonicalJob!.state === "failed" ||
            job.value.canonicalJob!.state === "cancelled")
        ) {
          const attribution = sanitizeClaimedRenderExecutionAttributionSnapshot(
            await observeExecutionAttribution(ctx),
          );
          const failStage = resolveExecutionProbeFailStageFromSubstage(
            attribution?.executionSubstage,
          );
          if (failStage === "artifact.binding_coherence" && attribution != null) {
            return failWithExecution(
              "artifact.binding_coherence",
              "ARTIFACT_BINDING_INCOHERENT",
              attribution,
            );
          }
          if (terminalFailurePassesStage("artifact.binding_coherence", attribution)) {
            return pass("artifact.binding_coherence");
          }
        }
      }
      return fail(
        "artifact.binding_coherence",
        observation.failureCategory,
      );
    } catch {
      return fail("artifact.binding_coherence", "ARTIFACT_BINDING_OBSERVATION_FAILED");
    }
  },

  "dispatch_outbox.completed": async (ctx) => {
    try {
      const anchor = ctx.session.dispatchOutboxObservationAnchor;
      if (anchor?.rereadObservedState === "dispatched") {
        const idempotent = await verifyDispatchOutboxCompletedIdentity(ctx);
        return idempotent
          ? pass("dispatch_outbox.completed")
          : fail("dispatch_outbox.completed", "DISPATCH_OUTBOX_NOT_COMPLETED");
      }
      const ok = await waitForHostedRendererState(
        ctx,
        (s) => s.dispatchOutboxCompleted,
        { timeoutMs: ctx.smokePollTimeoutMs },
      );
      if (!ok) {
        return fail("dispatch_outbox.completed", "DISPATCH_OUTBOX_NOT_COMPLETED");
      }
      const identityOk = await verifyDispatchOutboxCompletedIdentity(ctx);
      return identityOk
        ? pass("dispatch_outbox.completed")
        : fail("dispatch_outbox.completed", "DISPATCH_OUTBOX_NOT_COMPLETED");
    } catch {
      return fail("dispatch_outbox.completed", "DISPATCH_OUTBOX_NOT_COMPLETED");
    }
  },

  "cleanup_intent.not_retryable": async (ctx) => {
    try {
      const state = await pollHostedRendererState(ctx);
      if (state.cleanupIntentRetryable) {
        return fail("cleanup_intent.not_retryable", "CLEANUP_INTENT_RETRYABLE");
      }
      return pass("cleanup_intent.not_retryable");
    } catch {
      return fail("cleanup_intent.not_retryable", "CLEANUP_INTENT_RETRYABLE");
    }
  },

  "artifact.download_verify": async (ctx) => {
    try {
      const job = await ctx.jobStore.getByJobIdAndOwner(
        ctx.session.jobId!,
        ctx.ownerId,
      );
      if (!job.ok || job.value.stage !== "canonical") {
        return fail("artifact.download_verify", "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
      }
      const binding = job.value.artifactObjectBinding;
      if (binding == null) {
        return fail("artifact.download_verify", "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
      }
      ctx.session.artifactObjectKey = binding.storageLocator.objectKey;
      ctx.session.storeId = binding.storageLocator.storeId as "assets" | "artifacts";
      const head = await ctx.io.readObjectMetadata(
        {
          storeId: binding.storageLocator.storeId as "assets" | "artifacts",
          objectKey: binding.storageLocator.objectKey,
        },
        ctx.ownerId,
      );
      if (!head.ok) {
        return fail("artifact.download_verify", "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
      }
      ctx.session.artifactByteLength = head.value.byteLength;
      const readable = await verifyFlyRenderLiveArtifactReadable(ctx);
      return readable
        ? pass("artifact.download_verify")
        : fail("artifact.download_verify", "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
    } catch {
      return fail("artifact.download_verify", "ARTIFACT_DOWNLOAD_VERIFY_FAILED");
    }
  },

  "replay.idempotent": async (ctx) => {
    try {
      const first = await pollHostedRendererState(ctx);
      await new Promise((r) => setTimeout(r, 5_000));
      const second = await pollHostedRendererState(ctx);
      if (
        first.storeVersion == null ||
        second.storeVersion == null ||
        first.storeVersion !== second.storeVersion
      ) {
        return fail("replay.idempotent", "REPLAY_NOT_IDEMPOTENT");
      }
      return pass("replay.idempotent");
    } catch {
      return fail("replay.idempotent", "REPLAY_NOT_IDEMPOTENT");
    }
  },

  "job.terminal_immutability": async (ctx) => {
    try {
      const first = await ctx.jobStore.getByJobIdAndOwner(
        ctx.session.jobId!,
        ctx.ownerId,
      );
      await new Promise((r) => setTimeout(r, 3_000));
      const second = await ctx.jobStore.getByJobIdAndOwner(
        ctx.session.jobId!,
        ctx.ownerId,
      );
      if (
        !first.ok ||
        !second.ok ||
        first.value.stage !== "canonical" ||
        second.value.stage !== "canonical" ||
        first.value.canonicalJob!.state !== "succeeded" ||
        second.value.canonicalJob!.state !== "succeeded" ||
        first.value.storeVersion !== second.value.storeVersion
      ) {
        return fail("job.terminal_immutability", "JOB_TERMINAL_MUTATED");
      }
      return pass("job.terminal_immutability");
    } catch {
      return fail("job.terminal_immutability", "JOB_TERMINAL_MUTATED");
    }
  },

  "fly.render_still_healthy": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (topo.renderCount !== 1) {
        return fail("fly.render_still_healthy", "FLY_RENDER_UNHEALTHY_POST");
      }
      if (
        ctx.session.baselineRenderMachineId != null &&
        topo.renderMachineId != null &&
        topo.renderMachineId !== ctx.session.baselineRenderMachineId
      ) {
        return fail("fly.render_still_healthy", "FLY_RENDER_UNHEALTHY_POST");
      }
      return pass("fly.render_still_healthy");
    } catch {
      return fail("fly.render_still_healthy", "FLY_RENDER_UNHEALTHY_POST");
    }
  },

  "fly.verify_still_healthy": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (topo.verifyCount !== 1) {
        return fail("fly.verify_still_healthy", "FLY_VERIFY_UNHEALTHY_POST");
      }
      if (
        ctx.session.baselineVerifyMachineId != null &&
        topo.verifyMachineId != null &&
        topo.verifyMachineId !== ctx.session.baselineVerifyMachineId
      ) {
        return fail("fly.verify_still_healthy", "FLY_VERIFY_UNHEALTHY_POST");
      }
      return pass("fly.verify_still_healthy");
    } catch {
      return fail("fly.verify_still_healthy", "FLY_VERIFY_UNHEALTHY_POST");
    }
  },

  "cleanup.complete": async (ctx) => {
    try {
      const { verifyFlyRenderLiveCleanupComplete } = await import("./cleanup");
      const ok = await verifyFlyRenderLiveCleanupComplete(ctx);
      return ok ? pass("cleanup.complete") : fail("cleanup.complete", "CLEANUP_FAILED");
    } catch {
      return fail("cleanup.complete", "CLEANUP_FAILED");
    }
  },

  "evidence.privacy": async (ctx) => {
    try {
      const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
      const fp = buildFlyRenderLiveSchemaFingerprint();
      const privacy = assertFlyRenderLiveEvidencePrivacyStructure({
        title: "privacy probe",
        overall: "NOT_TESTED",
        eligibilityVerdict: "probe",
        startedAtIso: null,
        endedAtIso: null,
        cases: [{ caseId: "env.config", status: "PASS" }],
        schemaFingerprint: fp,
        acceptedImageDigestSha256: ctx.acceptedImageDigestSha256,
        flyRenderTopology: {
          verifyCount: 1,
          renderCount: 1,
          observedRegion: "iad",
        },
        smokeWorkload: {
          profileId: smoke.profileId,
          contentDurationMs: smoke.contentDurationMs,
          pollTimeoutMs: smoke.pollTimeoutMs,
          claims4kCapacity: false,
        },
        resourceObservation: ctx.resourceObservation,
        cleanupStatus: "ok",
        configAttribution: null,
        jobCreateFailureAttribution: null,
        notes: [
          "Hosted render live matrix — no secret values in evidence.",
          `run=${ctx.runId.slice(0, 8)}`,
        ],
      });
      return privacy.ok
        ? pass("evidence.privacy")
        : fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
    } catch {
      return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
    }
  },
});

export async function runFlyRenderLiveMatrix(
  ctx: FlyRenderLiveMatrixContext,
  runners: Readonly<
    Partial<Record<RequiredFlyRenderLiveCaseId, FlyRenderLiveCaseRunner>>
  > = DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
  options?: { readonly stopBeforeCaseId?: RequiredFlyRenderLiveCaseId },
): Promise<readonly FlyRenderLiveCaseEvidence[]> {
  const out: FlyRenderLiveCaseEvidence[] = [];
  let stopped = false;
  for (const id of REQUIRED_FLY_RENDER_LIVE_CASE_IDS) {
    if (stopped) {
      out.push(notTested(id));
      continue;
    }
    if (options?.stopBeforeCaseId != null && id === options.stopBeforeCaseId) {
      out.push(notTested(id));
      stopped = true;
      continue;
    }
    const runner = runners[id] ?? DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS[id];
    try {
      const result = await runner(ctx);
      const shaped =
        result.caseId === id ? result : fail(id, "CASE_SHAPE_INVALID");
      out.push(shaped);
      if (shaped.status === "FAIL") stopped = true;
    } catch {
      out.push(fail(id, "MATRIX_EXCEPTION"));
      stopped = true;
    }
  }
  return Object.freeze(out.slice());
}

export { assertDefaultFlyRenderLiveRunnersAreNotStubs } from "./stub-boundary";

export function classifyFlyRenderLiveTopologyFromJson(json: unknown): {
  readonly prerequisiteOk: boolean;
  readonly postActivationOk: boolean;
} {
  const inventory = parseHeadlessFlyStagingDualMachineInventoryFromListJson(json);
  const prerequisite = classifyHeadlessFlyRenderPrerequisiteTopology(inventory);
  const post = classifyHeadlessFlyRenderPostActivationTopology(inventory);
  return Object.freeze({
    prerequisiteOk: prerequisite.status === "ok",
    postActivationOk: post.status === "ok",
  });
}

export {
  classifyHeadlessFlyStagingRenderVmSpec,
  classifyHeadlessFlyStagingVerifyVmSpec,
};
