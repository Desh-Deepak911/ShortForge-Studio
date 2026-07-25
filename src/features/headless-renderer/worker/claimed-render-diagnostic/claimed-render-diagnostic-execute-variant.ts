/**
 * Execute one claimed-render diagnostic variant through executeHeadlessRenderJob.
 */

import { resolveSystemChromeExecutable } from "../chromium/chrome-executable";
import { buildHeadlessChromeLaunchArgs } from "../chromium/chrome-launch-args";
import { materializePageArtifactAuthority } from "../page-diagnostic/page-diagnostic-artifact";
import { createJobDeadline } from "../runtime/job-deadline";
import { executeHeadlessRenderJob } from "../runtime/execute-render-job";
import {
  type HeadlessWorkerLimits,
} from "../runtime/worker-types";

import type { ClaimedRenderDiagnosticFixturePack } from "./claimed-render-diagnostic-fixture-minimal";
import {
  countWorkspaceClassifications,
  createInitialBoundaryPresence,
  deriveBoundaryPresenceFromAttribution,
  type ClaimedRenderDiagnosticBoundaryPresence,
  type ClaimedRenderDiagnosticEventSink,
  type ClaimedRenderDiagnosticSafeEvent,
  type ClaimedRenderDiagnosticVariantId,
} from "./claimed-render-diagnostic-events";
import { buildDiagnosticClaimedJobContext } from "./claimed-render-diagnostic-seed-local";
import {
  evaluateClaimedRenderDiagnosticCapabilityBoundary,
  inferMaterializerEntered,
  type ClaimedRenderDiagnosticCapabilityAttribution,
} from "./claimed-render-diagnostic-capability-boundary";

export type ClaimedRenderDiagnosticVariantResult = {
  readonly variant: ClaimedRenderDiagnosticVariantId;
  readonly overall: "PASS" | "FAIL";
  readonly reasonId: string | null;
  readonly executionSubstage: string | null;
  readonly pageFailureReason: string | null;
  readonly boundaryPresence: ClaimedRenderDiagnosticBoundaryPresence;
  readonly workspaceClassificationCount: number;
  readonly cleanupStatus: "ok" | "failed" | "not_run";
  readonly boundedDurationMs: number;
  readonly capabilityAttribution: ClaimedRenderDiagnosticCapabilityAttribution | null;
};

function emit(
  sink: ClaimedRenderDiagnosticEventSink,
  event: Omit<ClaimedRenderDiagnosticSafeEvent, "name">,
): void {
  sink({ name: "hosted.claimed_render_diagnostic", ...event });
}

