/**
 * Read-only hosted renderer observation — never mutates Neon/R2/Redis state.
 */

import type { FlyRenderLiveMatrixContext, HostedRendererObservedState } from "./types";

export type HostedRendererObservationStatus =
  | "ok"
  | "read_failed"
  | "session_incomplete"
  | "job_not_succeeded"
  | "artifact_not_finalized"
  | "claim_not_cleared"
  | "dispatch_outbox_incomplete"
  | "cleanup_intent_retryable";

export type HostedRendererObservationAttribution = {
  readonly observation_status: HostedRendererObservationStatus;
};

function attribution(
  observation_status: HostedRendererObservationStatus,
): HostedRendererObservationAttribution {
  return Object.freeze({ observation_status });
}

export async function observeHostedRendererState(
  ctx: FlyRenderLiveMatrixContext,
): Promise<HostedRendererObservedState & { readonly attribution: HostedRendererObservationAttribution }> {
  const fail = (
    status: HostedRendererObservationStatus,
  ): HostedRendererObservedState & {
    readonly attribution: HostedRendererObservationAttribution;
  } =>
    Object.freeze({
      attribution: attribution(status),
      claimCleared: false,
      renderPendingCleared: false,
      jobSucceeded: false,
      artifactFinalized: false,
      dispatchOutboxCompleted: false,
      cleanupIntentRetryable: true,
      storeVersion: null,
      jobTerminalFailed: false,
      chromiumExecuted: false,
      ffmpegExecuted: false,
      artifactUploaded: false,
    });

  try {
    if (ctx.session.jobId == null) {
      return fail("session_incomplete");
    }
    const ownerId = ctx.ownerId;
    const jobId = ctx.session.jobId;
    const job = await ctx.jobStore.getByJobIdAndOwner(jobId, ownerId);
    if (!job.ok) return fail("read_failed");

    const record = job.value;
    const jobSucceeded =
      record.stage === "canonical" &&
      record.canonicalJob!.state === "succeeded";
    const jobTerminalFailed =
      record.stage === "canonical" &&
      (record.canonicalJob!.state === "failed" ||
        record.canonicalJob!.state === "cancelled");
    const storeVersion = record.storeVersion;

    let artifactFinalized = false;
    if (ctx.session.artifactObjectId != null) {
      const owned = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: ctx.session.artifactObjectId,
        ownerId,
      });
      artifactFinalized =
        owned.ok &&
        owned.value != null &&
        owned.value.record.stage === "finalized";
    }

    let dispatchOutboxCompleted = false;
    if (ctx.dispatchOutbox != null && record.stage === "canonical") {
      const outbox = await ctx.dispatchOutbox.getByJobAttemptAndOwner({
        jobId,
        ownerId,
        attempt: record.canonicalJob!.attempt,
      });
      dispatchOutboxCompleted =
        outbox.ok &&
        outbox.value != null &&
        outbox.value.state === "dispatched";
    }

    let renderPendingCleared = true;
    if (
      ctx.tcpConsumer != null &&
      ctx.session.renderStreamId != null &&
      ctx.session.renderGroup != null
    ) {
      const probe = await ctx.tcpConsumer.qaProbePendingInGroup(
        ctx.streamNames.renderStream,
        ctx.session.renderGroup,
        ctx.session.renderStreamId,
      );
      renderPendingCleared = probe.ok && !probe.pending;
    }

    const claimCleared =
      record.stage === "canonical" && record.claimToken == null;

    return Object.freeze({
      attribution: attribution("ok"),
      claimCleared,
      renderPendingCleared,
      jobSucceeded,
      artifactFinalized,
      dispatchOutboxCompleted,
      cleanupIntentRetryable: false,
      storeVersion,
      jobTerminalFailed,
      chromiumExecuted: jobSucceeded || jobTerminalFailed,
      ffmpegExecuted:
        jobSucceeded ||
        (jobTerminalFailed &&
          (record.canonicalJob!.state === "failed" ||
            record.canonicalJob!.state === "cancelled") &&
          (record.canonicalJob!.progress?.stage === "uploading" ||
            record.canonicalJob!.progress?.stage === "validating" ||
            record.canonicalJob!.progress?.stage === "encoding" ||
            ctx.session.renderCompletedAtMs != null)),
      artifactUploaded:
        artifactFinalized ||
        (jobTerminalFailed && artifactFinalized),
    });
  } catch {
    return fail("read_failed");
  }
}

export function mapHostedRendererObservationToFailureCategory(
  status: HostedRendererObservationStatus,
): string {
  switch (status) {
    case "job_not_succeeded":
      return "JOB_SUCCEEDED_CAS_FAILED";
    case "artifact_not_finalized":
      return "OWNED_OBJECT_FINALIZED_FAILED";
    case "claim_not_cleared":
      return "HOSTED_RENDER_CLAIM_FAILED";
    case "dispatch_outbox_incomplete":
      return "DISPATCH_OUTBOX_NOT_COMPLETED";
    case "cleanup_intent_retryable":
      return "CLEANUP_INTENT_RETRYABLE";
    default:
      return "HOSTED_RENDER_CLAIM_FAILED";
  }
}

export async function pollHostedRendererState(
  ctx: FlyRenderLiveMatrixContext,
): Promise<Awaited<ReturnType<typeof observeHostedRendererState>>> {
  if (ctx.pollHostedRenderer != null) {
    const injected = await ctx.pollHostedRenderer();
    return Object.freeze({
      ...injected,
      attribution: Object.freeze({ observation_status: "ok" as const }),
    });
  }
  return observeHostedRendererState(ctx);
}

export async function waitForHostedRendererState(
  ctx: FlyRenderLiveMatrixContext,
  predicate: (
    state: Awaited<ReturnType<typeof pollHostedRendererState>>,
  ) => boolean,
  options: { readonly timeoutMs?: number; readonly intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? ctx.smokePollTimeoutMs;
  const intervalMs = options.intervalMs ?? 3_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await pollHostedRendererState(ctx);
    if (predicate(state)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
