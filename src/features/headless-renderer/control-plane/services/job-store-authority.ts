/**
 * Shared job-store authority helpers — memory + Neon adapters must stay aligned.
 */

import { validateHeadlessRenderJobCoherence } from "../../domain/validate-headless-coherence";
import { cpFail } from "../types/control-plane.types";
import { HEADLESS_STORED_JOB_RECORD_VERSION } from "../types/stored-job-record";
import type {
  HeadlessCanonicalCreateLegacyWrite,
  HeadlessCanonicalStoredJobRecord,
  HeadlessPromoteProvisionalInput,
  HeadlessProvisionalStoreWrite,
} from "../ports/job-store.port";
import type { HeadlessProvisionalStoredJobRecord } from "../types/stored-job-record";

export function assertExplicitOperationId(
  operationId: unknown,
): ReturnType<typeof cpFail> | null {
  if (
    typeof operationId !== "string" ||
    operationId.trim().length === 0 ||
    operationId !== operationId.trim() ||
    operationId.length > 128
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Explicit bounded operationId is required; adapters must not invent lineage.",
    );
  }
  if (operationId.startsWith("canon_op_")) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Invented canon_op_ operation lineage is forbidden.",
    );
  }
  return null;
}

export function legacyToCanonicalWrite(
  legacy: HeadlessCanonicalCreateLegacyWrite,
):
  | {
      readonly ok: true;
      readonly write: Omit<HeadlessCanonicalStoredJobRecord, "storeVersion">;
    }
  | { readonly ok: false; readonly fail: ReturnType<typeof cpFail> } {
  const op = assertExplicitOperationId(legacy.operationId);
  if (op) return { ok: false, fail: op };
  return {
    ok: true,
    write: {
      version: HEADLESS_STORED_JOB_RECORD_VERSION,
      stage: "canonical",
      jobId: legacy.job.jobId,
      ownerId: legacy.job.ownership.ownerId,
      projectId: legacy.job.ownership.projectId,
      createdAtMs: legacy.job.createdAtMs,
      updatedAtMs: legacy.job.updatedAtMs,
      idempotencyAuthorityKey: legacy.idempotencyAuthorityKey,
      operationId: legacy.operationId,
      canonicalJob: legacy.job,
      canonicalRequest: legacy.request,
      claimToken: legacy.claimToken,
      claimedAtMs: legacy.claimedAtMs,
      artifactObjectBinding: legacy.artifactObjectBinding,
    },
  };
}

export function provisionalSemanticFingerprint(
  record: HeadlessProvisionalStoreWrite | HeadlessProvisionalStoredJobRecord,
): string {
  const slots = record.snapshotClaim.expectedSlotClaims
    .map(
      (s) =>
        `${s.slotKey}|${s.role}|${s.sourceDigestClaim}|${s.contentDigestClaim}|${s.byteLengthClaim}|${s.mimeTypeClaim}`,
    )
    .sort()
    .join(";");
  const profile = record.requestedRendererProfile;
  return [
    record.ownerId,
    record.projectId,
    record.creatorIdempotencyKey,
    profile.resolution,
    profile.format,
    String(profile.fps),
    profile.quality,
    record.requestedRendererBuildId,
    record.snapshotClaim.manifestPayloadDigestClaim,
    record.snapshotClaim.assetBundleFingerprintClaim,
    slots,
  ].join("\n");
}

