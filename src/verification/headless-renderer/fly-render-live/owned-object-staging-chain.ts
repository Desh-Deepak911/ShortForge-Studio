/**
 * Sprint 11E Phase 2E.2D.8C.1 — attributed owned-object staging record chain.
 * Stops before R2 upload, reconciliation, promotion, outbox, or enqueue.
 */

import { randomUUID } from "node:crypto";

import {
  deriveHeadlessR2ObjectKey,
  validateHeadlessOwnedObjectRecord,
  HEADLESS_OWNED_OBJECT_RECORD_VERSION,
  type HeadlessOwnedObjectPurpose,
} from "@/features/headless-renderer/control-plane";
import { isCanonicalHeadlessSourceSlotKey } from "@/features/headless-renderer/domain/headless-source-coverage";
import {
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
  parseHeadlessSourceSlotKey,
} from "@/features/headless-renderer/domain/headless-source-slot-key";
import { HEADLESS_CONTENT_DIGEST_RE } from "@/features/headless-renderer/domain/headless-stable-hash";

import type { FlyRenderJobCreateStagingPayload } from "./job-create-fixture-identity";
import {
  classifyStagingObjectPurpose,
  classifyStagingSlotKeyClass,
  classifyStagingSlotKeyLengthClass,
  storeClassForPurpose,
  buildOwnedObjectStagingAttributionSnapshot,
  substageToReasonId,
  type FlyRenderOwnedObjectStagingAttributionSnapshot,
  type OwnedObjectStagingReasonId,
  type OwnedObjectStagingSubstageId,
} from "./owned-object-staging-attribution";
import {
  deriveStagingKey,
  trackObjectId,
  trackR2Locator,
} from "../r2-live/live-fixtures";
import type { R2LiveMatrixContext } from "../r2-live/types";

export type OwnedObjectStagingSubstageResult = {
  readonly substage: OwnedObjectStagingSubstageId;
  readonly status: "ok" | "failed" | "skipped";
  readonly reasonId?: OwnedObjectStagingReasonId;
};

export type StagedOwnedObjectRecord = {
  readonly objectId: string;
  readonly objectKey: string;
  readonly storeId: "assets" | "artifacts";
  readonly digest: string;
  readonly mime: string;
  readonly expectedByteLength: number;
  readonly purpose: HeadlessOwnedObjectPurpose;
  readonly slotKey: string | null;
  readonly resultKind: "created" | "idempotent_replay";
};

export type RunOwnedObjectStagingRecordChainSuccess = {
  readonly ok: true;
  readonly substages: readonly OwnedObjectStagingSubstageResult[];
  readonly staged: readonly StagedOwnedObjectRecord[];
};

export type RunOwnedObjectStagingRecordChainFailure = {
  readonly ok: false;
  readonly failureSubstage: OwnedObjectStagingSubstageId;
  readonly failureReasonId: OwnedObjectStagingReasonId;
  readonly substages: readonly OwnedObjectStagingSubstageResult[];
  readonly stagingAttribution: FlyRenderOwnedObjectStagingAttributionSnapshot;
};

export type RunOwnedObjectStagingRecordChainResult =
  | RunOwnedObjectStagingRecordChainSuccess
  | RunOwnedObjectStagingRecordChainFailure;

function substageOk(
  substage: OwnedObjectStagingSubstageId,
): OwnedObjectStagingSubstageResult {
  return { substage, status: "ok" };
}

function substageFail(
  substage: OwnedObjectStagingSubstageId,
  reasonId?: OwnedObjectStagingReasonId,
): OwnedObjectStagingSubstageResult {
  return {
    substage,
    status: "failed",
    reasonId: reasonId ?? substageToReasonId(substage),
  };
}

