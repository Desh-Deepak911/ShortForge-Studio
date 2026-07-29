/**
 * Execute Chromium composition + native FFmpeg encode for a claimed job.
 */

import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import { materializeOwnedAssets } from "../assets/materialize-owned-assets";
import { WorkspaceByteBudget } from "../assets/workspace-quota";
import { createHeadlessWorkerWorkspace } from "../assets/workspace";
import { authorizeArtifactFile } from "../artifact/artifact-file-authority";
import { createArtifactFileLease } from "../artifact/artifact-file-lease";
import { buildValidatedHeadlessArtifact } from "../artifact/build-validated-artifact";
import { hashArtifactFileIncremental } from "../artifact/incremental-sha256";
import { resolveSystemChromeExecutable } from "../chromium/chrome-executable";
import { renderFramesWithChromium } from "../chromium/render-session";
import { scrubWorkerMessage } from "../diagnostics/scrub-worker-message";
import { assertAudioDescriptorQuotas } from "../audio/assert-audio-descriptor-quotas";
import { buildHeadlessAudioPlan } from "../audio/build-headless-audio-plan";
import { resolveOwnedAudioBindings } from "../audio/resolve-owned-audio-bindings";
import { startStreamedPngEncode } from "../ffmpeg/encode-png-stream";
import { isOutputAtOrOverCeiling } from "../ffmpeg/output-ceiling";
import { probeArtifactWithFfprobe } from "../ffmpeg/probe-artifact";
import { resolveNativeFfmpegBinaries } from "../ffmpeg/resolve-ffmpeg-binaries";
import { assertPhase3WorkerCapability } from "./capability-preflight";
import { assertClaimedWorkerJob } from "./claim-gate";
import { buildHeadlessFramePlan } from "./frame-plan";
import {
  failureReasonForDeadline,
  type JobDeadlineController,
} from "./job-deadline";
import { assertHeadlessManifestTargetCompatibility } from "./render-target";
import { resolveEffectiveWorkerLimits } from "./resolve-worker-limits";
import { buildHeadlessRunMetrics, HeadlessRssSampler } from "./run-metrics";
import {
  type HeadlessWorkerLimits,
  type HeadlessWorkerRunInput,
  type HeadlessWorkerRunResult,
} from "./worker-types";
import {
  withSourceMaterializationContext,
} from "./classify-provider-render-context";
import {
  createNoOpProviderBackedBoundaryTelemetry,
  type ProviderBackedBoundaryTelemetryPort,
  type ProviderContextClassifications,
} from "./provider-backed-boundary-telemetry";
import {
  HEADLESS_PAGE_WORKSPACE_HTML_NAME,
  HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
} from "../chromium/materialize-headless-page-workspace";

