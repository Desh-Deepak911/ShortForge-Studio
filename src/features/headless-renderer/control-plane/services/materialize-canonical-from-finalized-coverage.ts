/**
 * Trusted canonical request/job materialization from finalized owned objects.
 * Used only after provisional verification coverage is complete.
 *
 * Loads manifest + asset_bundle_record + every asset_bytes slot through durable
 * owned-object identities. Staging/client digests never become trusted merely
 * because coverage says complete. Uses finalizeHeadlessRenderJobRequest —
 * never attaches fingerprints manually.
 */

import { createHash } from "node:crypto";

import {
  validateExportManifest,
  type ExportManifest,
} from "@/features/export/domain/headless-safe";

import {
  applyHeadlessJobTransition,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessAssetBundle,
  finalizeHeadlessRenderJobRequest,
  headlessSourceSlotKey,
  validateHeadlessAssetBundle,
  type HeadlessAssetDescriptorV1,
  type HeadlessRenderJobRequestV1,
  type HeadlessRenderJobV1,
} from "../../domain";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessR2ObjectIOPort } from "../ports/r2-object-io.port";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "../types/owned-object-record";
import {
  isProvisionalStoredJobRecord,
  type HeadlessProvisionalStoredJobRecord,
} from "../types/stored-job-record";
import {
  HEADLESS_BUNDLE_RECORD_MAX_BYTES,
  HEADLESS_MANIFEST_MAX_BYTES,
  HEADLESS_MANIFEST_MAX_JSON_DEPTH,
  HEADLESS_MANIFEST_MAX_JSON_NODES,
  HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS,
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";
import {
  HEADLESS_MAX_ASSET_BYTES,
  HEADLESS_MAX_ASSETS,
  HEADLESS_MAX_TOTAL_ASSET_BYTES,
} from "../../domain/headless-render-constants";
import { assertHeadlessMaterializationPolicy } from "./materialization-policy";
import { loadFinalizedOwnedObjectBytes } from "./load-finalized-owned-object-bytes";
import { provisionalSnapshotSlotClaimsMatchAssetBundle } from "./provisional-snapshot-slot-authority";
import {
  preflightFinalizedAssetByteBudgets,
  verifyFinalizedOwnedObjectStream,
} from "./verify-finalized-owned-object-stream";

function utf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function countJsonNodes(value: unknown, depth: number): number {
  if (depth > HEADLESS_MANIFEST_MAX_JSON_DEPTH) {
    throw new Error("depth");
  }
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) {
    let n = 1;
    for (const item of value) n += countJsonNodes(item, depth + 1);
    return n;
  }
  let n = 1;
  for (const key of Object.keys(value as object)) {
    n += countJsonNodes((value as Record<string, unknown>)[key], depth + 1);
  }
  return n;
}

function locatorEqual(
  a: { storeId: string; objectKey: string },
  b: { storeId: string; objectKey: string },
): boolean {
  return a.storeId === b.storeId && a.objectKey === b.objectKey;
}

function rebindAssetDescriptorsFromFinalized(input: {
  readonly bundleAssets: readonly HeadlessAssetDescriptorV1[];
  readonly assetsBySlot: ReadonlyMap<string, HeadlessFinalizedOwnedObjectRecordV1>;
  readonly expectedByKey: ReadonlyMap<
    string,
    HeadlessProvisionalStoredJobRecord["snapshotClaim"]["expectedSlotClaims"][number]
  >;
}):
  | { readonly ok: true; readonly assets: readonly HeadlessAssetDescriptorV1[] }
  | { readonly ok: false; readonly message: string } {
  const rebound: HeadlessAssetDescriptorV1[] = [];
  for (const descriptor of input.bundleAssets) {
    const slotKey = headlessSourceSlotKey(descriptor.sourceIdentity);
    const owned = input.assetsBySlot.get(slotKey);
    if (owned == null) {
      return {
        ok: false,
        message: "Bundle asset has no matching finalized owned object.",
      };
    }
    if (
      owned.contentDigest !== descriptor.contentDigest ||
      owned.byteLength !== descriptor.byteLength ||
      owned.mimeType !== descriptor.mimeType
    ) {
      return {
        ok: false,
        message: "Finalized asset content does not match bundle descriptor.",
      };
    }
    const slotClaim = input.expectedByKey.get(slotKey);
    if (
      slotClaim == null ||
      slotClaim.contentDigestClaim !== owned.contentDigest ||
      slotClaim.byteLengthClaim !== owned.byteLength ||
      slotClaim.mimeTypeClaim !== owned.mimeType
    ) {
      return {
        ok: false,
        message: "Finalized asset does not match snapshot slot claim.",
      };
    }
    rebound.push({
      ...descriptor,
      storageLocator: {
        kind: "object_storage",
        storeId: owned.storeId,
        objectKey: owned.objectKey,
      },
      expiresAtMs: owned.expiresAtMs,
    });
  }
  return { ok: true, assets: Object.freeze(rebound) };
}