function failChain(input: {
  readonly substages: OwnedObjectStagingSubstageResult[];
  readonly failureSubstage: OwnedObjectStagingSubstageId;
  readonly payload: FlyRenderJobCreateStagingPayload;
  readonly storeId?: "assets" | "artifacts";
  readonly safeControlPlaneCode?: string;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly slotMalformed?: boolean;
  readonly resultKind?: "failed";
}): RunOwnedObjectStagingRecordChainFailure {
  const purposeClass =
    classifyStagingObjectPurpose(input.payload.purpose) ?? "manifest";
  const attribution = buildOwnedObjectStagingAttributionSnapshot({
    stagingSubstage: input.failureSubstage,
    objectPurposeClass: purposeClass,
    slotKeyClass: classifyStagingSlotKeyClass(input.payload.slotKey),
    slotKeyLengthClass: classifyStagingSlotKeyLengthClass({
      slotKey: input.payload.slotKey,
      malformed: input.slotMalformed,
    }),
    storeClass:
      input.storeId != null
        ? input.storeId
        : storeClassForPurpose(input.payload.purpose),
    resultKind: input.resultKind ?? "failed",
    safeControlPlaneCode: input.safeControlPlaneCode as never,
    allowlistedSqlState: input.allowlistedSqlState,
    allowlistedConstraint: input.allowlistedConstraint,
  });
  input.substages.push(
    substageFail(
      input.failureSubstage,
      substageToReasonId(input.failureSubstage),
    ),
  );
  return {
    ok: false,
    failureSubstage: input.failureSubstage,
    failureReasonId: substageToReasonId(input.failureSubstage),
    substages: Object.freeze([...input.substages]),
    stagingAttribution: attribution,
  };
}

function validateStagingInput(
  payload: FlyRenderJobCreateStagingPayload,
): { readonly ok: true } | { readonly ok: false; readonly malformed?: boolean } {
  const purpose = classifyStagingObjectPurpose(payload.purpose);
  if (purpose == null) return { ok: false, malformed: true };
  if (!(payload.bytes instanceof Uint8Array) || payload.bytes.byteLength < 0) {
    return { ok: false };
  }
  if (
    typeof payload.digest !== "string" ||
    !HEADLESS_CONTENT_DIGEST_RE.test(payload.digest)
  ) {
    return { ok: false };
  }
  if (
    typeof payload.mime !== "string" ||
    payload.mime.length === 0 ||
    payload.mime.length > 256
  ) {
    return { ok: false };
  }
  if (
    !Number.isSafeInteger(payload.byteLength) ||
    payload.byteLength !== payload.bytes.byteLength
  ) {
    return { ok: false };
  }
  return { ok: true };
}

function validateSlotKey(
  slotKey: string | null,
): { readonly ok: true } | { readonly ok: false; readonly malformed: boolean } {
  if (slotKey == null || slotKey === "") return { ok: true };
  if (slotKey.length > HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH) {
    return { ok: false, malformed: false };
  }
  if (!slotKey.startsWith("hslot:v2:")) {
    return { ok: false, malformed: true };
  }
  if (!isCanonicalHeadlessSourceSlotKey(slotKey)) {
    return { ok: false, malformed: true };
  }
  const parsed = parseHeadlessSourceSlotKey(slotKey);
  if (!parsed.ok) return { ok: false, malformed: true };
  return { ok: true };
}

function purposeStoreCoherent(
  purpose: HeadlessOwnedObjectPurpose,
  storeId: "assets" | "artifacts",
): boolean {
  if (purpose === "artifact") return storeId === "artifacts";
  return storeId === "assets";
}

function stagingRecordCoherent(input: {
  readonly stored: {
    readonly record: {
      readonly objectId: string;
      readonly ownerId: string;
      readonly projectId: string;
      readonly jobId: string;
      readonly operationId: string;
      readonly purpose: HeadlessOwnedObjectPurpose;
      readonly slotKey: string | null;
      readonly storeId: "assets" | "artifacts";
      readonly objectKey: string;
      readonly expectedContentDigestClaim: string;
      readonly expectedByteLength: number;
      readonly expectedMimeType: string;
      readonly stage: string;
    };
  };
  readonly expected: {
    readonly objectId: string;
    readonly ownerId: string;
    readonly projectId: string;
    readonly jobId: string;
    readonly operationId: string;
    readonly purpose: HeadlessOwnedObjectPurpose;
    readonly slotKey: string | null;
    readonly storeId: "assets" | "artifacts";
    readonly objectKey: string;
    readonly expectedContentDigestClaim: string;
    readonly expectedByteLength: number;
    readonly expectedMimeType: string;
  };
}): boolean {
  const r = input.stored.record;
  const e = input.expected;
  return (
    r.objectId === e.objectId &&
    r.ownerId === e.ownerId &&
    r.projectId === e.projectId &&
    r.jobId === e.jobId &&
    r.operationId === e.operationId &&
    r.purpose === e.purpose &&
    r.slotKey === e.slotKey &&
    r.storeId === e.storeId &&
    r.objectKey === e.objectKey &&
    r.expectedContentDigestClaim === e.expectedContentDigestClaim &&
    r.expectedByteLength === e.expectedByteLength &&
    r.expectedMimeType === e.expectedMimeType &&
    r.stage === "staging"
  );
}

