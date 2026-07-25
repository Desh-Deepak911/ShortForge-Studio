/**
 * Isolated UUID-v4 fixtures for Neon live / harness-authority matrix.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";

import {
  type ExportEnvironmentSnapshot,
  type ExportManifestV3,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  createProvisionalMaterializingRecord,
  updateProvisionalVerificationCoverage,
  validateHeadlessProvisionalStagingObjectRefs,
  type HeadlessProvisionalStagingObjectRefV1,
  type HeadlessProvisionalStoredJobRecord,
  type HeadlessProvisionalStoreWrite,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  NeonHeadlessJobStoreAdapter,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessAssetBundleV1 } from "@/features/headless-renderer/domain";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  deepFreezeHeadlessValue,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessRenderJobRequest,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";

import { buildCanonicalLiveExportManifest } from "./canonical-live-manifest";
import { buildFlyRenderLiveProbeAssetBytes } from "../fly-render-live/probe-asset-bytes";

const CLOCK = 1_700_000_000_000;

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

function fixStoryForDuration(totalDurationSec: number): FootieScript {
  const totalMs = totalDurationSec * 1000;
  const halfMs = Math.floor(totalMs / 2);
  const halfSec = totalDurationSec / 2;
  return syncFootieScript({
    title: "Neon Live Verify",
    narration: "Hello world narration for export.",
    totalDuration: totalDurationSec,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: totalMs,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: halfSec,
        duration: halfSec,
        startMs: 0,
        endMs: halfMs,
        durationMs: halfMs,
        subtitle: "Hello",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
      {
        id: "scene-2",
        start: halfSec,
        end: totalDurationSec,
        duration: halfSec,
        startMs: halfMs,
        endMs: totalMs,
        durationMs: totalMs - halfMs,
        subtitle: "World",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/b.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  });
}

function fixStory(): FootieScript {
  return fixStoryForDuration(6);
}

function buildV3Manifest(
  projectId: string,
  contentDurationMs?: number,
): ExportManifestV3 {
  const durationSec =
    contentDurationMs != null
      ? Math.max(1, Math.round(contentDurationMs / 1000))
      : 6;
  const built = buildCanonicalLiveExportManifest({
    projectId,
    story: fixStoryForDuration(durationSec),
    environment: CAPABLE_ENV,
  });
  if (!built.ok) {
    throw new Error(`${built.code}: ${built.message}`);
  }
  return built.manifest;
}

export function buildLiveIdempotencyKey(
  ownerId: string,
  projectId: string,
  creatorIdempotencyKey: string,
): string {
  const built = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey: creatorIdempotencyKey,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("idempotency build failed");
  return built.fingerprint;
}

export type LiveDraftContext = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly manifest: ExportManifestV3;
  readonly seeded: {
    readonly manifestPayloadDigest: string;
    readonly bundle: HeadlessAssetBundleV1;
  };
  /**
   * Provisional draft as requested by the caller (may have empty staging).
   * Snapshot authority is frozen into this draft.
   */
  readonly draft: HeadlessProvisionalStoreWrite;
  /**
   * Complete stagingObjectRefs for the exact frozen snapshot of `draft`.
   * Detached, validated, and deep-frozen. Never from a second materialization.
   */
  readonly authoritativeStagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
  readonly idempotencyAuthorityKey: string;
  readonly creatorKey: string;
};

