/**
 * Sprint 11E Phase 2E.2D.8K.1 — hosted 4K capacity live draft fixtures.
 *
 * Mirrors neon-live/live-fixtures.ts buildLiveDraft, but the frozen ExportManifest
 * always stays a valid 1080p (1080x1920) snapshot — 4K is elevated only via the
 * separately requested HeadlessRendererProfile, matching
 * worker/testing/build-reference-fixture.ts and validate-headless-job-request.ts.
 *
 * webm profiles are silent (no voice/music assets); mp4 profiles carry voice +
 * background music, same shape as build-reference-fixture's with-voice-and-music.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";

import {
  buildExportManifest,
  buildExportManifestFingerprint,
  deepFreezeExportManifest,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV3,
} from "@/features/export/domain";
import type { ExportManifestV3Draft } from "@/features/export/domain/export-manifest.types";
import { validateHeadlessClaimableProjectId } from "@/features/headless-renderer/control-plane";
import {
  createProvisionalMaterializingRecord,
  validateHeadlessProvisionalStagingObjectRefs,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import {
  deepFreezeHeadlessValue,
  extractRequiredHeadlessSourceSlots,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import { applyHeadlessFormatToManifest } from "@/features/headless-renderer/worker/testing/apply-output-profile";
import type { FootieScript } from "@/features/story/types";
import { applyStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

import { buildFlyRenderLiveProbeAssetBytes } from "../fly-render-live/probe-asset-bytes";
import { buildLiveIdempotencyKey, type LiveDraftContext } from "../neon-live/live-fixtures";
import type { Capacity4kProfileId } from "./capacity-4k-profile-audit";

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

export type Capacity4kLiveAudioMode = "silent" | "with-voice-and-music";

function capacity4kStory(input: {
  readonly contentDurationMs: number;
  readonly audioMode: Capacity4kLiveAudioMode;
}): FootieScript {
  const totalMs = Math.max(1000, input.contentDurationMs);
  const halfMs = Math.floor(totalMs / 2);
  const totalSec = totalMs / 1000;
  const halfSec = halfMs / 1000;
  const withVoice = input.audioMode === "with-voice-and-music";

  let story = syncFootieScript({
    title: "4K Capacity Live",
    narration: "Hosted 4K capacity narration.",
    totalDuration: totalSec,
    voiceoverUrl: withVoice ? "https://example.com/4k-voice.mp3" : undefined,
    voiceoverDurationMs: withVoice ? totalMs : undefined,
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
          url: "https://example.com/4k-a.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
      {
        id: "scene-2",
        start: halfSec,
        end: totalSec,
        duration: totalSec - halfSec,
        startMs: halfMs,
        endMs: totalMs,
        durationMs: totalMs - halfMs,
        subtitle: "World",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/4k-b.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  });

  if (withVoice) {
    story = applyStoryBackgroundMusic(story, {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/4k-music.wav",
      fileName: "music.wav",
      fileMimeType: "audio/wav",
      volume: 0.2,
      duckingEnabled: true,
      fadeIn: false,
      fadeOut: false,
    });
  }

  return story;
}

function buildCapacity4kManifest(input: {
  readonly projectId: string;
  readonly profileId: Capacity4kProfileId;
  readonly contentDurationMs: number;
  readonly audioMode: Capacity4kLiveAudioMode;
}): ExportManifestV3 {
  const profile = HEADLESS_OUTPUT_PROFILES[input.profileId];
  const withVoice = input.audioMode === "with-voice-and-music";
  const story = capacity4kStory({
    contentDurationMs: input.contentDurationMs,
    audioMode: input.audioMode,
  });

  const base = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: withVoice ? "with-voice" : "silent",
    includeBackgroundMusic: withVoice,
    exportSettings: {
      resolution: "1080x1920",
      format: profile.format,
      quality: "standard",
    },
  });
  if (base.version !== 3) {
    throw new Error("Expected ExportManifest v3 from builder.");
  }

  const claimable = validateHeadlessClaimableProjectId(input.projectId);
  if (!claimable.ok) {
    throw new Error(claimable.message);
  }

  // Rebind final projectId + recompute fingerprint (canonical-live-manifest.ts pattern).
  const cloned = JSON.parse(JSON.stringify(base)) as ExportManifestV3;
  const { fingerprint: _drop, ...withoutFingerprint } = cloned;
  void _drop;
  const draft: ExportManifestV3Draft = {
    ...withoutFingerprint,
    project: { ...withoutFingerprint.project, projectId: claimable.projectId },
  };
  const fingerprint = buildExportManifestFingerprint(draft);
  const rebound: ExportManifestV3 = { ...draft, fingerprint };
  const reboundValidated = validateExportManifest(rebound);
  if (!reboundValidated.ok) {
    throw new Error(
      reboundValidated.issues[0]?.code ?? "4K capacity manifest rebind validation failed.",
    );
  }

  // Elevate to the 4K headless profile — output stays a frozen 1080p snapshot.
  const applied = applyHeadlessFormatToManifest(rebound, {
    resolution: "4k",
    format: profile.format,
    fps: 30,
    quality: "standard",
  });
  if (!applied.ok) {
    throw new Error(applied.message);
  }
  if (
    applied.manifest.output.resolution !== "1080p" ||
    applied.manifest.output.width !== 1080 ||
    applied.manifest.output.height !== 1920
  ) {
    throw new Error("4K capacity manifest must keep a frozen 1080p ExportManifest snapshot.");
  }
  const validated = validateExportManifest(applied.manifest);
  if (!validated.ok) {
    throw new Error(validated.issues[0]?.code ?? "4K capacity manifest validation failed.");
  }
  return deepFreezeExportManifest(applied.manifest);
}

export async function buildCapacity4kLiveDraft(input: {
  readonly runId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly profileId: Capacity4kProfileId;
  readonly contentDurationMs: number;
  readonly creatorKey: string;
  readonly audioMode: Capacity4kLiveAudioMode;
  /** Injected identity authority — defaults to crypto.randomUUID. */
  readonly randomUUID?: () => string;
}): Promise<LiveDraftContext> {
  const uuid = input.randomUUID ?? nodeRandomUUID;
  const ownerId = input.ownerId;
  const projectId = input.projectId;
  const profile = HEADLESS_OUTPUT_PROFILES[input.profileId];

  const manifest = buildCapacity4kManifest({
    projectId,
    profileId: input.profileId,
    contentDurationMs: input.contentDurationMs,
    audioMode: input.audioMode,
  });

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
  if (!seeded.ok) throw new Error("4K capacity live seed failed.");

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

  const creatorKey = input.creatorKey;
  const idempotencyAuthorityKey = buildLiveIdempotencyKey(
    ownerId,
    projectId,
    creatorKey,
  );
  const jobId = `job_${input.runId}_${uuid()}`;
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
      resolution: "4k",
      format: profile.format,
      fps: 30,
      quality: "standard",
    },
    requestedRendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    snapshotClaim: {
      manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
      assetBundleFingerprintClaim: seeded.value.bundle.fingerprint,
      expectedSlotClaims,
    },
    // Owned-object staging chain in job-create-attribution populates refs; start empty.
    stagingObjectRefs: [],
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
