import { randomBytes, randomUUID } from "node:crypto";

import {
  validateExportManifest,
  type ExportManifestV4,
} from "@/features/export/domain/headless-safe";
import {
  buildHeadlessIdempotencyAuthorityKey,
  buildHeadlessRenderJobRequestFingerprint,
  extractRequiredHeadlessSourceSlots,
  headlessSourceSlotKey,
  validateHeadlessAssetBundle,
  type HeadlessAssetBundleV1,
  type HeadlessRendererProfile,
} from "@/features/headless-renderer/domain";
import { headlessSha256HexBytes } from "@/features/headless-renderer/domain/headless-sha256";

import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";
import type { ProductionHeadlessControlPlaneComposition } from "../runtime/compose-production-control-plane";
import { STAGING_HEADLESS_RENDERER_BUILD_ID } from "../runtime/staging-renderer-build-authority";
import { createProvisionalMaterializingRecord } from "./provisional-job-lifecycle";
import { deriveHeadlessR2ObjectKey } from "./r2-object-key-authority";
import { stableHeadlessVerifyDeliveryId } from "./stable-delivery-id";
import { toHeadlessProductJobViewFromStore } from "./safe-job-view";
import { cpFail, cpOk } from "../types/control-plane.types";

const UPLOAD_LEASE_MS = 10 * 60 * 1000;
const OBJECT_LEASE_MS = 4 * 60 * 60 * 1000;

type PrepareBody = {
  readonly version: 1;
  readonly operationId: string;
  readonly projectId: string;
  readonly manifest: ExportManifestV4;
  readonly assetBundle: HeadlessAssetBundleV1;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly idempotencyKey: string;
};

function isBoundedId(value: unknown, max = 256): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value === value.trim() &&
    !/[\s/\\]/.test(value)
  );
}

function parseBody(value: unknown): PrepareBody | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  const expected = [
    "assetBundle",
    "idempotencyKey",
    "manifest",
    "operationId",
    "projectId",
    "rendererProfile",
    "version",
  ].sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) {
    return null;
  }
  if (
    body.version !== 1 ||
    !isBoundedId(body.operationId, 128) ||
    !isBoundedId(body.projectId, 128) ||
    !isBoundedId(body.idempotencyKey, 512)
  ) {
    return null;
  }
  return body as unknown as PrepareBody;
}

function exactPayloads(body: PrepareBody) {
  const manifestBytes = new TextEncoder().encode(JSON.stringify(body.manifest));
  const bundleBytes = new TextEncoder().encode(JSON.stringify(body.assetBundle));
  const manifestDigest = `sha256:${headlessSha256HexBytes(manifestBytes)}`;
  const bundleDigest = `sha256:${headlessSha256HexBytes(bundleBytes)}`;
  const slots = extractRequiredHeadlessSourceSlots(body.manifest);
  const assets = body.assetBundle.assets.map((asset) => {
    const slot = slots.find(
      (candidate) =>
        candidate.role === asset.sourceIdentity.role &&
        candidate.sceneId === asset.sourceIdentity.sceneId &&
        candidate.mediaItemId === asset.sourceIdentity.mediaItemId &&
        candidate.sourceDigest === asset.sourceIdentity.sourceDigest,
    );
    if (slot == null) throw new Error("slot");
    return {
      purpose: "asset_bytes" as const,
      slotKey: headlessSourceSlotKey(slot),
      digest: asset.contentDigest,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
    };
  });
  return {
    manifestBytes,
    bundleBytes,
    manifestDigest,
    bundleDigest,
    assets,
  };
}

