/**
 * Provider-free in-memory storage seeding for claimed-render diagnostic.
 */

import { createHash, randomUUID } from "node:crypto";

import type { ExportManifest } from "@/features/export/domain/headless-safe";

import { MemoryHeadlessStorageAdapter } from "../../control-plane/adapters/memory-storage.adapter";
import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/types/stored-job-record";
import { HEADLESS_STORED_JOB_RECORD_VERSION } from "../../control-plane/types/stored-job-record";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "../../control-plane/types/control-plane.types";
import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import {
  applyHeadlessJobTransition,
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessAssetBundle,
  finalizeHeadlessRenderJobRequest,
  headlessSourceDigest,
  headlessSourceSlotKey,
  type HeadlessAssetBundleV1,
  type HeadlessRendererProfile,
} from "../../domain";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "../runtime/worker-types";

import type { ClaimedRenderDiagnosticVariantId } from "./claimed-render-diagnostic-events";

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function seedOwnedJsonObject(input: {
  readonly storage: HeadlessStoragePort;
  readonly ownerId: string;
  readonly projectId: string;
  readonly purpose: "manifest" | "asset_bundle_record" | "asset_bytes";
  readonly json?: unknown;
  readonly bytes?: Uint8Array;
  readonly mimeType: string;
  readonly expiresAtMs: number;
}) {
  const bytes =
    input.bytes ?? new TextEncoder().encode(JSON.stringify(input.json ?? null));
  const digest = digestBytes(bytes);
  const session = await input.storage.createUploadSession({
    ownerId: input.ownerId,
    projectId: input.projectId,
    purpose: input.purpose,
    mimeType: input.mimeType,
    expiresAtMs: input.expiresAtMs,
  });
  if (!session.ok) throw new Error("seed_upload_session_failed");
  const written = await input.storage.writeUploadBytes({
    capabilityToken: session.value.capabilityToken,
    bytes,
  });
  if (!written.ok) throw new Error("seed_upload_write_failed");
  const finalized = await input.storage.finalizeUploadedObject({
    capabilityToken: session.value.capabilityToken,
    expectedContentDigest: digest,
  });
  if (!finalized.ok) throw new Error("seed_upload_finalize_failed");
  return finalized.value;
}

export async function seedDiagnosticOwnedManifestAndBundle(input: {
  readonly storage: HeadlessStoragePort;
  readonly ownerId: string;
  readonly projectId: string;
  readonly manifest: ExportManifest;
  readonly nowMs: number;
  readonly assetBytesByUrl: ReadonlyMap<string, Uint8Array>;
}): Promise<{
  readonly manifestPayloadDigest: string;
  readonly bundle: HeadlessAssetBundleV1;
}> {
  const expiresAtMs =
    input.nowMs + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2;

  const manifestSeed = await seedOwnedJsonObject({
    storage: input.storage,
    ownerId: input.ownerId,
    projectId: input.projectId,
    purpose: "manifest",
    json: input.manifest,
    mimeType: "application/json",
    expiresAtMs,
  });

  const slots = extractRequiredHeadlessSourceSlots(input.manifest);
  const assets = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    let bytes: Uint8Array | undefined;
    for (const [url, assetBytes] of input.assetBytesByUrl) {
      if (headlessSourceDigest(url) === slot.sourceDigest) {
        bytes = assetBytes;
        break;
      }
    }
    if (bytes == null) {
      bytes = new TextEncoder().encode(`asset-bytes-${i}-${slot.sourceDigest}`);
    }
    const mimeType =
      slot.expectedMediaKind === "audio"
        ? "audio/wav"
        : slot.expectedMediaKind === "video"
          ? "video/mp4"
          : "image/png";
    const seeded = await seedOwnedJsonObject({
      storage: input.storage,
      ownerId: input.ownerId,
      projectId: input.projectId,
      purpose: "asset_bytes",
      bytes,
      mimeType,
      expiresAtMs,
    });
    assets.push({
      version: 1 as const,
      assetId: `asset-${i}`,
      sourceIdentity: {
        role: slot.role,
        sceneId: slot.sceneId,
        mediaItemId: slot.mediaItemId,
        sourceDigest: slot.sourceDigest,
        classification: slot.classification,
      },
      contentDigest: seeded.contentDigest,
      byteLength: seeded.byteLength,
      mimeType: seeded.mimeType,
      mediaKind: slot.expectedMediaKind,
      storageLocator: seeded.locator,
      expiresAtMs: seeded.expiresAtMs,
    });
  }

  const bundleResult = finalizeHeadlessAssetBundle({
    bundleId: "diag-bundle-1",
    assets,
    manifest: input.manifest,
  });
  if (!bundleResult.ok) {
    throw new Error("bundle_finalize_failed");
  }

  await seedOwnedJsonObject({
    storage: input.storage,
    ownerId: input.ownerId,
    projectId: input.projectId,
    purpose: "asset_bundle_record",
    json: bundleResult.bundle,
    mimeType: "application/json",
    expiresAtMs,
  });

  return {
    manifestPayloadDigest: manifestSeed.contentDigest,
    bundle: bundleResult.bundle,
  };
}

export async function buildDiagnosticClaimedJobContext(input: {
  readonly variant: ClaimedRenderDiagnosticVariantId;
  readonly manifest: ExportManifest;
  readonly assetBytesByUrl: ReadonlyMap<string, Uint8Array>;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly nowMs: number;
}): Promise<{
  readonly storage: MemoryHeadlessStorageAdapter;
  readonly record: HeadlessCanonicalStoredJobRecord;
  readonly claimToken: string;
  readonly ownerId: string;
}> {
  const ownerId = "claimed_render_diagnostic_owner";
  const projectId = input.manifest.project.projectId;
  const storage = new MemoryHeadlessStorageAdapter();
  const seeded = await seedDiagnosticOwnedManifestAndBundle({
    storage,
    ownerId,
    projectId,
    manifest: input.manifest,
    nowMs: input.nowMs,
    assetBytesByUrl: input.assetBytesByUrl,
  });

  const idempotencyKey = `diag-${input.variant}-${projectId.slice(0, 8)}`;
  const authority = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey,
  });
  if (!authority.ok) throw new Error("idempotency_authority_failed");

  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId, projectId },
    manifest: input.manifest,
    assetBundle: seeded.bundle,
    rendererProfile: input.rendererProfile,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    idempotencyKey,
  });
  if (!requestResult.ok) throw new Error("finalize_request_failed");

  const jobId = randomUUID();
  const operationId = randomUUID();
  const accepted = createAcceptedHeadlessRenderJob({
    jobId,
    requestValue: requestResult.request,
    createdAtMs: input.nowMs,
  });
  if (!accepted.ok) throw new Error("accept_job_failed");

  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: 1,
    updatedAtMs: input.nowMs,
  });
  if (!queued.ok) throw new Error("queue_transition_failed");

  const claimToken = `claim_diag_${randomUUID().slice(0, 8)}`;
  const record: HeadlessCanonicalStoredJobRecord = {
    version: HEADLESS_STORED_JOB_RECORD_VERSION,
    stage: "canonical",
    storeVersion: 1,
    jobId,
    ownerId,
    projectId,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    idempotencyAuthorityKey: authority.fingerprint,
    operationId,
    canonicalJob: queued.job,
    canonicalRequest: accepted.request,
    claimToken,
    claimedAtMs: input.nowMs,
    artifactObjectBinding: null,
  };

  return { storage, record, claimToken, ownerId };
}

export { MemoryHeadlessStorageAdapter };
