/**
 * Shared fixture for dual-lease unit tests — memory job store + stream queue.
 * Final owner-authorized projectId is bound BEFORE ExportManifest fingerprint
 * authority (same identity chain as neon-live canonical-live-manifest).
 */

import { randomUUID } from "node:crypto";

import {
  buildExportManifestFingerprint,
  deepFreezeExportManifest,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportManifestV2,
  isExportManifestV4,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
  type ExportManifestV2,
  type ExportManifestV4,
} from "@/features/export/domain";
import type { ExportManifestV2Draft } from "@/features/export/domain/export-manifest.types";
import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  stableHeadlessDeliveryId,
  type HeadlessCreateJobTransportV1,
  type HeadlessQueueLeaseSettings,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  MemoryHeadlessStreamQueueAdapter,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  buildCanonicalLiveExportManifest,
  buildStaleProjectIdOverwrittenManifest,
} from "../neon-live/canonical-live-manifest";

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

export const DUAL_LEASE_TEST_LEASES: HeadlessQueueLeaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

function fixStory(): FootieScript {
  return syncFootieScript({
    title: "Dual lease fixture",
    narration: "Hello world narration for export.",
    totalDuration: 6,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 6000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
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
        start: 3,
        end: 6,
        duration: 3,
        startMs: 3000,
        endMs: 6000,
        durationMs: 3000,
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

/**
 * Hostile demonstration: overwrite projectId after fingerprint.
 * Never use as a live fixture authority.
 */
export function buildStaleProjectIdOverwrittenFixtureManifest(
  projectId: string,
): ExportManifestV4 {
  return buildStaleProjectIdOverwrittenManifest({
    projectId,
    story: fixStory(),
    environment: CAPABLE_ENV,
  });
}

/**
 * v3 / "9C" — final projectId bound before fingerprint → validate → deepFreeze.
 */
export function buildCanonicalFixtureExportManifestV3(
  projectId: string,
): ExportManifestV4 {
  const built = buildCanonicalLiveExportManifest({
    projectId,
    story: fixStory(),
    environment: CAPABLE_ENV,
  });
  if (!built.ok) {
    throw new Error(`${built.code}: ${built.message}`);
  }
  if (!isExportManifestV4(built.manifest)) {
    throw new Error("expected ExportManifestV4");
  }
  return built.manifest;
}

/**
 * v2 / "8D" — projectId-bound v3 draft demoted to v2, then re-fingerprinted
 * through ExportManifest fingerprint + validator authority (no TS cast as validation).
 */
export function buildCanonicalFixtureExportManifestV2(
  projectId: string,
): ExportManifestV2 {
  const v3 = buildCanonicalFixtureExportManifestV3(projectId);
  const scenes = v3.scenes.map((scene) => {
    const rest = { ...scene };
    delete (rest as { mediaTransitions?: unknown }).mediaTransitions;
    return rest;
  });
  const cloned = JSON.parse(
    JSON.stringify({
      ...v3,
      version: EXPORT_MANIFEST_V2_VERSION,
      rendererContractVersion: EXPORT_RENDERER_CONTRACT_V2,
      scenes,
    }),
  ) as Record<string, unknown>;
  delete cloned.fingerprint;
  const draft = cloned as ExportManifestV2Draft;
  if (draft.project.projectId !== projectId) {
    throw new Error("v2 draft projectId mismatch before fingerprint");
  }
  const fingerprint = buildExportManifestFingerprint(draft);
  const candidate = { ...draft, fingerprint };
  const validated = validateExportManifest(candidate);
  if (!validated.ok) {
    throw new Error(
      validated.issues[0]?.code ?? "ExportManifest v2 validation failed",
    );
  }
  const frozen = deepFreezeExportManifest(candidate);
  if (!isExportManifestV2(frozen)) {
    throw new Error("expected ExportManifestV2 after freeze");
  }
  return frozen;
}

/** Default fixture path is v3 / "9C". */
export function buildCanonicalFixtureExportManifest(
  projectId: string,
): ExportManifest {
  return buildCanonicalFixtureExportManifestV3(projectId);
}

export async function createQueuedCanonicalJob(input?: {
  readonly nowMs?: number;
  readonly ownerId?: string;
  readonly projectId?: string;
  /** When "v2", freezes ExportManifest v2 / "8D"; default v3 / "9C". */
  readonly manifestVersion?: "v2" | "v3";
}) {
  // Bind final owner-authorized projectId FIRST, then fingerprint authority.
  const projectId = input?.projectId ?? randomUUID();
  const nowMs = input?.nowMs ?? 1_700_000_000_000;
  const ownerId = input?.ownerId ?? `owner_${randomUUID()}`;
  const manifest: ExportManifest =
    input?.manifestVersion === "v2"
      ? buildCanonicalFixtureExportManifestV2(projectId)
      : buildCanonicalFixtureExportManifestV3(projectId);

  if (manifest.project.projectId !== projectId) {
    throw new Error("fixture project identity mismatch after fingerprint");
  }

  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess_dual_lease" },
    authorizedProjectIds: [projectId],
    allowProjectMutate: true,
    nowMs: () => nowMs,
  });

  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs,
  });
  if (!seeded.ok) {
    throw new Error(
      `seed failed: ${seeded.issues[0]?.code ?? "unknown"} ${seeded.issues[0]?.message ?? ""}`,
    );
  }

  const transport: HeadlessCreateJobTransportV1 = {
    version: 1,
    projectId,
    manifestObject: seeded.value.manifestLocator,
    manifestPayloadDigest: seeded.value.manifestPayloadDigest,
    assetBundleObject: seeded.value.bundleLocator,
    assetBundleFingerprint: seeded.value.bundle.fingerprint,
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    rendererBuildId: "build_dual_lease_fixture",
    idempotencyKey: `idem_${randomUUID()}`,
  };

  const created = await stack.service.createJob({
    requestContext: {},
    rawBodyText: JSON.stringify(transport),
    body: transport,
  });
  if (!created.ok) {
    throw new Error(
      `createJob failed: ${created.issues[0]?.code} ${created.issues[0]?.message ?? ""}`,
    );
  }

  const jobId = created.value.jobId;
  const recordResult = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
  if (!recordResult.ok || recordResult.value.stage !== "canonical") {
    throw new Error("expected canonical job");
  }
  const record = recordResult.value;
  if (record.canonicalJob!.state !== "queued" || record.claimToken != null) {
    throw new Error(
      `expected queued unclaimed, got ${record.canonicalJob!.state} claim=${record.claimToken}`,
    );
  }

  const streamQueue = new MemoryHeadlessStreamQueueAdapter({
    envName: "local",
    nowMs: () => nowMs,
  });
  await streamQueue.ensureConsumerGroups();

  const deliveryId = stableHeadlessDeliveryId(
    record.jobId,
    record.canonicalJob!.attempt,
  );
  // Legacy createJob path: ensure durable dispatch intent for outbox authority.
  const { ensureDispatchIntentForQueuedJob } = await import(
    "@/features/headless-renderer/control-plane/services/ensure-dispatch-intent-for-queued-job"
  );
  const ensured = await ensureDispatchIntentForQueuedJob({
    jobStore: stack.jobStore,
    dispatchOutbox: stack.dispatchOutbox,
    jobId: record.jobId,
    ownerId,
    nowMs,
  });
  if (!ensured.ok) {
    throw new Error(
      `ensure dispatch intent failed: ${ensured.issues[0]?.message ?? ""}`,
    );
  }

  const enqueued = await streamQueue.enqueueRender({
    deliveryId,
    jobId: record.jobId,
    ownerId,
    attempt: record.canonicalJob!.attempt,
    enqueuedAtMs: nowMs,
    deliveryKind: "render",
  });
  if (!enqueued.ok) throw new Error("enqueue render failed");

  return {
    stack,
    streamQueue,
    ownerId,
    projectId,
    nowMs,
    record,
    deliveryId,
    streamId: enqueued.value.streamId,
    manifest,
  };
}