export async function buildLiveDraft(input: {
  readonly runId: string;
  readonly ownerId: string;
  readonly projectId?: string;
  readonly jobId?: string;
  readonly creatorKey?: string;
  readonly emptyStaging?: boolean;
  /** Injected identity authority — defaults to crypto.randomUUID. */
  readonly randomUUID?: () => string;
  /** QA-only injection point (propagated from matrix context). */
  readonly injectThrowAt?: import("./injection").NeonLiveInjectionPoint;
  /** Smoke/probe content duration — aligns manifest frame count with harness boundary. */
  readonly contentDurationMs?: number;
}): Promise<LiveDraftContext> {
  if (input.injectThrowAt === "live_fixture_construction") {
    throw new Error("NEON_LIVE_INJECTED");
  }
  const uuid = input.randomUUID ?? nodeRandomUUID;
  const projectId = input.projectId ?? uuid();
  const ownerId = input.ownerId;
  const manifest = buildV3Manifest(projectId, input.contentDurationMs);
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: `sess-${input.runId}` },
    authorizedProjectIds: [projectId],
    nowMs: () => CLOCK,
  });
  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: CLOCK,
    assetByteFactory: (slot, index) =>
      buildFlyRenderLiveProbeAssetBytes({ slot, index }).bytes,
    mimeForSlot: (slot) =>
      buildFlyRenderLiveProbeAssetBytes({ slot, index: 0 }).mime,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");

  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const expectedSlotClaims = seeded.value.bundle.assets.map((asset) => {
    const slot = slots.find(
      (s) =>
        s.role === asset.sourceIdentity.role &&
        s.sceneId === asset.sourceIdentity.sceneId &&
        s.mediaItemId === asset.sourceIdentity.mediaItemId &&
        s.sourceDigest === asset.sourceIdentity.sourceDigest,
    );
    assert.ok(slot);
    return {
      slotKey: headlessSourceSlotKey(slot!),
      role: slot!.role,
      sceneId: slot!.sceneId,
      mediaItemId: slot!.mediaItemId,
      sourceDigestClaim: slot!.sourceDigest,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    };
  });

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const bundleRecordBytes = new TextEncoder().encode(
    JSON.stringify(seeded.value.bundle),
  );
  const bundleRecordDigest = `sha256:${createHash("sha256")
    .update(bundleRecordBytes)
    .digest("hex")}`;

  const fullStaging = [
    {
      purpose: "manifest" as const,
      slotKey: null,
      locator: seeded.value.manifestLocator,
      contentDigestClaim: seeded.value.manifestPayloadDigest,
      byteLengthClaim: manifestBytes.byteLength,
      mimeTypeClaim: "application/json",
    },
    {
      purpose: "asset_bundle_record" as const,
      slotKey: null,
      locator: seeded.value.bundleLocator,
      contentDigestClaim: bundleRecordDigest,
      byteLengthClaim: bundleRecordBytes.byteLength,
      mimeTypeClaim: "application/json",
    },
    ...seeded.value.bundle.assets.map((asset) => ({
      purpose: "asset_bytes" as const,
      slotKey: headlessSourceSlotKey({
        role: asset.sourceIdentity.role,
        sceneId: asset.sourceIdentity.sceneId,
        mediaItemId: asset.sourceIdentity.mediaItemId,
        sourceDigest: asset.sourceIdentity.sourceDigest,
      }),
      locator: asset.storageLocator,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    })),
  ];

  const creatorKey = input.creatorKey ?? `creator-${input.runId}-${uuid()}`;
  const idempotencyAuthorityKey = buildLiveIdempotencyKey(
    ownerId,
    projectId,
    creatorKey,
  );
  const jobId = input.jobId ?? `job_${input.runId}_${uuid()}`;
  const operationId = `op_${input.runId}_${uuid()}`;
  const materialize = createProvisionalMaterializingRecord({
    jobId,
    ownerId,
    projectId,
    createdAtMs: CLOCK,
    updatedAtMs: CLOCK,
    idempotencyAuthorityKey,
    operationId,
    creatorIdempotencyKey: creatorKey,
    requestedRendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    requestedRendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    snapshotClaim: {
      manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
      assetBundleFingerprintClaim: seeded.value.bundle.fingerprint,
      expectedSlotClaims,
    },
    stagingObjectRefs: input.emptyStaging ? [] : fullStaging,
    expiresAtMs: CLOCK + 60 * 60 * 1000,
  });
  if (!materialize.ok) throw new Error(materialize.message);

  const expectedSlotKeySet = new Set(
    expectedSlotClaims.map((slot) => slot.slotKey),
  );
  const validatedFullStaging = validateHeadlessProvisionalStagingObjectRefs(
    fullStaging,
    expectedSlotKeySet,
  );
  if (!validatedFullStaging.ok) {
    throw new Error(validatedFullStaging.message);
  }
  const authoritativeStagingObjectRefs = deepFreezeHeadlessValue(
    validatedFullStaging.refs.map((ref) => ({ ...ref, locator: { ...ref.locator } })),
  );

  return {
    ownerId,
    projectId,
    jobId,
    operationId,
    manifest,
    seeded: {
      manifestPayloadDigest: seeded.value.manifestPayloadDigest,
      bundle: seeded.value.bundle,
    },
    draft: materialize.record,
    authoritativeStagingObjectRefs,
    idempotencyAuthorityKey,
    creatorKey,
  };
}