/**
 * Stage owned-object records in canonical fixture order with immutable substages.
 * Does not upload bytes, finalize, reconcile, promote, or enqueue.
 */
export async function runOwnedObjectStagingRecordChain(input: {
  readonly ctx: R2LiveMatrixContext;
  readonly payloads: readonly FlyRenderJobCreateStagingPayload[];
  readonly jobId: string;
  readonly operationId: string;
}): Promise<RunOwnedObjectStagingRecordChainResult> {
  const substages: OwnedObjectStagingSubstageResult[] = [];
  const staged: StagedOwnedObjectRecord[] = [];

  for (const payload of input.payloads) {
    const inputValid = validateStagingInput(payload);
    if (!inputValid.ok) {
      return failChain({
        substages,
        failureSubstage: "staging_input_construction",
        payload,
        slotMalformed: inputValid.malformed,
      });
    }
    substages.push(substageOk("staging_input_construction"));

    const expectedStore = storeClassForPurpose(payload.purpose);
    const purposeClass = classifyStagingObjectPurpose(payload.purpose);
    if (purposeClass == null) {
      return failChain({
        substages,
        failureSubstage: "purpose_store_authority",
        payload,
        storeId: expectedStore,
      });
    }
    substages.push(substageOk("purpose_store_authority"));

    const slotValid = validateSlotKey(payload.slotKey);
    if (!slotValid.ok) {
      return failChain({
        substages,
        failureSubstage: "slot_key_validation",
        payload,
        storeId: expectedStore,
        slotMalformed: slotValid.malformed,
      });
    }
    substages.push(substageOk("slot_key_validation"));

    const key = deriveStagingKey({
      ownerId: input.ctx.ownerId,
      projectId: input.ctx.projectId,
      jobId: input.jobId,
      operationId: input.operationId,
      purpose: payload.purpose,
      slotKey: payload.slotKey,
    });
    if (!key.ok) {
      return failChain({
        substages,
        failureSubstage: "object_key_derivation",
        payload,
        storeId: expectedStore,
      });
    }
    substages.push(substageOk("object_key_derivation"));

    if (!purposeStoreCoherent(payload.purpose, key.storeId)) {
      return failChain({
        substages,
        failureSubstage: "purpose_store_authority",
        payload,
        storeId: key.storeId,
      });
    }

    const objectId = randomUUID();
    const createInput = {
      objectId,
      ownerId: input.ctx.ownerId,
      projectId: input.ctx.projectId,
      jobId: input.jobId,
      operationId: input.operationId,
      purpose: payload.purpose,
      slotKey: payload.slotKey,
      storeId: key.storeId,
      objectKey: key.objectKey,
      expectedContentDigestClaim: payload.digest,
      expectedByteLength: payload.byteLength,
      expectedMimeType: payload.mime,
      uploadCapabilityIssuedAtMs: input.ctx.nowMs,
      uploadCapabilityExpiresAtMs: input.ctx.nowMs + 600_000,
      expiresAtMs: input.ctx.nowMs + 3_600_000,
      createdAtMs: input.ctx.nowMs,
    };

    const stagingRecord = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId,
      ownerId: input.ctx.ownerId,
      projectId: input.ctx.projectId,
      jobId: input.jobId,
      operationId: input.operationId,
      purpose: payload.purpose,
      slotKey: payload.slotKey,
      provider: "r2" as const,
      storeId: key.storeId,
      objectKey: key.objectKey,
      createdAtMs: input.ctx.nowMs,
      updatedAtMs: input.ctx.nowMs,
      stage: "staging" as const,
      expectedContentDigestClaim: payload.digest,
      expectedByteLength: payload.byteLength,
      expectedMimeType: payload.mime,
      uploadCapabilityIssuedAtMs: input.ctx.nowMs,
      uploadCapabilityExpiresAtMs: input.ctx.nowMs + 600_000,
      uploadedObservedAtMs: null,
      verificationState: "unclaimed" as const,
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: null,
      expiresAtMs: input.ctx.nowMs + 3_600_000,
      contentDigest: null,
      byteLength: null,
      mimeType: null,
      finalizedMetadata: null,
      terminalReason: null,
      cleanupScheduledAtMs: null,
    };
    const recordValidated = validateHeadlessOwnedObjectRecord(stagingRecord);
    if (!recordValidated.ok) {
      return failChain({
        substages,
        failureSubstage: "staging_record_validation",
        payload,
        storeId: key.storeId,
        safeControlPlaneCode: "HOSTILE_INPUT",
      });
    }
    substages.push(substageOk("staging_record_validation"));

    let insertResultKind: "created" | "idempotent_replay" = "created";
    const created = await input.ctx.ownedObjectStore.createStagingRecord(
      createInput,
    );
    if (!created.ok) {
      const code = created.issues[0]?.code;
      const substage: OwnedObjectStagingSubstageId =
        code === "JOB_STORE_COHERENCE_REJECTED"
          ? "neon_staging_returning_map"
          : "neon_staging_insert";
      if (code === "IDEMPOTENCY_CONFLICT") {
        return failChain({
          substages,
          failureSubstage: "neon_staging_insert",
          payload,
          storeId: key.storeId,
          safeControlPlaneCode: code,
        });
      }
      return failChain({
        substages,
        failureSubstage: substage,
        payload,
        storeId: key.storeId,
        safeControlPlaneCode: code,
      });
    }
    substages.push(substageOk("neon_staging_insert"));
    substages.push(substageOk("neon_staging_returning_map"));

    insertResultKind =
      created.value.record.objectId === objectId ? "created" : "idempotent_replay";

    trackObjectId(input.ctx, objectId);
    trackR2Locator(input.ctx, {
      storeId: key.storeId,
      objectKey: key.objectKey,
    });

    const reread = await input.ctx.ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: input.ctx.ownerId,
    });
    if (!reread.ok || reread.value == null) {
      return failChain({
        substages,
        failureSubstage: "neon_staging_reread",
        payload,
        storeId: key.storeId,
        safeControlPlaneCode: reread.ok ? undefined : reread.issues[0]?.code,
      });
    }
    substages.push(substageOk("neon_staging_reread"));

    const expected = {
      objectId,
      ownerId: input.ctx.ownerId,
      projectId: input.ctx.projectId,
      jobId: input.jobId,
      operationId: input.operationId,
      purpose: payload.purpose,
      slotKey: payload.slotKey,
      storeId: key.storeId,
      objectKey: key.objectKey,
      expectedContentDigestClaim: payload.digest,
      expectedByteLength: payload.byteLength,
      expectedMimeType: payload.mime,
    };
    if (!stagingRecordCoherent({ stored: reread.value, expected })) {
      return failChain({
        substages,
        failureSubstage: "staging_coherence_assertion",
        payload,
        storeId: key.storeId,
      });
    }
    substages.push(substageOk("staging_coherence_assertion"));

    staged.push({
      objectId,
      objectKey: key.objectKey,
      storeId: key.storeId,
      digest: payload.digest,
      mime: payload.mime,
      expectedByteLength: payload.byteLength,
      purpose: payload.purpose,
      slotKey: payload.slotKey,
      resultKind: insertResultKind,
    });
  }

  return {
    ok: true,
    substages: Object.freeze(substages),
    staged: Object.freeze(staged),
  };
}

/** Validate production R2 deriver accepts identities (attribution probe only). */
export function assertProductionR2DeriverAcceptsStagingIdentities(input: {
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly purpose: HeadlessOwnedObjectPurpose;
  readonly slotKey: string | null;
}): boolean {
  const derived = deriveHeadlessR2ObjectKey({
    environmentNamespace: "test",
    objectNamespace: "staging",
    ownerId: input.ownerId,
    projectId: input.projectId,
    jobId: input.jobId,
    operationId: input.operationId,
    purpose: input.purpose,
    slotKey:
      input.slotKey != null && input.slotKey.length > 128 ? null : input.slotKey,
    nonce: "a".repeat(32),
  });
  return derived.ok;
}