export async function executeHeadlessRenderJob(input: {
  run: HeadlessWorkerRunInput;
  storage: HeadlessStoragePort;
  limits?: Partial<HeadlessWorkerLimits>;
  deadline?: JobDeadlineController;
  /** Optional lifecycle hooks (rendering → encoding → validating). */
  onStage?: (
    stage: "rendering" | "encoding" | "validating",
  ) => Promise<void>;
  /** Advisory frame progress — throttled CAS writes during rendering only. */
  onFrameProgress?: (input: {
    readonly completedFrames: number;
    readonly totalFrames: number;
  }) => Promise<void>;
  boundaryTelemetry?: ProviderBackedBoundaryTelemetryPort;
  providerContext?: ProviderContextClassifications;
}): Promise<HeadlessWorkerRunResult> {
  const boundaryTelemetry =
    input.boundaryTelemetry ?? createNoOpProviderBackedBoundaryTelemetry();
  let providerContext = input.providerContext;
  const gate = assertClaimedWorkerJob({
    record: input.run.record,
    claimToken: input.run.claimToken,
    ownerId: input.run.ownerId,
    nowMs: input.run.nowMs,
  });
  if (gate) return gate;

  const capability = assertPhase3WorkerCapability({
    request: input.run.record.canonicalRequest,
  });
  if (capability) return capability;

  const targetResolved = assertHeadlessManifestTargetCompatibility({
    manifest: input.run.record.canonicalRequest.manifest,
    rendererProfile: input.run.record.canonicalRequest.rendererProfile,
  });
  if (!targetResolved.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }
  const renderTarget = targetResolved.target;
  const outputProfile = renderTarget.profile;

  // Provider capacity ∩ profile ceilings. Profiles may narrow, never widen.
  // Insufficient provider capacity rejects before Chromium / workspace / FFmpeg.
  const resolvedLimits = resolveEffectiveWorkerLimits({
    profile: outputProfile,
    overrides: input.limits,
  });
  if (!resolvedLimits.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }
  const limits: HeadlessWorkerLimits = resolvedLimits.limits;

  const audioPlanResult = buildHeadlessAudioPlan(input.run.record.canonicalRequest.manifest);
  if (!audioPlanResult.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }
  const audioPlan = audioPlanResult.plan;

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    return {
      ok: false,
      reasonId: "WORKER_FAILED",
      message: scrubWorkerMessage("chromium"),
      retryable: false,
      executionSubstage: "chromium_preflight",
    };
  }
  const ffmpeg = resolveNativeFfmpegBinaries();
  boundaryTelemetry.emit("ffmpeg_preflight_started");
  if (!ffmpeg.ok) {
    boundaryTelemetry.emit("ffmpeg_preflight_completed", {
      ffmpegOutcomeClass: "failed",
    });
    return {
      ok: false,
      reasonId: "WORKER_FAILED",
      message: scrubWorkerMessage("encode"),
      retryable: false,
      executionSubstage: "ffmpeg_preflight",
    };
  }
  boundaryTelemetry.emit("ffmpeg_preflight_completed", {
    ffmpegOutcomeClass: "succeeded",
  });

  const record = input.run.record;
  const workspace = createHeadlessWorkerWorkspace({
    jobId: record.canonicalJob.jobId,
    attempt: record.canonicalJob.attempt,
  });
  const budget = new WorkspaceByteBudget(limits);
  const signal = input.deadline?.signal ?? input.run.signal;
  const started = Date.now();
  const rssSampler = new HeadlessRssSampler();
  rssSampler.start(250);
  let renderStageMs: number | null = null;
  let encodeStageMs: number | null = null;
  let probeStageMs: number | null = null;
  /** When true, workspace cleanup is owned by the returned artifact lease. */
  let leaseHandedOff = false;

  const abortedFailure = (): HeadlessWorkerRunResult | null => {
    const kind = input.deadline?.abortKind() ?? null;
    const mapped = failureReasonForDeadline(
      kind ?? (signal?.aborted ? "cancelled" : null),
    );
    if (!mapped && !signal?.aborted) return null;
    return {
      ok: false,
      reasonId: mapped ?? "CANCELLED_BY_USER",
      message: scrubWorkerMessage(
        mapped === "WORKER_TIMEOUT" ? "timeout" : "cancelled",
      ),
      retryable: mapped === "WORKER_TIMEOUT",
    };
  };

  try {
        const early = abortedFailure();
    if (early) return early;

    const manifestJson = JSON.stringify(record.canonicalRequest.manifest);
    const manifestBytes = Buffer.byteLength(manifestJson, "utf8");
    const manifestReserve = budget.reserve(manifestBytes, "manifest");
    if (!manifestReserve.ok) {
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: manifestReserve.message,
        retryable: false,
      };
    }
    try {
      writeFileSync(workspace.manifestPath, manifestJson, "utf8");
      budget.commit(manifestReserve.reservationId, manifestBytes);
    } catch {
      budget.release(manifestReserve.reservationId);
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
        retryable: false,
      };
    }

    // Audio descriptor ceilings — reject before any openOwnedObject / write.
    const audioQuota = assertAudioDescriptorQuotas({
      manifest: record.canonicalRequest.manifest,
      plan: audioPlan,
      bundle: record.canonicalRequest.assetBundle,
      maxSingleAudioAssetBytes: limits.maxSingleAudioAssetBytes,
      maxAggregateAudioBytes: limits.maxAggregateAudioBytes,
    });
    if (!audioQuota.ok) {
      return {
        ok: false,
        reasonId: audioQuota.reasonId,
        message: audioQuota.message,
        retryable: false,
      };
    }

    const beforeStage = abortedFailure();
    if (beforeStage) return beforeStage;

    boundaryTelemetry.emit("source_assets_materialization_started", {
      providerContext: providerContext ?? undefined,
    });
    const staged = await materializeOwnedAssets({
      storage: input.storage,
      ownerId: input.run.ownerId,
      bundle: record.canonicalRequest.assetBundle,
      workspace,
      nowMs: input.run.nowMs,
      maxTotalAssetBytes: limits.maxTotalAssetBytes,
      budget,
      signal,
      abortKind: () => input.deadline?.abortKind() ?? null,
      boundaryTelemetry,
      reservedPagePaths: [
        HEADLESS_PAGE_WORKSPACE_HTML_NAME,
        HEADLESS_PAGE_WORKSPACE_SCRIPT_NAME,
      ],
    });
    if (providerContext != null) {
      providerContext = withSourceMaterializationContext(providerContext, {
        ok: staged.ok,
        assetCount: staged.ok ? staged.assets.length : 0,
        byteVerificationFailed:
          !staged.ok && staged.reasonId === "WORKER_FAILED",
        reservedPathCollision:
          !staged.ok && staged.reasonId === "WORKER_FAILED",
        pageIntegrityIntact: staged.ok,
      });
    }
    boundaryTelemetry.emit("source_assets_materialization_complete", {
      providerContext: providerContext ?? undefined,
    });
    if (!staged.ok) {
            if (
        staged.reasonId === "CANCELLED_BY_USER" ||
        staged.reasonId === "WORKER_TIMEOUT"
      ) {
        return {
          ok: false,
          reasonId: staged.reasonId,
          message: scrubWorkerMessage(
            staged.reasonId === "WORKER_TIMEOUT" ? "timeout" : "cancelled",
          ),
          retryable: staged.reasonId === "WORKER_TIMEOUT",
        };
      }
      return {
        ok: false,
        reasonId:
          staged.reasonId === "WORKSPACE_QUOTA_EXCEEDED"
            ? "WORKSPACE_QUOTA_EXCEEDED"
            : "WORKER_FAILED",
        message: scrubWorkerMessage(
          staged.reasonId === "WORKSPACE_QUOTA_EXCEEDED" ? "quota" : "internal",
        ),
        retryable: staged.reasonId !== "WORKSPACE_QUOTA_EXCEEDED",
        executionSubstage:
          staged.reasonId === "WORKSPACE_QUOTA_EXCEEDED"
            ? "workspace_prepare"
            : "source_binding_resolution",
        ...(staged.sourceBindingAttribution != null
          ? { sourceBindingAttribution: staged.sourceBindingAttribution }
          : {}),
      };
    }

    const audioBindings = resolveOwnedAudioBindings({
      manifest: record.canonicalRequest.manifest,
      plan: audioPlan,
      staged: staged.assets,
    });
    if (!audioBindings.ok) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
        retryable: false,
      };
    }

    const plan = buildHeadlessFramePlan(
      record.canonicalRequest.manifest,
      limits.maxFrames,
      renderTarget,
    );
    if (!plan.ok) {
      return {
        ok: false,
        reasonId: "INVALID_JOB",
        message: scrubWorkerMessage("internal"),
        retryable: false,
      };
    }

    // Phase 3.2A: authorize artifact capacity before FFmpeg writes; stream PNG
    // frames via image2pipe. Leave single-frame headroom so transient frame
    // reserves cannot widen or silently consume the authorized artifact ceiling.
    const outputPath = join(
      workspace.outputDir,
      `artifact${outputProfile.extension}`,
    );
    const frameHeadroom = limits.maxSingleFrameBytes;
    const maxOutputBytes = Math.min(
      limits.maxArtifactBytes,
      Math.max(0, budget.remainingWorkspaceCapacity() - frameHeadroom),
    );
    if (maxOutputBytes < 1) {
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
        retryable: false,
      };
    }
    const artifactReserve = budget.reserve(maxOutputBytes, "artifact");
    if (!artifactReserve.ok) {
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: artifactReserve.message,
        retryable: false,
      };
    }
    const releaseArtifact = () => {
      budget.release(artifactReserve.reservationId);
    };

    boundaryTelemetry.emit("ffmpeg_process_started");
    const streamStarted = await startStreamedPngEncode({
      ffmpegExecutable: ffmpeg.ffmpegExecutable,
      frameCount: plan.plan.totalFrames,
      fps: 30,
      outputPath,
      outputProfile,
      audioPlan,
      voiceoverPath: audioBindings.bindings.voiceoverPath,
      musicPath: audioBindings.bindings.musicPath,
      maxOutputBytes,
      timeoutMs: Math.min(
        limits.jobTimeoutMs,
        input.deadline?.remainingMs() ?? limits.jobTimeoutMs,
      ),
      maxStderrBytes: limits.maxStderrBytes,
      signal,
      processGraceMs: limits.processGraceMs,
      streamLimits: {
        expectedFrameCount: plan.plan.totalFrames,
        expectedWidth: plan.plan.width,
        expectedHeight: plan.plan.height,
        maxSingleFrameBytes: limits.maxSingleFrameBytes,
        // Logical streamed volume ceiling (not disk-resident PNG aggregate).
        maxTotalStreamedFrameBytes: limits.maxAggregateFrameBytes,
        maxWritableBufferedBytes: limits.maxSingleFrameBytes * 2,
        writeDrainTimeoutMs: Math.min(60_000, limits.evaluateTimeoutMs * 4),
      },
    });
    if (!streamStarted.ok) {
      releaseArtifact();
      boundaryTelemetry.emit("ffmpeg_process_terminal", {
        ffmpegOutcomeClass: "failed",
      });
      return {
        ok: false,
        reasonId: streamStarted.cancelled
          ? "CANCELLED_BY_USER"
          : "ENCODE_FAILED",
        message: scrubWorkerMessage(
          streamStarted.cancelled ? "cancelled" : "encode",
        ),
        retryable: !streamStarted.cancelled,
        executionSubstage: "ffmpeg_execution",
      };
    }
    const encodeSession = streamStarted.session;

    await input.onStage?.("rendering");
    const afterStage = abortedFailure();
    if (afterStage) {
      encodeSession.abort();
      await encodeSession.closeAndWait().catch(() => undefined);
      releaseArtifact();
      return afterStage;
    }

    const overlappedStarted = Date.now();
    const renderStarted = Date.now();
    let completedFrames = 0;
    const totalFrames = plan.plan.totalFrames;
    const rendered = await renderFramesWithChromium({
      chromeExecutable: chrome.executable,
      workspace,
      manifest: record.canonicalRequest.manifest,
      stagedAssets: staged.assets,
      framePlan: plan.plan,
      signal,
      budget,
      limits,
      remainingMs: () => input.deadline?.remainingMs() ?? limits.jobTimeoutMs,
      boundaryTelemetry,
      providerContext: providerContext ?? undefined,
      onPngFrame: async (frame) => {
        const accepted = await encodeSession.acceptFrame({
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestampMs,
          pngBytes: frame.pngBytes,
          signal,
        });
        if (!accepted.ok) {
          return {
            ok: false,
            message: scrubWorkerMessage(
              accepted.reason === "aborted" ? "cancelled" : "encode",
            ),
            cancelled: accepted.reason === "aborted",
            quota: accepted.reason === "frame_too_large",
          };
        }
        completedFrames += 1;
        if (input.onFrameProgress) {
          try {
            await input.onFrameProgress({
              completedFrames,
              totalFrames,
            });
          } catch {
            /* progress must never fail render */
          }
        }
        return { ok: true };
      },
    });
    renderStageMs = Date.now() - renderStarted;
    encodeSession.setChromiumElapsedMs(renderStageMs);

    if (!rendered.ok) {
      encodeSession.abort();
      await encodeSession.closeAndWait().catch(() => undefined);
      releaseArtifact();
      const mapped = failureReasonForDeadline(input.deadline?.abortKind() ?? null);
      if (mapped || rendered.timedOut) {
        return {
          ok: false,
          reasonId: mapped ?? "WORKER_TIMEOUT",
          message: scrubWorkerMessage("timeout"),
          retryable: true,
        };
      }
      return {
        ok: false,
        reasonId: rendered.cancelled
          ? "CANCELLED_BY_USER"
          : rendered.quota
            ? "WORKSPACE_QUOTA_EXCEEDED"
            : "WORKER_FAILED",
        message: scrubWorkerMessage(
          rendered.cancelled
            ? "cancelled"
            : rendered.quota
              ? "quota"
              : "chromium",
        ),
        retryable: !rendered.cancelled && !rendered.quota,
        executionSubstage: rendered.executionSubstage,
        pageFailureReason: rendered.pageFailureReason,
        pageResponseClass: rendered.pageResponseClass,
        pageWorkspaceAttribution: rendered.pageWorkspaceAttribution,
        sourceBindingAttribution: staged.sourceBindingAttribution,
      };
    }

    await input.onStage?.("encoding");
    const afterEncodeStage = abortedFailure();
    if (afterEncodeStage != null && afterEncodeStage.ok === false) {
      encodeSession.abort();
      await encodeSession.closeAndWait().catch(() => undefined);
      releaseArtifact();
      boundaryTelemetry.emit("ffmpeg_input_completed");
      boundaryTelemetry.emit("ffmpeg_process_terminal", {
        ffmpegOutcomeClass: "failed",
      });
      return {
        ok: false as const,
        reasonId: afterEncodeStage.reasonId,
        message: afterEncodeStage.message,
        retryable: afterEncodeStage.retryable,
        executionSubstage: "ffmpeg_execution" as const,
      };
    }

    let encoded: Awaited<ReturnType<typeof encodeSession.closeAndWait>>;
    boundaryTelemetry.emit("ffmpeg_input_completed");
    try {
      encoded = await encodeSession.closeAndWait();
    } catch {
      releaseArtifact();
      boundaryTelemetry.emit("ffmpeg_process_terminal", {
        ffmpegOutcomeClass: "failed",
      });
      return {
        ok: false,
        reasonId: "ENCODE_FAILED",
        message: scrubWorkerMessage("encode"),
        retryable: true,
        executionSubstage: "ffmpeg_execution",
      };
    }
    const overlappedMs = Date.now() - overlappedStarted;
    // Wall clock covering concurrent Chromium + FFmpeg (stdin closed after last frame).
    encodeStageMs = overlappedMs;
    const streamMetrics = {
      ...encoded.metrics,
      overlappedRenderEncodeElapsedMs: overlappedMs,
      chromiumRenderElapsedMs:
        encoded.metrics.chromiumRenderElapsedMs ?? renderStageMs ?? null,
    };

    const outputSizeAfterEncode =
      existsSync(outputPath) ? statSync(outputPath).size : 0;

    // Exact-cap and over-cap are quota exhaustion — before commit and before probe.
    if (isOutputAtOrOverCeiling(outputSizeAfterEncode, maxOutputBytes)) {
      releaseArtifact();
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
        retryable: false,
      };
    }

    if (!encoded.ok) {
      releaseArtifact();
      boundaryTelemetry.emit("ffmpeg_process_terminal", {
        ffmpegOutcomeClass: "failed",
      });
      const mapped = failureReasonForDeadline(input.deadline?.abortKind() ?? null);
      if (mapped || encoded.timedOut) {
        return {
          ok: false,
          reasonId: mapped ?? "WORKER_TIMEOUT",
          message: scrubWorkerMessage("timeout"),
          retryable: true,
          executionSubstage: "ffmpeg_execution",
        };
      }
      return {
        ok: false,
        reasonId: encoded.cancelled ? "CANCELLED_BY_USER" : "ENCODE_FAILED",
        message: scrubWorkerMessage(encoded.cancelled ? "cancelled" : "encode"),
        retryable: !encoded.cancelled,
        executionSubstage: "ffmpeg_execution",
      };
    }
    boundaryTelemetry.emit("ffmpeg_process_terminal", {
      ffmpegOutcomeClass: "succeeded",
    });

    // File authority — metadata only; never whole-file buffer into Node.
    const authorized = authorizeArtifactFile({
      absolutePath: outputPath,
      maxBytes: maxOutputBytes,
      minBytes: 32,
    });
    if (!authorized.ok) {
      releaseArtifact();
      if (
        authorized.reason === "oversized" ||
        authorized.reason === "truncated"
      ) {
        return {
          ok: false,
          reasonId: "WORKSPACE_QUOTA_EXCEEDED",
          message: scrubWorkerMessage("quota"),
          retryable: false,
        };
      }
      return {
        ok: false,
        reasonId: "ENCODE_FAILED",
        message: scrubWorkerMessage("encode"),
        retryable: true,
      };
    }
    if (isOutputAtOrOverCeiling(authorized.identity.byteLength, maxOutputBytes)) {
      releaseArtifact();
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
        retryable: false,
      };
    }
    // Commit actual artifact bytes against the pre-write authorization.
    const committed = budget.commit(
      artifactReserve.reservationId,
      authorized.identity.byteLength,
    );
    if (!committed.ok) {
      releaseArtifact();
      return {
        ok: false,
        reasonId: "WORKSPACE_QUOTA_EXCEEDED",
        message: scrubWorkerMessage("quota"),
        retryable: false,
      };
    }

    await input.onStage?.("validating");
    const afterValidateStage = abortedFailure();
    if (afterValidateStage) return afterValidateStage;

    const probeStarted = Date.now();
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: ffmpeg.ffprobeExecutable,
      artifactPath: authorized.identity.absolutePath,
      timeoutMs: Math.min(
        30_000,
        input.deadline?.remainingMs() ?? 30_000,
      ),
      maxStderrBytes: limits.maxStderrBytes,
      signal,
      processGraceMs: limits.processGraceMs,
    });
    probeStageMs = Date.now() - probeStarted;
    if (!probed.ok) {
      return {
        ok: false,
        reasonId: "ARTIFACT_PROBE_MISMATCH",
        message: scrubWorkerMessage("probe"),
        retryable: true,
      };
    }

    const hashed = await hashArtifactFileIncremental({
      identity: authorized.identity,
      maxChunkBytes: Math.min(1024 * 1024, limits.maxSingleFrameBytes),
      signal,
      timeoutMs: Math.min(
        limits.jobTimeoutMs,
        input.deadline?.remainingMs() ?? limits.jobTimeoutMs,
      ),
    });
    if (!hashed.ok) {
      const mapped = failureReasonForDeadline(input.deadline?.abortKind() ?? null);
      if (hashed.reason === "aborted" || mapped === "CANCELLED_BY_USER") {
        return {
          ok: false,
          reasonId: "CANCELLED_BY_USER",
          message: scrubWorkerMessage("cancelled"),
          retryable: false,
        };
      }
      if (hashed.reason === "timeout" || mapped === "WORKER_TIMEOUT") {
        return {
          ok: false,
          reasonId: "WORKER_TIMEOUT",
          message: scrubWorkerMessage("timeout"),
          retryable: true,
        };
      }
      return {
        ok: false,
        reasonId: "ARTIFACT_PROBE_MISMATCH",
        message: scrubWorkerMessage("probe"),
        retryable: true,
      };
    }

    const nodeCoordinatorPeakRssBytes = rssSampler.stop();
    const metrics = buildHeadlessRunMetrics({
      renderStageMs,
      encodeStageMs,
      probeStageMs,
      uploadStageMs: null,
      totalElapsedMs: Date.now() - started,
      budget,
      artifactBytes: authorized.identity.byteLength,
      nodeCoordinatorPeakRssBytes,
      frameCount: plan.plan.totalFrames,
      stream: streamMetrics,
      overlappedRenderEncodeElapsedMs: overlappedMs,
      artifactHashElapsedMs: hashed.elapsedMs,
    });

    const built = buildValidatedHeadlessArtifact({
      contentDigest: hashed.contentDigest,
      byteLength: authorized.identity.byteLength,
      probe: probed.probe,
      request: record.canonicalRequest,
      job: record.canonicalJob,
      nowMs: input.run.nowMs,
      outputProfile,
      renderTarget,
      evidenceBase: {
        chromeVersion: chrome.version,
        ffmpegVersion: ffmpeg.ffmpegVersion,
        ffprobeVersion: ffmpeg.ffprobeVersion,
        elapsedRenderMs: Date.now() - started,
        frameCount: plan.plan.totalFrames,
        nodeCoordinatorPeakRssBytes,
        rendererBuildId: "",
        audioChannels: null,
        audioSampleRateHz: null,
        metrics,
        profileId: renderTarget.profileId,
      },
    });
    if (!built.ok) {
      return {
        ok: false,
        reasonId: "ARTIFACT_PROBE_MISMATCH",
        message: scrubWorkerMessage("probe"),
        retryable: true,
      };
    }

    // Defer workspace cleanup to the one-use lease (runner dispose in finally).
    const artifactLease = createArtifactFileLease({
      identity: authorized.identity,
      contentDigest: hashed.contentDigest,
      mimeType: built.artifact.mimeType,
      onDispose: () => workspace.cleanup(),
    });
    leaseHandedOff = true;

    return {
      ok: true,
      artifact: built.artifact,
      artifactLease,
      evidence: built.evidence,
      sourceBindingAttribution: staged.sourceBindingAttribution,
    };
  } catch (error) {
    const mapped = failureReasonForDeadline(input.deadline?.abortKind() ?? null);
    boundaryTelemetry.emit("ffmpeg_process_terminal", {
      ffmpegOutcomeClass: "failed",
    });
    const executionSubstage = (
      error as { executionSubstage?: import("./claimed-render-execution-attribution").ClaimedRenderExecutionSubstageId }
    ).executionSubstage;
    return {
      ok: false,
      reasonId: mapped ?? "WORKER_FAILED",
      message: scrubWorkerMessage(
        mapped === "WORKER_TIMEOUT"
          ? "timeout"
          : mapped === "CANCELLED_BY_USER"
            ? "cancelled"
            : "internal",
      ),
      retryable: mapped === "WORKER_TIMEOUT",
      executionSubstage: executionSubstage ?? "ffmpeg_execution",
    };
  } finally {
    rssSampler.stop();
    if (!leaseHandedOff) {
      workspace.cleanup();
    }
  }
}
