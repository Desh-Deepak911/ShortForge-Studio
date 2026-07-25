/**
 * Shared helpers for hosted Fly render live matrix.
 */

import {
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import { ensureDispatchIntentForQueuedJob } from "@/features/headless-renderer/control-plane/services/ensure-dispatch-intent-for-queued-job";

import {
  runAttributedFlyRenderJobCreateChain,
  type AttributedFlyRenderJobCreateResult,
} from "./job-create-attribution";
import type { FlyRenderLiveMatrixContext } from "./types";
import {
  pollHostedRendererState,
  waitForHostedRendererState,
} from "./hosted-renderer-observer";

export { pollHostedRendererState, waitForHostedRendererState };

export async function seedFlyRenderLiveSmokeJobChain(
  ctx: FlyRenderLiveMatrixContext,
): Promise<{ ok: true } | { ok: false; attribution?: AttributedFlyRenderJobCreateResult }> {
  const result = await runAttributedFlyRenderJobCreateChain({
    ctx,
    markCleanupSkipped: true,
  });
  if (!result.ok) {
    return { ok: false, attribution: result };
  }
  const { draftCtx } = result;
  ctx.session.jobId = draftCtx.jobId;
  ctx.session.operationId = draftCtx.operationId;
  ctx.session.digest = draftCtx.seeded.manifestPayloadDigest;
  ctx.session.mime = "application/json";
  return { ok: true };
}

export async function promoteFlyRenderLiveSmokeJobToCanonical(
  ctx: FlyRenderLiveMatrixContext,
): Promise<{ ok: true } | { ok: false }> {
  if (ctx.session.jobId == null) return { ok: false };
  const job = await ctx.jobStore.getByJobIdAndOwner(
    ctx.session.jobId,
    ctx.ownerId,
  );
  if (
    !job.ok ||
    job.value.stage !== "canonical" ||
    job.value.canonicalJob.state !== "queued"
  ) {
    return { ok: false };
  }
  return { ok: true };
}

export async function ensureFlyRenderLiveDispatchIntent(
  ctx: FlyRenderLiveMatrixContext,
): Promise<{ ok: true } | { ok: false }> {
  if (ctx.session.jobId == null || ctx.dispatchOutbox == null) return { ok: false };
  const ensured = await ensureDispatchIntentForQueuedJob({
    jobStore: ctx.jobStore,
    dispatchOutbox: ctx.dispatchOutbox,
    jobId: ctx.session.jobId,
    ownerId: ctx.ownerId,
    nowMs: ctx.nowMs,
  });
  return ensured.ok ? { ok: true } : { ok: false };
}

export async function enqueueFlyRenderLiveDelivery(
  ctx: FlyRenderLiveMatrixContext,
): Promise<{ ok: true; readonly streamId: string } | { ok: false }> {
  if (ctx.restProducer == null || ctx.session.jobId == null) return { ok: false };

  const job = await ctx.jobStore.getByJobIdAndOwner(
    ctx.session.jobId,
    ctx.ownerId,
  );
  if (!job.ok || job.value.stage !== "canonical") return { ok: false };

  const deliveryId = stableHeadlessDeliveryId(
    job.value.jobId,
    job.value.canonicalJob.attempt,
  );
  ctx.session.renderDeliveryId = deliveryId;
  ctx.session.renderGroup = ctx.streamNames.renderGroup;
  ctx.session.renderEnqueuedAtMs = ctx.nowMs;
  if (ctx.session.probeObservationBoundaryMs == null) {
    ctx.session.probeObservationBoundaryMs = ctx.nowMs;
  }

  const enqueued = await ctx.restProducer.enqueueRender({
    deliveryId,
    jobId: ctx.session.jobId,
    ownerId: ctx.ownerId,
    attempt: job.value.canonicalJob.attempt,
    enqueuedAtMs: ctx.nowMs,
    deliveryKind: "render",
  });
  if (!enqueued.ok) return { ok: false };

  ctx.session.renderStreamId = enqueued.value.streamId;
  trackRenderStreamId(ctx, {
    stream: ctx.streamNames.renderStream,
    id: enqueued.value.streamId,
    kind: "render",
  });
  return { ok: true, streamId: enqueued.value.streamId };
}

function trackRenderStreamId(
  ctx: FlyRenderLiveMatrixContext,
  entry: { readonly stream: string; readonly id: string; readonly kind: "render" },
): void {
  const key = `${entry.stream}\0${entry.id}`;
  if (
    !ctx.runOwnedActiveStreamIds.some(
      (t) => `${t.stream}\0${t.id}` === key,
    )
  ) {
    ctx.runOwnedActiveStreamIds.push(entry);
  }
  if (!ctx.trackedStreamIds.some((t) => `${t.stream}\0${t.id}` === key)) {
    ctx.trackedStreamIds.push(entry);
  }
}

export async function verifyFlyRenderLiveArtifactReadable(
  ctx: FlyRenderLiveMatrixContext,
): Promise<boolean> {
  if (
    ctx.session.artifactObjectKey == null ||
    ctx.session.storeId == null ||
    ctx.session.artifactByteLength == null
  ) {
    return false;
  }
  try {
    const head = await ctx.io.readObjectMetadata(
      { storeId: ctx.session.storeId, objectKey: ctx.session.artifactObjectKey },
      ctx.ownerId,
    );
    if (!head.ok) return false;
    if (head.value.byteLength !== ctx.session.artifactByteLength) return false;
    let total = 0;
    const stream = ctx.io.streamFullObject({
      locator: {
        storeId: ctx.session.storeId,
        objectKey: ctx.session.artifactObjectKey,
      },
      ownerId: ctx.ownerId,
      maxBytes: ctx.session.artifactByteLength + 1,
    });
    let result = await stream.next();
    while (!result.done) {
      total += result.value.byteLength;
      result = await stream.next();
    }
    return (
      total === ctx.session.artifactByteLength &&
      result.value?.ok === true
    );
  } catch {
    return false;
  }
}

export { runAttributedFlyRenderJobCreateChain };