export function assertCanonicalIdentityPreserved(
  current: HeadlessCanonicalStoredJobRecord,
  next: HeadlessCanonicalCreateLegacyWrite,
): ReturnType<typeof cpFail> | null {
  if (next.job.jobId !== current.jobId) {
    return cpFail("JOB_STORE_COHERENCE_REJECTED", "jobId must be preserved.");
  }
  if (
    next.job.ownership.ownerId !== current.ownerId ||
    next.job.ownership.projectId !== current.projectId ||
    next.request.ownership.ownerId !== current.ownerId ||
    next.request.ownership.projectId !== current.projectId
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Ownership must be preserved.",
    );
  }
  if (
    next.request.requestFingerprint !==
      current.canonicalRequest.requestFingerprint ||
    next.job.requestFingerprint !== current.canonicalJob.requestFingerprint
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Canonical requestFingerprint must be preserved.",
    );
  }
  if (next.idempotencyAuthorityKey !== current.idempotencyAuthorityKey) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "idempotencyAuthorityKey must be preserved.",
    );
  }
  if (next.operationId !== current.operationId) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "operationId must be preserved.",
    );
  }
  const cur = current.canonicalJob;
  if (
    next.job.manifestFingerprint !== cur.manifestFingerprint ||
    next.job.assetBundleFingerprint !== cur.assetBundleFingerprint ||
    next.job.rendererBuildId !== cur.rendererBuildId ||
    next.job.rendererProfile.resolution !== cur.rendererProfile.resolution ||
    next.job.rendererProfile.format !== cur.rendererProfile.format ||
    next.job.rendererProfile.fps !== cur.rendererProfile.fps ||
    next.job.rendererProfile.quality !== cur.rendererProfile.quality ||
    next.job.idempotencyKey !== cur.idempotencyKey
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Job semantic identity fields must be preserved across CAS.",
    );
  }
  if (
    current.artifactObjectBinding != null &&
    next.artifactObjectBinding != null
  ) {
    const a = current.artifactObjectBinding;
    const b = next.artifactObjectBinding;
    if (
      a.jobId !== b.jobId ||
      a.attempt !== b.attempt ||
      a.ownerId !== b.ownerId ||
      a.projectId !== b.projectId ||
      a.contentDigest !== b.contentDigest ||
      a.byteLength !== b.byteLength ||
      a.mimeType !== b.mimeType ||
      a.artifactFingerprint !== b.artifactFingerprint ||
      a.requestFingerprint !== b.requestFingerprint ||
      a.expiresAtMs !== b.expiresAtMs ||
      a.storageLocator.storeId !== b.storageLocator.storeId ||
      a.storageLocator.objectKey !== b.storageLocator.objectKey
    ) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "artifactObjectBinding is immutable once set.",
      );
    }
  }
  return null;
}

export function assertProvisionalIdentityPreserved(
  current: HeadlessProvisionalStoredJobRecord,
  next: HeadlessProvisionalStoreWrite,
): ReturnType<typeof cpFail> | null {
  if (
    next.jobId !== current.jobId ||
    next.ownerId !== current.ownerId ||
    next.projectId !== current.projectId ||
    next.createdAtMs !== current.createdAtMs ||
    next.idempotencyAuthorityKey !== current.idempotencyAuthorityKey ||
    next.operationId !== current.operationId ||
    next.creatorIdempotencyKey !== current.creatorIdempotencyKey ||
    next.expiresAtMs !== current.expiresAtMs
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Provisional identity fields must be preserved.",
    );
  }
  if (
    provisionalSemanticFingerprint(next) !==
    provisionalSemanticFingerprint(current)
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Provisional semantic claim identity must be preserved.",
    );
  }
  return null;
}

export function profilesMatch(
  a: HeadlessProvisionalStoredJobRecord["requestedRendererProfile"],
  b: HeadlessCanonicalStoredJobRecord["canonicalJob"]["rendererProfile"],
): boolean {
  return (
    a.resolution === b.resolution &&
    a.format === b.format &&
    a.fps === b.fps &&
    a.quality === b.quality
  );
}

export function alreadyPromotedAuthorityMatches(
  current: HeadlessCanonicalStoredJobRecord,
  input: HeadlessPromoteProvisionalInput,
): boolean {
  const coherent = validateHeadlessRenderJobCoherence(
    input.canonicalJob,
    input.canonicalRequest,
  );
  if (!coherent.ok) return false;
  if (current.ownerId !== input.ownerId) return false;
  if (current.projectId !== coherent.job.ownership.projectId) return false;
  if (current.operationId !== input.expectedOperationId) return false;
  if (
    current.canonicalRequest.requestFingerprint !==
    coherent.request.requestFingerprint
  ) {
    return false;
  }
  if (
    current.canonicalJob.requestFingerprint !==
      coherent.job.requestFingerprint ||
    current.canonicalJob.manifestFingerprint !==
      coherent.job.manifestFingerprint ||
    current.canonicalJob.assetBundleFingerprint !==
      coherent.job.assetBundleFingerprint ||
    current.canonicalJob.rendererBuildId !== coherent.job.rendererBuildId ||
    !profilesMatch(
      {
        resolution: current.canonicalJob.rendererProfile.resolution,
        format: current.canonicalJob.rendererProfile.format,
        fps: current.canonicalJob.rendererProfile.fps,
        quality: current.canonicalJob.rendererProfile.quality,
      },
      coherent.job.rendererProfile,
    )
  ) {
    return false;
  }
  return true;
}
