/**
 * Deterministic in-memory owned-object metadata store — verification/QA only.
 * Do NOT export from the production control-plane barrel.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { validateHeadlessOwnedObjectRecord } from "../services/validate-owned-object-record";
import { cpFail, cpOk } from "../types/control-plane.types";
import {
  HEADLESS_OWNED_OBJECT_RECORD_VERSION,
  type HeadlessOwnedObjectRecordV1,
  type HeadlessStagingOwnedObjectRecordV1,
} from "../types/owned-object-record";
import type {
  HeadlessCreateStagingOwnedObjectInput,
  HeadlessFinalizeStagingOwnedObjectInput,
  HeadlessOwnedObjectStorePort,
  HeadlessStoredOwnedObject,
} from "../ports/owned-object-store.port";

type Entry = {
  record: HeadlessOwnedObjectRecordV1;
  storeVersion: number;
};

function detach(entry: Entry): HeadlessStoredOwnedObject {
  return deepFreezeHeadlessValue({
    record: entry.record,
    storeVersion: entry.storeVersion,
  });
}

export class MemoryHeadlessOwnedObjectStoreAdapter
  implements HeadlessOwnedObjectStorePort
{
  private readonly byId = new Map<string, Entry>();

  async createStagingRecord(input: HeadlessCreateStagingOwnedObjectInput) {
    const existingById = this.byId.get(input.objectId);
    if (existingById) {
      const r = existingById.record;
      if (
        r.stage === "staging" &&
        r.objectId === input.objectId &&
        r.ownerId === input.ownerId &&
        r.projectId === input.projectId &&
        r.jobId === input.jobId &&
        r.operationId === input.operationId &&
        r.purpose === input.purpose &&
        r.slotKey === input.slotKey &&
        r.storeId === input.storeId &&
        r.objectKey === input.objectKey &&
        r.expectedContentDigestClaim === input.expectedContentDigestClaim &&
        r.expectedByteLength === input.expectedByteLength &&
        r.expectedMimeType === input.expectedMimeType
      ) {
        return cpOk(detach(existingById));
      }
      return cpFail(
        "IDEMPOTENCY_CONFLICT",
        "Owned object identity already exists.",
      );
    }
    for (const entry of this.byId.values()) {
      if (
        entry.record.storeId === input.storeId &&
        entry.record.objectKey === input.objectKey
      ) {
        const r = entry.record;
        if (
          r.stage === "staging" &&
          r.ownerId === input.ownerId &&
          r.projectId === input.projectId &&
          r.jobId === input.jobId &&
          r.operationId === input.operationId &&
          r.purpose === input.purpose &&
          r.expectedContentDigestClaim === input.expectedContentDigestClaim &&
          r.expectedByteLength === input.expectedByteLength &&
          r.expectedMimeType === input.expectedMimeType
        ) {
          return cpOk(detach(entry));
        }
        return cpFail(
          "IDEMPOTENCY_CONFLICT",
          "Owned object storage identity already exists.",
        );
      }
    }

    const staging: HeadlessStagingOwnedObjectRecordV1 = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: input.objectId,
      ownerId: input.ownerId,
      projectId: input.projectId,
      jobId: input.jobId,
      operationId: input.operationId,
      purpose: input.purpose,
      slotKey: input.slotKey,
      provider: "r2",
      storeId: input.storeId,
      objectKey: input.objectKey,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
      stage: "staging",
      expectedContentDigestClaim: input.expectedContentDigestClaim,
      expectedByteLength: input.expectedByteLength,
      expectedMimeType: input.expectedMimeType,
      uploadCapabilityIssuedAtMs: input.uploadCapabilityIssuedAtMs,
      uploadCapabilityExpiresAtMs: input.uploadCapabilityExpiresAtMs,
      uploadedObservedAtMs: null,
      verificationState: "unclaimed",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: null,
      expiresAtMs: input.expiresAtMs,
      contentDigest: null,
      byteLength: null,
      mimeType: null,
      finalizedMetadata: null,
      terminalReason: null,
      cleanupScheduledAtMs: null,
    };

    const validated = validateHeadlessOwnedObjectRecord(staging);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", validated.message);
    }

    const entry: Entry = {
      record: validated.record,
      storeVersion: 1,
    };
    this.byId.set(input.objectId, entry);
    return cpOk(detach(entry));
  }

  async getByObjectIdAndOwner(input: {
    objectId: string;
    ownerId: string;
  }) {
    const entry = this.byId.get(input.objectId);
    if (!entry) return cpOk(null);
    if (entry.record.ownerId !== input.ownerId) {
      return cpFail("FORBIDDEN", "Owned object access denied.");
    }
    return cpOk(detach(entry));
  }

  async acquireVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    nowMs: number;
    expectedStoreVersion: number;
    claimLeaseMs?: number;
  }) {
    const claimLeaseMs = input.claimLeaseMs ?? 120_000;
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }
    if (entry.record.verificationState === "failed") {
      return cpFail("CLAIM_REJECTED", "Verification previously failed.");
    }
    if (entry.record.verificationState === "claimed") {
      const claimedAt = entry.record.verificationClaimedAtMs;
      const stale =
        typeof claimedAt === "number" &&
        Number.isSafeInteger(claimedAt) &&
        Number.isSafeInteger(claimLeaseMs) &&
        claimLeaseMs >= 1 &&
        input.nowMs - claimedAt >= claimLeaseMs;
      if (!stale) {
        return cpFail("CLAIM_REJECTED", "Verification claim already held.");
      }
      // Stale lease: reclaim with the new token.
    }

    const next: HeadlessStagingOwnedObjectRecordV1 = {
      ...entry.record,
      verificationState: "claimed",
      verificationClaimToken: input.claimToken,
      verificationClaimedAtMs: input.nowMs,
      updatedAtMs: input.nowMs,
    };
    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }

  async releaseVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
  }) {
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }
    if (
      entry.record.verificationState !== "claimed" ||
      entry.record.verificationClaimToken !== input.claimToken
    ) {
      return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
    }

    const next: HeadlessStagingOwnedObjectRecordV1 = {
      ...entry.record,
      verificationState: "unclaimed",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      updatedAtMs: input.nowMs,
    };
    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }

  async failVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
  }) {
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }
    if (
      entry.record.verificationState !== "claimed" ||
      entry.record.verificationClaimToken !== input.claimToken
    ) {
      return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
    }

    const next: HeadlessStagingOwnedObjectRecordV1 = {
      ...entry.record,
      verificationState: "failed",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      updatedAtMs: input.nowMs,
    };
    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }

  async finalizeStagingRecord(input: HeadlessFinalizeStagingOwnedObjectInput) {
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }
    if (
      entry.record.verificationState !== "claimed" ||
      entry.record.verificationClaimToken !== input.verificationClaimToken
    ) {
      return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
    }
    if (
      input.contentDigest !== entry.record.expectedContentDigestClaim ||
      input.byteLength !== entry.record.expectedByteLength ||
      input.mimeType !== entry.record.expectedMimeType
    ) {
      return cpFail(
        "OBJECT_INTEGRITY_FAILED",
        "Trusted facts do not match staging claims.",
      );
    }

    const next: HeadlessOwnedObjectRecordV1 = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: entry.record.objectId,
      ownerId: entry.record.ownerId,
      projectId: entry.record.projectId,
      jobId: entry.record.jobId,
      operationId: entry.record.operationId,
      purpose: entry.record.purpose,
      slotKey: entry.record.slotKey,
      provider: "r2",
      storeId: entry.record.storeId,
      objectKey: entry.record.objectKey,
      createdAtMs: entry.record.createdAtMs,
      updatedAtMs: input.nowMs,
      stage: "finalized",
      expectedContentDigestClaim: entry.record.expectedContentDigestClaim,
      expectedByteLength: entry.record.expectedByteLength,
      expectedMimeType: entry.record.expectedMimeType,
      uploadCapabilityIssuedAtMs: entry.record.uploadCapabilityIssuedAtMs,
      uploadCapabilityExpiresAtMs: entry.record.uploadCapabilityExpiresAtMs,
      uploadedObservedAtMs: entry.record.uploadedObservedAtMs,
      verificationState: "verified",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: input.verifiedAtMs,
      expiresAtMs: input.expiresAtMs,
      contentDigest: input.contentDigest,
      byteLength: input.byteLength,
      mimeType: input.mimeType,
      finalizedMetadata: {
        verifiedBy:
          input.verifiedBy === "trusted_worker_upload_stream"
            ? "trusted_worker_upload_stream"
            : "full_object_stream",
        sourceStage: "staging",
      },
      terminalReason: null,
      cleanupScheduledAtMs: null,
    };

    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }

  async markRejected(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    terminalReason: string;
    nowMs: number;
  }) {
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }

    const next: HeadlessOwnedObjectRecordV1 = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: entry.record.objectId,
      ownerId: entry.record.ownerId,
      projectId: entry.record.projectId,
      jobId: entry.record.jobId,
      operationId: entry.record.operationId,
      purpose: entry.record.purpose,
      slotKey: entry.record.slotKey,
      provider: "r2",
      storeId: entry.record.storeId,
      objectKey: entry.record.objectKey,
      createdAtMs: entry.record.createdAtMs,
      updatedAtMs: input.nowMs,
      stage: "rejected",
      expectedContentDigestClaim: entry.record.expectedContentDigestClaim,
      expectedByteLength: entry.record.expectedByteLength,
      expectedMimeType: entry.record.expectedMimeType,
      uploadCapabilityIssuedAtMs: entry.record.uploadCapabilityIssuedAtMs,
      uploadCapabilityExpiresAtMs: entry.record.uploadCapabilityExpiresAtMs,
      uploadedObservedAtMs: entry.record.uploadedObservedAtMs,
      verificationState: "failed",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: null,
      expiresAtMs: entry.record.expiresAtMs,
      contentDigest: null,
      byteLength: null,
      mimeType: null,
      finalizedMetadata: null,
      terminalReason: input.terminalReason,
      cleanupScheduledAtMs: null,
    };
    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }

  /** Test-only: force markCleanupPending to fail closed. */
  testingFailMarkCleanupPending = false;
  /** Test-only: force completeCleanup to fail closed. */
  testingFailCompleteCleanup = false;

  async markCleanupPending(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    terminalReason: string;
    cleanupScheduledAtMs: number;
    nowMs: number;
  }) {
    if (this.testingFailMarkCleanupPending) {
      return cpFail("INTERNAL_ERROR", "forced markCleanupPending failure");
    }
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (
      entry.record.stage !== "staging" &&
      entry.record.stage !== "rejected" &&
      entry.record.stage !== "finalized"
    ) {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object cannot enter cleanup.");
    }

    const base = entry.record;
    const next: HeadlessOwnedObjectRecordV1 = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: base.objectId,
      ownerId: base.ownerId,
      projectId: base.projectId,
      jobId: base.jobId,
      operationId: base.operationId,
      purpose: base.purpose,
      slotKey: base.slotKey,
      provider: "r2",
      storeId: base.storeId,
      objectKey: base.objectKey,
      createdAtMs: base.createdAtMs,
      updatedAtMs: input.nowMs,
      stage: "cleanup_pending",
      expectedContentDigestClaim: base.expectedContentDigestClaim,
      expectedByteLength: base.expectedByteLength,
      expectedMimeType: base.expectedMimeType,
      uploadCapabilityIssuedAtMs: base.uploadCapabilityIssuedAtMs,
      uploadCapabilityExpiresAtMs: base.uploadCapabilityExpiresAtMs,
      uploadedObservedAtMs: base.uploadedObservedAtMs,
      verificationState: "failed",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: null,
      expiresAtMs: base.expiresAtMs,
      contentDigest: null,
      byteLength: null,
      mimeType: null,
      finalizedMetadata: null,
      terminalReason: input.terminalReason,
      cleanupScheduledAtMs: input.cleanupScheduledAtMs,
    };
    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }

  async listByJobIdAndOwner(input: { jobId: string; ownerId: string }) {
    const out: HeadlessStoredOwnedObject[] = [];
    for (const entry of this.byId.values()) {
      if (
        entry.record.jobId === input.jobId &&
        entry.record.ownerId === input.ownerId
      ) {
        out.push(detach(entry));
      }
    }
    out.sort((a, b) =>
      a.record.objectId.localeCompare(b.record.objectId),
    );
    return cpOk(Object.freeze(out.slice()));
  }

  async completeCleanup(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    nowMs: number;
  }) {
    void input.nowMs;
    if (this.testingFailCompleteCleanup) {
      return cpFail("INTERNAL_ERROR", "forced completeCleanup failure");
    }
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "cleanup_pending") {
      return cpFail(
        "TERMINAL_IMMUTABLE",
        "Owned object is not cleanup_pending.",
      );
    }
    this.byId.delete(input.objectId);
    return cpOk(true as const);
  }

  async listVerifierCandidates(input: {
    ownerId?: string;
    limit: number;
    nowMs: number;
  }) {
    void input.nowMs;
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      return cpFail("HOSTILE_INPUT", "Verifier candidate limit rejected.");
    }
    const out: HeadlessStoredOwnedObject[] = [];
    for (const entry of this.byId.values()) {
      if (entry.record.stage !== "staging") continue;
      if (input.ownerId != null && entry.record.ownerId !== input.ownerId) {
        continue;
      }
      const uploaded = entry.record.uploadedObservedAtMs != null;
      const eligibleState =
        entry.record.verificationState === "unclaimed" ||
        entry.record.verificationState === "failed";
      if (!uploaded && !eligibleState) continue;
      out.push(detach(entry));
    }
    out.sort((a, b) =>
      a.record.objectId.localeCompare(b.record.objectId),
    );
    return cpOk(Object.freeze(out.slice(0, input.limit)));
  }

  async listCleanupCandidates(input: { limit: number; nowMs: number }) {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      return cpFail("HOSTILE_INPUT", "Cleanup candidate limit rejected.");
    }
    const out: HeadlessStoredOwnedObject[] = [];
    for (const entry of this.byId.values()) {
      const cleanupPending = entry.record.stage === "cleanup_pending";
      const expiredStaging =
        entry.record.stage === "staging" &&
        entry.record.expiresAtMs != null &&
        entry.record.expiresAtMs <= input.nowMs;
      if (!cleanupPending && !expiredStaging) continue;
      out.push(detach(entry));
    }
    out.sort((a, b) =>
      a.record.objectId.localeCompare(b.record.objectId),
    );
    return cpOk(Object.freeze(out.slice(0, input.limit)));
  }

  async markUploadedObserved(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    uploadedObservedAtMs: number;
    nowMs: number;
  }) {
    const entry = this.byId.get(input.objectId);
    if (!entry || entry.record.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (entry.storeVersion !== input.expectedStoreVersion) {
      return cpFail("STALE_TRANSITION", "Owned object store version stale.");
    }
    if (entry.record.stage !== "staging") {
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }
    const next: HeadlessStagingOwnedObjectRecordV1 = {
      ...entry.record,
      uploadedObservedAtMs: input.uploadedObservedAtMs,
      updatedAtMs: input.nowMs,
    };
    const validated = validateHeadlessOwnedObjectRecord(next);
    if (!validated.ok) return cpFail("HOSTILE_INPUT", validated.message);
    entry.record = validated.record;
    entry.storeVersion += 1;
    return cpOk(detach(entry));
  }
}