export type HeadlessCanonicalMaterializationSuccess = {
  readonly provisional: HeadlessProvisionalStoredJobRecord;
  readonly canonicalRequest: HeadlessRenderJobRequestV1;
  readonly canonicalJob: HeadlessRenderJobV1;
};

/**
 * Build a queued canonical request/job pair from complete trusted coverage.
 */
export async function materializeCanonicalFromFinalizedCoverage(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly io: HeadlessR2ObjectIOPort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
}): Promise<HeadlessControlPlaneResult<HeadlessCanonicalMaterializationSuccess>> {
  if (input.signal?.aborted) {
    return cpFail("OPERATION_ABORTED", "Canonical materialization aborted.");
  }

  const jobLoaded = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!jobLoaded.ok) return jobLoaded;
  if (!isProvisionalStoredJobRecord(jobLoaded.value)) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Provisional job required for canonical materialization.",
    );
  }
  const provisional = jobLoaded.value;

  if (provisional.ownerId !== input.ownerId) {
    return cpFail("FORBIDDEN", "Owner mismatch.");
  }
  if (provisional.state !== "materializing") {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Provisional terminal state cannot promote.",
    );
  }
  if (!provisional.verificationCoverage.complete) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Verification coverage is incomplete.",
    );
  }

  const listed = await input.ownedObjectStore.listByJobIdAndOwner({
    jobId: input.jobId,
    ownerId: input.ownerId,
  });
  if (!listed.ok) return listed;

  const finalized = listed.value
    .map((s) => s.record)
    .filter(
      (r): r is HeadlessFinalizedOwnedObjectRecordV1 => r.stage === "finalized",
    );

  // Coherence: same project/operation; no foreign job objects.
  for (const rec of finalized) {
    if (
      rec.projectId !== provisional.projectId ||
      rec.operationId !== provisional.operationId ||
      rec.jobId !== provisional.jobId ||
      rec.ownerId !== provisional.ownerId
    ) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Finalized object lineage mismatch.",
      );
    }
    if (rec.expiresAtMs <= input.nowMs) {
      return cpFail("ASSET_EXPIRED", "Finalized owned object expired.");
    }
    if (rec.expiresAtMs < input.nowMs + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS) {
      return cpFail(
        "ASSET_LEASE_INSUFFICIENT",
        "Finalized object lease is insufficient for job execution.",
      );
    }
  }

  const manifests = finalized.filter((r) => r.purpose === "manifest");
  const bundles = finalized.filter((r) => r.purpose === "asset_bundle_record");
  const assets = finalized.filter((r) => r.purpose === "asset_bytes");

  if (manifests.length !== 1) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Exactly one finalized manifest object is required.",
    );
  }
  if (bundles.length !== 1) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Exactly one finalized asset bundle object is required.",
    );
  }

  const manifestRec = manifests[0]!;
  const bundleRec = bundles[0]!;

  // Trusted digest must match frozen snapshot claim — staging digest never wins.
  if (
    manifestRec.contentDigest !==
    provisional.snapshotClaim.manifestPayloadDigestClaim
  ) {
    return cpFail(
      "MANIFEST_DIGEST_MISMATCH",
      "Finalized manifest digest does not match snapshot claim.",
    );
  }

  const manifestLoaded = await loadFinalizedOwnedObjectBytes({
    ownedObjectStore: input.ownedObjectStore,
    io: input.io,
    objectId: manifestRec.objectId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
    maxBytes: HEADLESS_MANIFEST_MAX_BYTES,
    signal: input.signal,
    allowedPurposes: ["manifest"],
  });
  if (!manifestLoaded.ok) return manifestLoaded;

  let manifestJson: unknown;
  try {
    const text = utf8(manifestLoaded.value.bytes);
    if (digestBytes(manifestLoaded.value.bytes) !== manifestRec.contentDigest) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Manifest digest mismatch.");
    }
    manifestJson = JSON.parse(text);
    if (countJsonNodes(manifestJson, 0) > HEADLESS_MANIFEST_MAX_JSON_NODES) {
      return cpFail("MANIFEST_TOO_LARGE", "Manifest exceeds structure ceiling.");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "depth") {
      return cpFail("MANIFEST_TOO_LARGE", "Manifest exceeds structure ceiling.");
    }
    return cpFail("MANIFEST_MALFORMED", "Manifest JSON is malformed.");
  }

  const manifestValidation = validateExportManifest(manifestJson);
  if (!manifestValidation.ok) {
    return cpFail("MANIFEST_MALFORMED", "ExportManifest failed validation.");
  }
  const manifest = manifestJson as ExportManifest;
  if (manifest.project.projectId !== provisional.projectId) {
    return cpFail(
      "OBJECT_OWNERSHIP_MISMATCH",
      "Manifest projectId does not match provisional projectId.",
    );
  }

  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const matPolicy = assertHeadlessMaterializationPolicy(slots);
  if (!matPolicy.ok) return matPolicy;

  // Snapshot slot claims must map 1:1 to required slots.
  const expectedSlots = provisional.snapshotClaim.expectedSlotClaims;
  if (expectedSlots.length !== slots.length) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Snapshot slot claims do not match manifest slots.",
    );
  }
  const expectedByKey = new Map(expectedSlots.map((s) => [s.slotKey, s]));
  for (const slot of slots) {
    const key = headlessSourceSlotKey(slot);
    const claim = expectedByKey.get(key);
    if (claim == null) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Missing snapshot slot claim for manifest slot.",
      );
    }
  }

  const bundleLoaded = await loadFinalizedOwnedObjectBytes({
    ownedObjectStore: input.ownedObjectStore,
    io: input.io,
    objectId: bundleRec.objectId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
    maxBytes: HEADLESS_BUNDLE_RECORD_MAX_BYTES,
    signal: input.signal,
    allowedPurposes: ["asset_bundle_record"],
  });
  if (!bundleLoaded.ok) return bundleLoaded;

  let bundleJson: unknown;
  try {
    bundleJson = JSON.parse(utf8(bundleLoaded.value.bytes));
    if (countJsonNodes(bundleJson, 0) > HEADLESS_MANIFEST_MAX_JSON_NODES) {
      return cpFail("BODY_TOO_LARGE", "Asset bundle exceeds structure ceiling.");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "depth") {
      return cpFail("BODY_TOO_LARGE", "Asset bundle exceeds structure ceiling.");
    }
    return cpFail(
      "INVALID_TRANSPORT",
      "Asset bundle record is malformed JSON.",
    );
  }

  const bundleResult = validateHeadlessAssetBundle(bundleJson, manifest);
  if (!bundleResult.ok) {
    return cpFail(
      "BUNDLE_FINGERPRINT_MISMATCH",
      "Asset bundle failed exact coverage/validation.",
    );
  }

  // Every frozen snapshot slot maps exactly once to a finalized asset_bytes object.
  const assetsBySlot = new Map<string, HeadlessFinalizedOwnedObjectRecordV1>();
  for (const asset of assets) {
    if (asset.slotKey == null) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Asset bytes object missing slotKey.",
      );
    }
    if (assetsBySlot.has(asset.slotKey)) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Duplicate finalized asset_bytes for slot.",
      );
    }
    assetsBySlot.set(asset.slotKey, asset);
  }
  for (const slot of expectedSlots) {
    if (!assetsBySlot.has(slot.slotKey)) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Missing finalized asset_bytes for snapshot slot.",
      );
    }
  }
  if (assetsBySlot.size !== expectedSlots.length) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Foreign or extra finalized asset_bytes objects.",
    );
  }

  if (
    bundleResult.bundle.fingerprint !==
    provisional.snapshotClaim.assetBundleFingerprintClaim
  ) {
    const reboundProbe = rebindAssetDescriptorsFromFinalized({
      bundleAssets: bundleResult.bundle.assets,
      assetsBySlot,
      expectedByKey,
    });
    if (
      !reboundProbe.ok ||
      !provisionalSnapshotSlotClaimsMatchAssetBundle({
        expectedSlotClaims: expectedSlots,
        assets: reboundProbe.assets,
      })
    ) {
      return cpFail(
        "BUNDLE_FINGERPRINT_MISMATCH",
        "Asset bundle fingerprint mismatch.",
      );
    }
  }

  const reboundBuilt = rebindAssetDescriptorsFromFinalized({
    bundleAssets: bundleResult.bundle.assets,
    assetsBySlot,
    expectedByKey,
  });
  if (!reboundBuilt.ok) {
    return cpFail(
      reboundBuilt.message.includes("snapshot")
        ? "JOB_STORE_COHERENCE_REJECTED"
        : reboundBuilt.message.includes("content")
          ? "OBJECT_INTEGRITY_FAILED"
          : "ASSET_NOT_FOUND",
      reboundBuilt.message,
    );
  }

  const reboundBundleResult = finalizeHeadlessAssetBundle({
    bundleId: bundleResult.bundle.bundleId,
    assets: reboundBuilt.assets,
    manifest,
  });
  if (!reboundBundleResult.ok) {
    return cpFail(
      "BUNDLE_FINGERPRINT_MISMATCH",
      "Rebound asset bundle failed validation.",
    );
  }

  if (
    reboundBundleResult.bundle.fingerprint !==
      provisional.snapshotClaim.assetBundleFingerprintClaim &&
    !provisionalSnapshotSlotClaimsMatchAssetBundle({
      expectedSlotClaims: expectedSlots,
      assets: reboundBundleResult.bundle.assets,
    })
  ) {
    return cpFail(
      "BUNDLE_FINGERPRINT_MISMATCH",
      "Rebound bundle failed slot claim authority.",
    );
  }

  const preflight = preflightFinalizedAssetByteBudgets({
    assets: assets.map((a) => ({
      byteLength: a.byteLength,
      slotKey: a.slotKey,
    })),
    expectedSlotKeys: expectedSlots.map((s) => s.slotKey),
    maxAssets: HEADLESS_MAX_ASSETS,
    maxAssetBytes: HEADLESS_MAX_ASSET_BYTES,
    maxTotalAssetBytes: HEADLESS_MAX_TOTAL_ASSET_BYTES,
  });
  if (!preflight.ok) return preflight;
  let aggregateRemaining = preflight.value.totalBytes;

  for (const descriptor of reboundBundleResult.bundle.assets) {
    const slotKey = headlessSourceSlotKey(descriptor.sourceIdentity);
    const owned = assetsBySlot.get(slotKey);
    if (owned == null) {
      return cpFail(
        "ASSET_NOT_FOUND",
        "Rebound bundle asset has no matching finalized owned object.",
      );
    }
    if (
      !locatorEqual(owned, {
        storeId: descriptor.storageLocator.storeId,
        objectKey: descriptor.storageLocator.objectKey,
      })
    ) {
      return cpFail(
        "OBJECT_INTEGRITY_FAILED",
        "Rebound bundle locator does not match finalized owned object.",
      );
    }

    const verified = await verifyFinalizedOwnedObjectStream({
      ownedObjectStore: input.ownedObjectStore,
      io: input.io,
      objectId: owned.objectId,
      ownerId: input.ownerId,
      nowMs: input.nowMs,
      maxBytes: Math.min(owned.byteLength, HEADLESS_MAX_ASSET_BYTES),
      aggregateMaxBytesRemaining: aggregateRemaining,
      expected: {
        projectId: provisional.projectId,
        jobId: provisional.jobId,
        operationId: provisional.operationId,
        purpose: "asset_bytes",
        slotKey,
        contentDigest: owned.contentDigest,
        byteLength: owned.byteLength,
        mimeType: owned.mimeType,
      },
      signal: input.signal,
    });
    if (!verified.ok) return verified;
    if (verified.value.peakRetainedChunks > 1) {
      return cpFail(
        "INTERNAL_ERROR",
        "Asset stream retained more than one payload chunk.",
      );
    }
    aggregateRemaining -= verified.value.streamedByteLength;
    if (aggregateRemaining < 0) {
      return cpFail(
        "ASSET_BYTES_OVERFLOW",
        "Aggregate asset bytes exceed ceiling.",
      );
    }
  }

  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: {
      ownerId: provisional.ownerId,
      projectId: provisional.projectId,
    },
    manifest,
    assetBundle: reboundBundleResult.bundle,
    rendererProfile: provisional.requestedRendererProfile,
    rendererBuildId: provisional.requestedRendererBuildId,
    idempotencyKey: provisional.creatorIdempotencyKey,
  });
  if (!requestResult.ok) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      requestResult.issues[0]?.message ??
        "Canonical request materialization failed.",
    );
  }

  const accepted = createAcceptedHeadlessRenderJob({
    jobId: provisional.jobId,
    requestValue: requestResult.request,
    createdAtMs: provisional.createdAtMs,
  });
  if (!accepted.ok) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Canonical accepted job materialization failed.",
    );
  }

  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: accepted.job.attempt,
    updatedAtMs: Math.max(input.nowMs, accepted.job.updatedAtMs + 1),
  });
  if (!queued.ok) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Canonical queued transition failed.",
    );
  }

  return cpOk(
    Object.freeze({
      provisional,
      canonicalRequest: accepted.request,
      canonicalJob: queued.job,
    }),
  );
}