export async function prepareStagingOwnedUpload(input: {
  readonly composition: ProductionHeadlessControlPlaneComposition;
  readonly principal: HeadlessAuthenticatedPrincipal;
  readonly body: unknown;
  readonly allowedOrigin: string;
}) {
  const body = parseBody(input.body);
  if (body == null) return cpFail("INVALID_TRANSPORT", "Upload request rejected.");
  const { composition, principal } = input;
  if (
    !composition.productionAvailable ||
    composition.jobStore == null ||
    composition.ownedObjectStore == null
  ) {
    return cpFail("CONFIGURATION_UNAVAILABLE", "Server rendering is unavailable.");
  }
  const manifestValidation = validateExportManifest(body.manifest);
  if (!manifestValidation.ok || body.manifest.project.projectId !== body.projectId) {
    return cpFail("MANIFEST_MALFORMED", "Export manifest rejected.");
  }
  const bundleValidation = validateHeadlessAssetBundle(
    body.assetBundle,
    body.manifest,
  );
  if (!bundleValidation.ok) {
    return cpFail("BUNDLE_FINGERPRINT_MISMATCH", "Asset bundle rejected.");
  }
  const ownership = await composition.projectAuthorization.claimUnownedProject(
    principal,
    body.projectId,
  );
  if (!ownership.ok) return ownership;

  let payloads: ReturnType<typeof exactPayloads>;
  try {
    payloads = exactPayloads(body);
  } catch {
    return cpFail("INVALID_TRANSPORT", "Asset coverage rejected.");
  }
  const nowMs = Date.now();
  const jobId = randomUUID();
  const objectInputs = [
    {
      purpose: "manifest" as const,
      slotKey: null,
      digest: payloads.manifestDigest,
      byteLength: payloads.manifestBytes.byteLength,
      mimeType: "application/json",
    },
    {
      purpose: "asset_bundle_record" as const,
      slotKey: null,
      digest: payloads.bundleDigest,
      byteLength: payloads.bundleBytes.byteLength,
      mimeType: "application/json",
    },
    ...payloads.assets,
  ].map((payload) => {
    const key = deriveHeadlessR2ObjectKey({
      environmentNamespace: "staging",
      objectNamespace: "staging",
      ownerId: principal.ownerId,
      projectId: body.projectId,
      jobId,
      operationId: body.operationId,
      purpose: payload.purpose,
      slotKey:
        payload.slotKey != null && payload.slotKey.length <= 128
          ? payload.slotKey
          : null,
      nonce: randomBytes(16).toString("hex"),
    });
    if (!key.ok) throw new Error("key");
    return {
      ...payload,
      objectId: randomUUID(),
      objectKey: key.objectKey,
      storeId: key.storeId,
    };
  });

  const requestFingerprint = buildHeadlessRenderJobRequestFingerprint({
    ownership: { ownerId: principal.ownerId, projectId: body.projectId },
    manifestFingerprint: body.manifest.fingerprint,
    manifestPayloadDigest: payloads.manifestDigest,
    assetBundleFingerprint: body.assetBundle.fingerprint,
    rendererProfile: body.rendererProfile,
    rendererBuildId: STAGING_HEADLESS_RENDERER_BUILD_ID,
    idempotencyKey: body.idempotencyKey,
  });
  if (!requestFingerprint.ok) {
    return cpFail("INVALID_TRANSPORT", "Request fingerprint rejected.");
  }
  const idempotency = buildHeadlessIdempotencyAuthorityKey({
    ownerId: principal.ownerId,
    projectId: body.projectId,
    requestFingerprint: requestFingerprint.fingerprint,
  });
  if (!idempotency.ok) {
    return cpFail("INVALID_TRANSPORT", "Idempotency authority rejected.");
  }

  const slots = extractRequiredHeadlessSourceSlots(body.manifest);
  const provisional = createProvisionalMaterializingRecord({
    jobId,
    ownerId: principal.ownerId,
    projectId: body.projectId,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    idempotencyAuthorityKey: idempotency.key,
    operationId: body.operationId,
    creatorIdempotencyKey: body.idempotencyKey,
    requestedRendererProfile: body.rendererProfile,
    requestedRendererBuildId: STAGING_HEADLESS_RENDERER_BUILD_ID,
    snapshotClaim: {
      manifestPayloadDigestClaim: payloads.manifestDigest,
      assetBundleFingerprintClaim: body.assetBundle.fingerprint,
      expectedSlotClaims: body.assetBundle.assets.map((asset) => {
        const slot = slots.find(
          (candidate) =>
            candidate.role === asset.sourceIdentity.role &&
            candidate.sceneId === asset.sourceIdentity.sceneId &&
            candidate.mediaItemId === asset.sourceIdentity.mediaItemId &&
            candidate.sourceDigest === asset.sourceIdentity.sourceDigest,
        )!;
        return {
          slotKey: headlessSourceSlotKey(slot),
          role: slot.role,
          sceneId: slot.sceneId,
          mediaItemId: slot.mediaItemId,
          sourceDigestClaim: slot.sourceDigest,
          contentDigestClaim: asset.contentDigest,
          byteLengthClaim: asset.byteLength,
          mimeTypeClaim: asset.mimeType,
        };
      }),
    },
    stagingObjectRefs: objectInputs.map((object) => ({
      purpose: object.purpose,
      slotKey: object.slotKey,
      locator: {
        kind: "object_storage" as const,
        storeId: object.storeId,
        objectKey: object.objectKey,
      },
      contentDigestClaim: object.digest,
      byteLengthClaim: object.byteLength,
      mimeTypeClaim: object.mimeType,
    })),
    expiresAtMs: nowMs + OBJECT_LEASE_MS,
  });
  if (!provisional.ok) {
    return cpFail("INVALID_TRANSPORT", "Provisional job rejected.");
  }
  const created = await composition.jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: idempotency.key,
    record: provisional.record,
  });
  if (!created.ok) return created;
  if (created.value.kind !== "created") {
    return cpFail("IDEMPOTENCY_CONFLICT", "Export request already exists.");
  }

  const uploads = [];
  for (const object of objectInputs) {
    const staged = await composition.ownedObjectStore.createStagingRecord({
      objectId: object.objectId,
      ownerId: principal.ownerId,
      projectId: body.projectId,
      jobId,
      operationId: body.operationId,
      purpose: object.purpose,
      slotKey: object.slotKey,
      storeId: object.storeId,
      objectKey: object.objectKey,
      expectedContentDigestClaim: object.digest,
      expectedByteLength: object.byteLength,
      expectedMimeType: object.mimeType,
      uploadCapabilityIssuedAtMs: nowMs,
      uploadCapabilityExpiresAtMs: nowMs + UPLOAD_LEASE_MS,
      expiresAtMs: nowMs + OBJECT_LEASE_MS,
      createdAtMs: nowMs,
    });
    if (!staged.ok) return staged;
    const capability = await composition.uploadCapability.issueDirectPutCapability({
      ownerId: principal.ownerId,
      projectId: body.projectId,
      jobId,
      operationId: body.operationId,
      objectId: object.objectId,
      expectedByteLength: object.byteLength,
      expectedMimeType: object.mimeType,
      allowedOrigin: input.allowedOrigin,
      nowMs,
    });
    if (!capability.ok) return capability;
    uploads.push({
      objectId: object.objectId,
      purpose: object.purpose,
      slotKey: object.slotKey,
      putUrl: capability.value.putUrl,
      requiredHeaders: capability.value.requiredHeaders,
      expiresAtMs: capability.value.expiresAtMs,
    });
  }

  return cpOk({
    jobId,
    view: toHeadlessProductJobViewFromStore(created.value.record),
    uploads,
  });
}