export async function casLiveCoverage(
  store: Pick<NeonHeadlessJobStoreAdapter, "compareAndSetProvisional">,
  record: HeadlessProvisionalStoredJobRecord,
  verifiedTargets: readonly string[],
): Promise<
  | { readonly ok: true; readonly record: HeadlessProvisionalStoredJobRecord }
  | { readonly ok: false; readonly code: "COVERAGE_CAS_FAILED" }
> {
  const requiredTargets = [...record.verificationCoverage.requiredTargets];
  const complete =
    requiredTargets.length === verifiedTargets.length &&
    requiredTargets.every((t) => verifiedTargets.includes(t));
  const next = updateProvisionalVerificationCoverage(
    record,
    { requiredTargets, verifiedTargets: [...verifiedTargets], complete },
    "verify-claim-live-1",
    CLOCK + 1000,
    CLOCK + 2000,
  );
  if (!next.ok) return { ok: false, code: "COVERAGE_CAS_FAILED" };
  const cas = await store.compareAndSetProvisional({
    jobId: record.jobId,
    ownerId: record.ownerId,
    expectedStoreVersion: record.storeVersion,
    next: next.record,
  });
  if (!cas.ok || cas.value.kind !== "updated") {
    return { ok: false, code: "COVERAGE_CAS_FAILED" };
  }
  return {
    ok: true,
    record: cas.value.record as HeadlessProvisionalStoredJobRecord,
  };
}

export function buildLiveCanonicalPair(
  manifest: ExportManifestV3,
  bundle: HeadlessAssetBundleV1,
  record: HeadlessProvisionalStoredJobRecord | HeadlessProvisionalStoreWrite,
):
  | {
      readonly ok: true;
      readonly job: NonNullable<
        Extract<
          ReturnType<typeof applyHeadlessJobTransition>,
          { ok: true }
        >["job"]
      >;
      readonly request: NonNullable<
        Extract<
          ReturnType<typeof finalizeHeadlessRenderJobRequest>,
          { ok: true }
        >["request"]
      >;
    }
  | { readonly ok: false; readonly code: "CANONICAL_PAIR_FAILED" } {
  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId: record.ownerId, projectId: record.projectId },
    manifest,
    assetBundle: bundle,
    rendererProfile: record.requestedRendererProfile,
    rendererBuildId: record.requestedRendererBuildId,
    idempotencyKey: record.creatorIdempotencyKey,
  });
  if (!requestResult.ok) return { ok: false, code: "CANONICAL_PAIR_FAILED" };
  const accepted = createAcceptedHeadlessRenderJob({
    jobId: record.jobId,
    requestValue: requestResult.request,
    createdAtMs: record.createdAtMs,
  });
  if (!accepted.ok) return { ok: false, code: "CANONICAL_PAIR_FAILED" };
  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: accepted.job.attempt,
    updatedAtMs: record.updatedAtMs + 1,
  });
  if (!queued.ok) return { ok: false, code: "CANONICAL_PAIR_FAILED" };
  return { ok: true, job: queued.job, request: accepted.request };
}

export const LIVE_CLOCK_MS = CLOCK;