export async function runClaimedRenderDiagnosticVariant(input: {
  readonly variant: ClaimedRenderDiagnosticVariantId;
  readonly fixture: ClaimedRenderDiagnosticFixturePack;
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly eventSink: ClaimedRenderDiagnosticEventSink;
  readonly executeRenderJob?: typeof executeHeadlessRenderJob;
  readonly limits?: Partial<HeadlessWorkerLimits>;
  readonly nowMs?: number;
}): Promise<ClaimedRenderDiagnosticVariantResult> {
  const startedMs = Date.now();
  const executeRenderJob = input.executeRenderJob ?? executeHeadlessRenderJob;
  const nowMs = input.nowMs ?? startedMs;
  let cleanupStatus: ClaimedRenderDiagnosticVariantResult["cleanupStatus"] =
    "not_run";

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    emit(input.eventSink, {
      status: "failed",
      variant: input.variant,
      diagnosticStage: "binary_preflight",
      reasonId: "chrome_missing",
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: Date.now() - startedMs,
      cleanupStatus: "not_run",
    });
    return {
      variant: input.variant,
      overall: "FAIL",
      reasonId: "chrome_missing",
      executionSubstage: "chromium_preflight",
      pageFailureReason: null,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      cleanupStatus: "not_run",
      boundedDurationMs: Date.now() - startedMs,
      capabilityAttribution: null,
    };
  }

  const launchArgs = buildHeadlessChromeLaunchArgs();
  if (launchArgs.includes("--no-sandbox")) {
    emit(input.eventSink, {
      status: "failed",
      variant: input.variant,
      diagnosticStage: "binary_preflight",
      reasonId: "chromium_sandbox_failed",
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      boundedDurationMs: Date.now() - startedMs,
      cleanupStatus: "not_run",
    });
    return {
      variant: input.variant,
      overall: "FAIL",
      reasonId: "chromium_sandbox_failed",
      executionSubstage: "chromium_preflight",
      pageFailureReason: null,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      cleanupStatus: "not_run",
      boundedDurationMs: Date.now() - startedMs,
      capabilityAttribution: null,
    };
  }

  emit(input.eventSink, {
    status: "ok",
    variant: input.variant,
    diagnosticStage: "binary_preflight",
    reasonId: null,
    boundaryPresence: createInitialBoundaryPresence(),
    workspaceClassificationCount: 0,
    boundedDurationMs: null,
    cleanupStatus: "not_run",
  });

  const artifact = materializePageArtifactAuthority(input.env);
  if (!artifact.ok) {
    return {
      variant: input.variant,
      overall: "FAIL",
      reasonId: artifact.reasonId,
      executionSubstage: "page_bundle_injection",
      pageFailureReason: artifact.reasonId,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      cleanupStatus: "not_run",
      boundedDurationMs: Date.now() - startedMs,
      capabilityAttribution: null,
    };
  }

  emit(input.eventSink, {
    status: "ok",
    variant: input.variant,
    diagnosticStage: "fixture_prepare",
    reasonId: null,
    boundaryPresence: createInitialBoundaryPresence(),
    workspaceClassificationCount: 0,
    boundedDurationMs: null,
    cleanupStatus: "not_run",
  });

  let jobContext;
  try {
    jobContext = await buildDiagnosticClaimedJobContext({
      variant: input.variant,
      manifest: input.fixture.manifest,
      assetBytesByUrl: input.fixture.assetBytesByUrl,
      rendererProfile: input.fixture.rendererProfile,
      nowMs,
    });
  } catch (error) {
    return {
      variant: input.variant,
      overall: "FAIL",
      reasonId: "claimed_job_prepare_failed",
      executionSubstage: "render_request_materialization",
      pageFailureReason: null,
      boundaryPresence: createInitialBoundaryPresence(),
      workspaceClassificationCount: 0,
      cleanupStatus: "not_run",
      boundedDurationMs: Date.now() - startedMs,
      capabilityAttribution: null,
    };
  }

  emit(input.eventSink, {
    status: "ok",
    variant: input.variant,
    diagnosticStage: "claimed_job_prepare",
    reasonId: null,
    boundaryPresence: createInitialBoundaryPresence(),
    workspaceClassificationCount: 0,
    boundedDurationMs: null,
    cleanupStatus: "not_run",
  });

  const capabilityBoundary = evaluateClaimedRenderDiagnosticCapabilityBoundary({
    request: jobContext.record.canonicalRequest,
    storage: jobContext.storage,
    limitsOverrides: input.limits,
  });

  if (!capabilityBoundary.ok) {
    const boundaryPresence = deriveBoundaryPresenceFromAttribution({
      attribution: undefined,
      chromiumSucceeded: false,
      frameCount: 0,
      executeReturnedAttribution: false,
      diagnosticReceivedAttribution: true,
      cleanupComplete: true,
      materializerEntered: false,
    });
    emit(input.eventSink, {
      status: "failed",
      variant: input.variant,
      diagnosticStage: "capability_preflight",
      reasonId: capabilityBoundary.reasonId,
      boundaryPresence,
      workspaceClassificationCount: 0,
      boundedDurationMs: Date.now() - startedMs,
      cleanupStatus: "ok",
      capabilityAttribution: capabilityBoundary.attribution,
    });
    return {
      variant: input.variant,
      overall: "FAIL",
      reasonId: capabilityBoundary.reasonId,
      executionSubstage: capabilityBoundary.attribution.capabilitySubstage,
      pageFailureReason: null,
      boundaryPresence,
      workspaceClassificationCount: 0,
      cleanupStatus: "ok",
      boundedDurationMs: Date.now() - startedMs,
      capabilityAttribution: capabilityBoundary.attribution,
    };
  }

  emit(input.eventSink, {
    status: "ok",
    variant: input.variant,
    diagnosticStage: "capability_preflight",
    reasonId: null,
    boundaryPresence: createInitialBoundaryPresence(),
    workspaceClassificationCount: 0,
    boundedDurationMs: null,
    cleanupStatus: "not_run",
    capabilityAttribution: capabilityBoundary.attribution,
  });

  const limits: HeadlessWorkerLimits = capabilityBoundary.limits;
  const deadline = createJobDeadline({ timeoutMs: limits.jobTimeoutMs });

  let executed;
  try {
    executed = await executeRenderJob({
      run: {
        record: jobContext.record,
        claimToken: jobContext.claimToken,
        ownerId: jobContext.ownerId,
        signal: deadline.signal,
        nowMs,
      },
      storage: jobContext.storage,
      limits,
      deadline,
    });
  } finally {
    deadline.dispose();
  }

  const executeReturnedAttribution =
    !executed.ok &&
    (executed.pageWorkspaceAttribution != null ||
      executed.executionSubstage != null);

  const attribution = executed.ok
    ? undefined
    : executed.pageWorkspaceAttribution;
  const frameCount = executed.ok ? 1 : 0;
  const materializerEntered = inferMaterializerEntered({
    executedOk: executed.ok,
    reasonId: executed.ok ? null : executed.reasonId,
    executionSubstage: executed.ok ? null : (executed.executionSubstage ?? null),
    hasPageWorkspaceAttribution: attribution != null,
    capabilityPreflightPassed: true,
  });
  const boundaryPresence = deriveBoundaryPresenceFromAttribution({
    attribution,
    chromiumSucceeded: executed.ok,
    frameCount,
    executeReturnedAttribution,
    diagnosticReceivedAttribution: true,
    cleanupComplete: true,
    materializerEntered,
  });
  const workspaceClassificationCount = countWorkspaceClassifications(attribution);
  cleanupStatus = "ok";

  const reasonId = executed.ok
    ? null
    : (executed.pageFailureReason ??
      executed.reasonId ??
      "render_terminalized_failure");
  const executionSubstage = executed.ok
    ? null
    : (executed.executionSubstage ?? "page_contract_ready");

  emit(input.eventSink, {
    status: executed.ok ? "ok" : "failed",
    variant: input.variant,
    diagnosticStage: "execute_render_job",
    reasonId,
    boundaryPresence,
    workspaceClassificationCount,
    boundedDurationMs: Date.now() - startedMs,
    cleanupStatus,
    capabilityAttribution: capabilityBoundary.attribution,
  });

  emit(input.eventSink, {
    status: executed.ok ? "ok" : "failed",
    variant: input.variant,
    diagnosticStage: "cleanup",
    reasonId,
    boundaryPresence,
    workspaceClassificationCount,
    boundedDurationMs: Date.now() - startedMs,
    cleanupStatus,
    capabilityAttribution: capabilityBoundary.attribution,
  });

  return {
    variant: input.variant,
    overall: executed.ok ? "PASS" : "FAIL",
    reasonId,
    executionSubstage,
    pageFailureReason: executed.ok ? null : reasonId,
    boundaryPresence,
    workspaceClassificationCount,
    cleanupStatus,
    boundedDurationMs: Date.now() - startedMs,
    capabilityAttribution: capabilityBoundary.attribution,
  };
}