export async function completeStagingOwnedUpload(input: {
  readonly composition: ProductionHeadlessControlPlaneComposition;
  readonly principal: HeadlessAuthenticatedPrincipal;
  readonly jobId: string;
  readonly body: unknown;
}) {
  const { composition, principal } = input;
  if (
    !composition.productionAvailable ||
    composition.jobStore == null ||
    composition.ownedObjectStore == null ||
    composition.upstashRestProducer == null
  ) {
    return cpFail("CONFIGURATION_UNAVAILABLE", "Server rendering is unavailable.");
  }
  const body =
    input.body != null && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : null;
  if (
    body == null ||
    body.version !== 1 ||
    !isBoundedId(body.operationId, 128) ||
    !Array.isArray(body.objectIds) ||
    body.objectIds.some((id) => !isBoundedId(id, 128))
  ) {
    return cpFail("INVALID_TRANSPORT", "Upload completion rejected.");
  }
  const job = await composition.jobStore.getByJobIdAndOwner(
    input.jobId,
    principal.ownerId,
  );
  if (!job.ok) return job;
  if (
    job.value.stage !== "provisional" ||
    job.value.operationId !== body.operationId
  ) {
    return cpFail("FORBIDDEN", "Upload completion authority mismatch.");
  }
  const objects = await composition.ownedObjectStore.listByJobIdAndOwner({
    jobId: input.jobId,
    ownerId: principal.ownerId,
  });
  if (!objects.ok) return objects;
  const submitted = new Set(body.objectIds as string[]);
  if (
    submitted.size !== objects.value.length ||
    objects.value.some((object) => !submitted.has(object.record.objectId))
  ) {
    return cpFail("INVALID_TRANSPORT", "Upload completion coverage mismatch.");
  }
  const nowMs = Date.now();
  for (const object of objects.value) {
    if (object.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Upload object is not staging.");
    }
    const observed = composition.ownedObjectStore.markUploadedObserved;
    if (observed == null) {
      return cpFail("CONFIGURATION_UNAVAILABLE", "Upload observation unavailable.");
    }
    const marked = await observed.call(composition.ownedObjectStore, {
      objectId: object.record.objectId,
      ownerId: principal.ownerId,
      expectedStoreVersion: object.storeVersion,
      uploadedObservedAtMs: nowMs,
      nowMs,
    });
    if (!marked.ok) return marked;
    const queued = await composition.upstashRestProducer.enqueueVerify({
      deliveryId: stableHeadlessVerifyDeliveryId(object.record.objectId, 1),
      ownedObjectId: object.record.objectId,
      ownerId: principal.ownerId,
      attempt: 1,
      enqueuedAtMs: nowMs,
      deliveryKind: "verify",
    });
    if (!queued.ok) return queued;
  }
  const reread = await composition.jobStore.getByJobIdAndOwner(
    input.jobId,
    principal.ownerId,
  );
  if (!reread.ok) return reread;
  return cpOk({
    jobId: input.jobId,
    view: toHeadlessProductJobViewFromStore(reread.value),
  });
}
