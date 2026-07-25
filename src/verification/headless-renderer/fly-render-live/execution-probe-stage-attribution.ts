/**
 * Execution-probe production-path stage attribution from terminal substage.
 */

import type { FlyRenderLiveCaseEvidence } from "./evidence";
import type { ExecutionProbeStageId } from "./claimed-render-execution-probe-runner";
import type { ClaimedRenderExecutionSubstageId } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";

const PROBE_STAGE_ORDER: readonly ExecutionProbeStageId[] = Object.freeze([
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
]);

const TERMINAL_SUBSTAGE_TO_FAIL_STAGE: Readonly<
  Record<string, ExecutionProbeStageId>
> = Object.freeze({
  page_contract_ready: "hosted.chromium_execution",
  ffmpeg_execution: "hosted.ffmpeg_execution",
  ffmpeg_preflight: "hosted.ffmpeg_execution",
  artifact_upload: "r2.streamed_artifact_upload",
  artifact_finalize: "owned_object.finalized",
  artifact_binding_validation: "artifact.binding_coherence",
  succeeded_cas: "job.succeeded_cas",
  terminal_failure_cas: "job.succeeded_cas",
  cleanup: "cleanup_intent.not_retryable",
});

export function resolveExecutionProbeFailStageFromSubstage(
  substage: ClaimedRenderExecutionSubstageId | string | null | undefined,
): ExecutionProbeStageId {
  if (substage == null) {
    return "hosted.chromium_execution";
  }
  return TERMINAL_SUBSTAGE_TO_FAIL_STAGE[substage] ?? "hosted.chromium_execution";
}

export function executionProbeStagesFromTerminalAttribution(input: {
  readonly failStageId: ExecutionProbeStageId;
  readonly failureCategory: string;
  readonly executionAttribution?: FlyRenderLiveCaseEvidence["executionAttribution"];
}): FlyRenderLiveCaseEvidence[] {
  const out: FlyRenderLiveCaseEvidence[] = [];
  let reachedFail = false;
  for (const stageId of PROBE_STAGE_ORDER) {
    if (reachedFail) {
      out.push({ caseId: stageId, status: "NOT_TESTED" });
      continue;
    }
    if (stageId === input.failStageId) {
      out.push({
        caseId: stageId,
        status: "FAIL",
        failureCategory: input.failureCategory,
        ...(input.executionAttribution != null
          ? { executionAttribution: input.executionAttribution }
          : {}),
      });
      reachedFail = true;
      continue;
    }
    out.push({ caseId: stageId, status: "PASS" });
  }
  return out;
}

export function substageProvesDownstreamExecution(
  substage: ClaimedRenderExecutionSubstageId | string | null | undefined,
): {
  readonly chromiumExecuted: boolean;
  readonly ffmpegExecuted: boolean;
  readonly artifactUploaded: boolean;
  readonly providerFinalized: boolean;
} {
  const rank = (value: string | null | undefined): number => {
    if (value == null) return 0;
    if (
      value === "artifact_binding_validation" ||
      value === "artifact_finalize" ||
      value === "succeeded_cas"
    ) {
      return 5;
    }
    if (value === "artifact_upload") return 4;
    if (value === "ffmpeg_execution" || value === "ffmpeg_preflight") return 3;
    if (
      value === "page_contract_ready" ||
      value === "page_response_validate" ||
      value === "page_response_wait"
    ) {
      return 2;
    }
    return 1;
  };
  const r = rank(substage);
  return Object.freeze({
    chromiumExecuted: r >= 2,
    ffmpegExecuted: r >= 3,
    artifactUploaded: r >= 4,
    providerFinalized: r >= 5,
  });
}
