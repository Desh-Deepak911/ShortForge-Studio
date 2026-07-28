/**
 * Durable artifact.binding_coherence observation — monotonic success anchors + reread.
 * Sprint 11E Phase 2E.2D.8I.6
 */

import { evaluateArtifactObjectBindingCoherence } from "@/features/headless-renderer/control-plane/services/evaluate-artifact-object-binding-coherence";
import type { HeadlessObjectMetadata } from "@/features/headless-renderer/control-plane/ports/storage.port";
import type { HeadlessRenderJobRequestV1 } from "@/features/headless-renderer/domain/headless-render.types";

import { trackObjectId, trackR2Locator } from "../r2-live/live-fixtures";
import type { FlyRenderLiveMatrixContext } from "./types";

export type ArtifactBindingCoherenceObservationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failureCategory:
        | "ARTIFACT_BINDING_OBSERVATION_FAILED"
        | "ARTIFACT_BINDING_DURABLE_REREAD_FAILED"
        | "ARTIFACT_BINDING_INCOHERENT";
    };

export type ArtifactBindingMonotonicAnchors = {
  readonly providerFinalizationProven?: boolean;
  readonly bindingValidationCompleted?: boolean;
  readonly jobSucceededCasCompleted?: boolean;
};

function ownedRecordToFinalizedMetadata(input: {
  readonly ownerId: string;
  readonly projectId: string;
  readonly storeId: string;
  readonly objectKey: string;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly expiresAtMs: number;
}): HeadlessObjectMetadata {
  return Object.freeze({
    finalized: true,
    purpose: "artifact",
    ownerId: input.ownerId,
    projectId: input.projectId,
    locator: Object.freeze({
      kind: "object_storage",
      storeId: input.storeId as "assets" | "artifacts",
      objectKey: input.objectKey,
    }),
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    expiresAtMs: input.expiresAtMs,
  });
}

export async function observeArtifactBindingCoherenceDurable(
  ctx: FlyRenderLiveMatrixContext,
  anchors: ArtifactBindingMonotonicAnchors = {},
): Promise<ArtifactBindingCoherenceObservationResult> {
  try {
    if (ctx.session.jobId == null) {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_OBSERVATION_FAILED" };
    }

    const initialJob = await ctx.jobStore.getByJobIdAndOwner(
      ctx.session.jobId,
      ctx.ownerId,
    );
    if (!initialJob.ok || initialJob.value.stage !== "canonical") {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
    }

    const initialState = initialJob.value.canonicalJob!.state;
    if (initialState === "failed" || initialState === "cancelled") {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_INCOHERENT" };
    }

    const deadline = Date.now() + ctx.smokePollTimeoutMs;
    let jobRecord = initialJob.value;
    while (
      jobRecord.canonicalJob!.state !== "succeeded" &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 2_000));
      const polled = await ctx.jobStore.getByJobIdAndOwner(
        ctx.session.jobId,
        ctx.ownerId,
      );
      if (!polled.ok || polled.value.stage !== "canonical") {
        return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
      }
      jobRecord = polled.value;
      if (
        jobRecord.canonicalJob!.state === "failed" ||
        jobRecord.canonicalJob!.state === "cancelled"
      ) {
        return { ok: false, failureCategory: "ARTIFACT_BINDING_INCOHERENT" };
      }
    }

    if (jobRecord.canonicalJob!.state !== "succeeded") {
      if (
        anchors.providerFinalizationProven === true ||
        anchors.bindingValidationCompleted === true ||
        anchors.jobSucceededCasCompleted === true
      ) {
        return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
      }
      return { ok: false, failureCategory: "ARTIFACT_BINDING_OBSERVATION_FAILED" };
    }

    const binding = jobRecord.artifactObjectBinding;
    if (binding == null) {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
    }

    const listed = await ctx.ownedObjectStore.listByJobIdAndOwner({
      jobId: ctx.session.jobId,
      ownerId: ctx.ownerId,
    });
    if (!listed.ok) {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
    }

    const bindingStoreId = binding.storageLocator.storeId;
    const artifactEntry = listed.value.find(
      (entry) =>
        entry.record.purpose === "artifact" &&
        entry.record.stage === "finalized" &&
        entry.record.objectKey === binding.storageLocator.objectKey &&
        (bindingStoreId === "artifacts" || bindingStoreId === "assets"
          ? entry.record.storeId === bindingStoreId
          : true),
    );

    let record = artifactEntry?.record ?? null;
    if (record == null) {
      const finalizedArtifacts = listed.value.filter(
        (entry) =>
          entry.record.purpose === "artifact" &&
          entry.record.stage === "finalized",
      );
      if (finalizedArtifacts.length !== 1) {
        return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
      }
      record = finalizedArtifacts[0]!.record;
    }

    if (record.stage !== "finalized") {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
    }

    const canonicalJob = jobRecord.canonicalJob;
    const artifact = canonicalJob.artifact;
    if (artifact == null) {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
    }

    const request = jobRecord.canonicalRequest as HeadlessRenderJobRequestV1 | null;
    if (request == null) {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_DURABLE_REREAD_FAILED" };
    }

    const finalized = ownedRecordToFinalizedMetadata({
      ownerId: record.ownerId,
      projectId: record.projectId,
      storeId: record.storeId,
      objectKey: record.objectKey,
      contentDigest: record.contentDigest,
      byteLength: record.byteLength,
      mimeType: record.mimeType,
      expiresAtMs: record.expiresAtMs,
    });

    const evaluation = evaluateArtifactObjectBindingCoherence({
      job: canonicalJob,
      request,
      artifact,
      finalized,
      storeVersion: jobRecord.storeVersion,
    });
    if (!evaluation.ok) {
      return { ok: false, failureCategory: "ARTIFACT_BINDING_INCOHERENT" };
    }

    trackObjectId(ctx, record.objectId);
    trackR2Locator(ctx, {
      storeId: record.storeId as "assets" | "artifacts",
      objectKey: record.objectKey,
    });
    ctx.session.artifactObjectId = record.objectId;
    ctx.session.artifactObjectKey = record.objectKey;
    ctx.session.storeId = record.storeId as "assets" | "artifacts";
    ctx.session.artifactByteLength = record.byteLength;
    ctx.session.artifactContentDigest = record.contentDigest;
    ctx.session.observedStoreVersion = jobRecord.storeVersion;

    return { ok: true };
  } catch {
    return { ok: false, failureCategory: "ARTIFACT_BINDING_OBSERVATION_FAILED" };
  }
}
