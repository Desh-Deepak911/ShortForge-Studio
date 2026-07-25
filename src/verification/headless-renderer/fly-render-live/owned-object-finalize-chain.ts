/**
 * Sprint 11E Phase 2E.2D.8E — attributed owned-object finalize chain.
 * Stages, uploads, observes revision, and finalizes with immutable substages.
 * Stops before reconciliation, promotion, outbox, or enqueue.
 */

import { verifyAndFinalizeR2OwnedObject } from "@/features/headless-renderer/control-plane";
import type {
  HeadlessFinalizeStagingOwnedObjectInput,
  HeadlessOwnedObjectStorePort,
  HeadlessStoredOwnedObject,
} from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessControlPlaneResult } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { cpFail } from "@/features/headless-renderer/control-plane/types/control-plane.types";

import type { FlyRenderJobCreateStagingPayload } from "./job-create-fixture-identity";
import {
  buildOwnedObjectFinalizeAttributionSnapshot,
  classifyDurableObjectStageClass,
  mapVerifyFailureToFinalizeSubstage,
  purposeAttributionFromPayload,
  substageToFinalizeReasonId,
  type FlyRenderOwnedObjectFinalizeAttributionSnapshot,
  type OwnedObjectFinalizeReasonId,
  type OwnedObjectFinalizeSubstageId,
  type R2RevisionOutcomeClass,
} from "./owned-object-finalize-attribution";
import type { StagedOwnedObjectRecord } from "./owned-object-staging-chain";
import {
  issueCode,
  putObjectBytes,
  trackObjectId,
} from "../r2-live/live-fixtures";
import type { R2LiveMatrixContext } from "../r2-live/types";

export type OwnedObjectFinalizeSubstageResult = {
  readonly substage: OwnedObjectFinalizeSubstageId;
  readonly status: "ok" | "failed" | "skipped";
  readonly reasonId?: OwnedObjectFinalizeReasonId;
};

export type RunOwnedObjectFinalizeChainSuccess = {
  readonly ok: true;
  readonly substages: readonly OwnedObjectFinalizeSubstageResult[];
  readonly finalizedObjectIds: readonly string[];
  readonly finalizeAttribution: FlyRenderOwnedObjectFinalizeAttributionSnapshot;
};

export type RunOwnedObjectFinalizeChainFailure = {
  readonly ok: false;
  readonly failureSubstage: OwnedObjectFinalizeSubstageId;
  readonly failureReasonId: OwnedObjectFinalizeReasonId;
  readonly substages: readonly OwnedObjectFinalizeSubstageResult[];
  readonly finalizeAttribution: FlyRenderOwnedObjectFinalizeAttributionSnapshot;
};

export type RunOwnedObjectFinalizeChainResult =
  | RunOwnedObjectFinalizeChainSuccess
  | RunOwnedObjectFinalizeChainFailure;

export type FinalizeAttributionStoreHooks = {
  readonly failConnect?: boolean;
  readonly failTransaction?: boolean;
  readonly failUpdate?: boolean;
  readonly forceReturningMismatch?: boolean;
  readonly forceRereadMismatch?: boolean;
  readonly forceCoherenceMismatch?: boolean;
  readonly forcePostFinalizeRereadMismatch?: boolean;
  readonly staleStoreVersion?: boolean;
};

function substageOk(
  substage: OwnedObjectFinalizeSubstageId,
): OwnedObjectFinalizeSubstageResult {
  return { substage, status: "ok" };
}

function substageFail(
  substage: OwnedObjectFinalizeSubstageId,
  reasonId?: OwnedObjectFinalizeReasonId,
): OwnedObjectFinalizeSubstageResult {
  return {
    substage,
    status: "failed",
    reasonId: reasonId ?? substageToFinalizeReasonId(substage),
  };
}

function failChain(input: {
  readonly substages: OwnedObjectFinalizeSubstageResult[];
  readonly failureSubstage: OwnedObjectFinalizeSubstageId;
  readonly payload: FlyRenderJobCreateStagingPayload;
  readonly staged?: StagedOwnedObjectRecord;
  readonly safeControlPlaneCode?: string;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly storeVersionBefore?: number;
  readonly storeVersionAfter?: number;
  readonly durableObjectStageClass?: ReturnType<
    typeof classifyDurableObjectStageClass
  >;
  readonly r2RevisionOutcomeClass?: R2RevisionOutcomeClass;
  readonly resultKind?: "failed";
}): RunOwnedObjectFinalizeChainFailure {
  const purpose = purposeAttributionFromPayload({
    purpose: input.payload.purpose,
    slotKey: input.payload.slotKey,
    storeId: input.staged?.storeId,
  });
  const attribution = buildOwnedObjectFinalizeAttributionSnapshot({
    finalizeSubstage: input.failureSubstage,
    ...purpose,
    resultKind: input.resultKind ?? "failed",
    safeControlPlaneCode: input.safeControlPlaneCode as never,
    allowlistedSqlState: input.allowlistedSqlState,
    allowlistedConstraint: input.allowlistedConstraint,
    storeVersionBefore: input.storeVersionBefore,
    storeVersionAfter: input.storeVersionAfter,
    durableObjectStageClass: input.durableObjectStageClass,
    r2RevisionOutcomeClass: input.r2RevisionOutcomeClass,
  });
  input.substages.push(
    substageFail(
      input.failureSubstage,
      substageToFinalizeReasonId(input.failureSubstage),
    ),
  );
  return {
    ok: false,
    failureSubstage: input.failureSubstage,
    failureReasonId: substageToFinalizeReasonId(input.failureSubstage),
    substages: Object.freeze([...input.substages]),
    finalizeAttribution: attribution,
  };
}

function finalizedCoherent(
  stored: HeadlessStoredOwnedObject,
  expectedDigest: string,
): boolean {
  const r = stored.record;
  if (r.stage !== "finalized") return false;
  if (r.contentDigest !== expectedDigest) return false;
  if (r.finalizedMetadata == null) return false;
  if (r.verificationState !== "verified") return false;
  return true;
}

/**
 * Instrument owned-object store to attribute neon finalize substages.
 */
export function wrapOwnedObjectStoreForFinalizeAttribution(
  inner: HeadlessOwnedObjectStorePort,
  hooks?: FinalizeAttributionStoreHooks,
): {
  readonly store: HeadlessOwnedObjectStorePort;
  readonly getLastNeonSubstage: () => OwnedObjectFinalizeSubstageId | null;
} {
  let lastNeonSubstage: OwnedObjectFinalizeSubstageId | null = null;

  const delegate = <K extends keyof HeadlessOwnedObjectStorePort>(
    method: K,
  ): HeadlessOwnedObjectStorePort[K] => {
    const fn = inner[method];
    if (typeof fn !== "function") {
      return fn;
    }
    return ((...args: never[]) =>
      (fn as (...a: never[]) => unknown).apply(inner, args)) as HeadlessOwnedObjectStorePort[K];
  };

  const store: HeadlessOwnedObjectStorePort = {
    createStagingRecord: delegate("createStagingRecord"),
    getByObjectIdAndOwner: async (input) => {
      if (hooks?.forceRereadMismatch) {
        return cpFail("JOB_NOT_FOUND", "Owned object not found.");
      }
      return inner.getByObjectIdAndOwner(input);
    },
    acquireVerificationClaim: delegate("acquireVerificationClaim"),
    releaseVerificationClaim: delegate("releaseVerificationClaim"),
    failVerificationClaim: delegate("failVerificationClaim"),
    finalizeStagingRecord: async (
      input: HeadlessFinalizeStagingOwnedObjectInput,
    ) => {
      lastNeonSubstage = "neon_finalize_connect";
      if (hooks?.failConnect) {
        return cpFail(
          "DATABASE_UNAVAILABLE",
          "Durable database is temporarily unavailable.",
        );
      }
      lastNeonSubstage = "neon_finalize_transaction";
      if (hooks?.failTransaction) {
        return cpFail(
          "DATABASE_UNAVAILABLE",
          "Durable database is temporarily unavailable.",
        );
      }
      if (hooks?.staleStoreVersion) {
        lastNeonSubstage = "neon_finalize_update";
        return cpFail("STALE_TRANSITION", "Owned object store version stale.");
      }
      if (hooks?.forceReturningMismatch) {
        lastNeonSubstage = "neon_finalize_returning_map";
        return cpFail(
          "JOB_STORE_COHERENCE_REJECTED",
          "Persisted database row failed coherence checks.",
        );
      }
      lastNeonSubstage = "neon_finalize_update";
      const result = await inner.finalizeStagingRecord(input);
      if (!result.ok) {
        const code = result.issues[0]?.code;
        lastNeonSubstage =
          code === "STALE_TRANSITION"
            ? "neon_finalize_update"
            : code === "JOB_STORE_COHERENCE_REJECTED"
              ? "neon_finalize_returning_map"
              : code === "DATABASE_UNAVAILABLE"
                ? "neon_finalize_transaction"
                : "neon_finalize_update";
        return result;
      }
      lastNeonSubstage = "neon_finalize_returning_map";
      return result;
    },
    markRejected: delegate("markRejected"),
    markCleanupPending: delegate("markCleanupPending"),
    completeCleanup: delegate("completeCleanup"),
    listVerifierCandidates: delegate("listVerifierCandidates"),
    listCleanupCandidates: delegate("listCleanupCandidates"),
    listByJobIdAndOwner: delegate("listByJobIdAndOwner"),
    ...(inner.markUploadedObserved != null
      ? { markUploadedObserved: delegate("markUploadedObserved") }
      : {}),
  };

  return {
    store,
    getLastNeonSubstage: () => lastNeonSubstage,
  };
}

/**
 * Upload, observe revision, and finalize staged owned objects in canonical order.
 */
export async function runOwnedObjectFinalizeChain(input: {
  readonly ctx: R2LiveMatrixContext;
  readonly staged: readonly StagedOwnedObjectRecord[];
  readonly payloads: readonly FlyRenderJobCreateStagingPayload[];
  readonly storeHooks?: FinalizeAttributionStoreHooks;
}): Promise<RunOwnedObjectFinalizeChainResult> {
  const substages: OwnedObjectFinalizeSubstageResult[] = [];
  const finalizedObjectIds: string[] = [];
  let lastSuccessAttribution: FlyRenderOwnedObjectFinalizeAttributionSnapshot | null =
    null;

  if (input.staged.length !== input.payloads.length) {
    const payload = input.payloads[0] ?? {
      purpose: "manifest",
      slotKey: null,
      bytes: new Uint8Array(),
      digest: `sha256:${"0".repeat(64)}`,
      mime: "application/json",
      byteLength: 0,
    };
    return failChain({
      substages,
      failureSubstage: "finalize_input_construction",
      payload,
    });
  }

  const wrapped = wrapOwnedObjectStoreForFinalizeAttribution(
    input.ctx.ownedObjectStore,
    input.storeHooks,
  );
  const verifyCtx = { ...input.ctx, ownedObjectStore: wrapped.store };

  for (let i = 0; i < input.payloads.length; i += 1) {
    const payload = input.payloads[i]!;
    const staged = input.staged[i]!;

    if (
      payload.byteLength !== staged.expectedByteLength ||
      payload.digest !== staged.digest ||
      payload.mime !== staged.mime ||
      payload.purpose !== staged.purpose
    ) {
      return failChain({
        substages,
        failureSubstage: "finalize_input_construction",
        payload,
        staged,
      });
    }
    substages.push(substageOk("finalize_input_construction"));

    const loaded = await wrapped.store.getByObjectIdAndOwner({
      objectId: staged.objectId,
      ownerId: input.ctx.ownerId,
    });
    if (!loaded.ok || loaded.value == null) {
      return failChain({
        substages,
        failureSubstage: "staging_record_reread",
        payload,
        staged,
        safeControlPlaneCode: loaded.ok ? "JOB_NOT_FOUND" : issueCode(loaded),
        durableObjectStageClass: loaded.ok
          ? "missing"
          : classifyDurableObjectStageClass(null),
      });
    }
    const storeVersionBefore = loaded.value.storeVersion;
    if (loaded.value.record.stage !== "staging") {
      if (loaded.value.record.stage === "finalized") {
        substages.push(substageOk("staging_record_reread"));
        substages.push(substageOk("r2_upload"));
        substages.push(substageOk("r2_revision_observation"));
        substages.push(substageOk("finalize_preflight"));
        substages.push(substageOk("neon_finalize_connect"));
        substages.push(substageOk("neon_finalize_transaction"));
        substages.push(substageOk("neon_finalize_update"));
        substages.push(substageOk("neon_finalize_returning_map"));
        substages.push(substageOk("neon_finalize_reread"));
        substages.push(substageOk("finalized_coherence_assertion"));
        trackObjectId(input.ctx, staged.objectId);
        finalizedObjectIds.push(staged.objectId);
        lastSuccessAttribution = buildOwnedObjectFinalizeAttributionSnapshot({
          finalizeSubstage: "finalized_coherence_assertion",
          ...purposeAttributionFromPayload({
            purpose: payload.purpose,
            slotKey: payload.slotKey,
            storeId: staged.storeId,
          }),
          resultKind: "idempotent_replay",
          durableObjectStageClass: "finalized",
          storeVersionBefore,
          storeVersionAfter: loaded.value.storeVersion,
        });
        continue;
      }
      return failChain({
        substages,
        failureSubstage: "staging_record_reread",
        payload,
        staged,
        safeControlPlaneCode: "TERMINAL_IMMUTABLE",
        durableObjectStageClass: classifyDurableObjectStageClass(
          loaded.value.record.stage,
        ),
      });
    }
    substages.push(substageOk("staging_record_reread"));

    const written = await putObjectBytes(verifyCtx, {
      storeId: staged.storeId,
      objectKey: staged.objectKey,
      bytes: payload.bytes,
      mime: payload.mime,
    });
    if (!written.ok) {
      return failChain({
        substages,
        failureSubstage: "r2_upload",
        payload,
        staged,
        safeControlPlaneCode: "OBJECT_INTEGRITY_FAILED",
      });
    }
    substages.push(substageOk("r2_upload"));

    let revisionOutcome: R2RevisionOutcomeClass = "not_observed";
    const meta = await input.ctx.io.readObjectMetadata(
      { storeId: staged.storeId, objectKey: staged.objectKey },
      input.ctx.ownerId,
    );
    if (!meta.ok) {
      return failChain({
        substages,
        failureSubstage: "r2_revision_observation",
        payload,
        staged,
        safeControlPlaneCode: issueCode(meta),
        r2RevisionOutcomeClass: "unavailable",
      });
    }
    if (
      meta.value.revisionAuthority === "unavailable" ||
      meta.value.providerRevisionId == null
    ) {
      return failChain({
        substages,
        failureSubstage: "r2_revision_observation",
        payload,
        staged,
        safeControlPlaneCode: "OBJECT_REVISION_UNAVAILABLE",
        r2RevisionOutcomeClass: "unavailable",
      });
    }
    revisionOutcome = "available";
    substages.push(substageOk("r2_revision_observation"));

    if (
      loaded.value.record.expectedContentDigestClaim !== payload.digest ||
      loaded.value.record.expectedByteLength !== payload.byteLength ||
      loaded.value.record.expectedMimeType !== payload.mime
    ) {
      return failChain({
        substages,
        failureSubstage: "finalize_preflight",
        payload,
        staged,
        safeControlPlaneCode: "OBJECT_INTEGRITY_FAILED",
        durableObjectStageClass: "staging",
      });
    }
    substages.push(substageOk("finalize_preflight"));

    const finalized = await verifyAndFinalizeR2OwnedObject({
      objectId: staged.objectId,
      ownerId: input.ctx.ownerId,
      nowMs: input.ctx.nowMs,
      store: wrapped.store,
      io: input.ctx.io,
    });

    if (!finalized.ok) {
      const code = issueCode(finalized);
      const neonSubstage =
        wrapped.getLastNeonSubstage() ??
        mapVerifyFailureToFinalizeSubstage({
          code,
          stagingRereadSucceeded: true,
          revisionObserved: revisionOutcome === "available",
        });
      return failChain({
        substages,
        failureSubstage: neonSubstage,
        payload,
        staged,
        safeControlPlaneCode: code,
        storeVersionBefore,
        storeVersionAfter: storeVersionBefore,
        durableObjectStageClass: "staging",
        r2RevisionOutcomeClass:
          code === "OBJECT_REVISION_MISMATCH" ? "mismatch" : revisionOutcome,
      });
    }

    substages.push(substageOk("neon_finalize_connect"));
    substages.push(substageOk("neon_finalize_transaction"));
    substages.push(substageOk("neon_finalize_update"));
    substages.push(substageOk("neon_finalize_returning_map"));

    const reread = await wrapped.store.getByObjectIdAndOwner({
      objectId: staged.objectId,
      ownerId: input.ctx.ownerId,
    });
    if (
      input.storeHooks?.forcePostFinalizeRereadMismatch === true ||
      !reread.ok ||
      reread.value == null
    ) {
      return failChain({
        substages,
        failureSubstage: "neon_finalize_reread",
        payload,
        staged,
        safeControlPlaneCode: reread.ok ? "JOB_NOT_FOUND" : issueCode(reread),
        storeVersionBefore,
        durableObjectStageClass: "missing",
      });
    }
    substages.push(substageOk("neon_finalize_reread"));

    if (
      input.storeHooks?.forceCoherenceMismatch === true ||
      !finalizedCoherent(reread.value, payload.digest)
    ) {
      return failChain({
        substages,
        failureSubstage: "finalized_coherence_assertion",
        payload,
        staged,
        safeControlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
        storeVersionBefore,
        storeVersionAfter: reread.value.storeVersion,
        durableObjectStageClass: classifyDurableObjectStageClass(
          reread.value.record.stage,
        ),
      });
    }
    substages.push(substageOk("finalized_coherence_assertion"));

    trackObjectId(input.ctx, staged.objectId);
    finalizedObjectIds.push(staged.objectId);
    lastSuccessAttribution = buildOwnedObjectFinalizeAttributionSnapshot({
      finalizeSubstage: "finalized_coherence_assertion",
      ...purposeAttributionFromPayload({
        purpose: payload.purpose,
        slotKey: payload.slotKey,
        storeId: staged.storeId,
      }),
      resultKind: "finalized",
      durableObjectStageClass: "finalized",
      r2RevisionOutcomeClass: revisionOutcome,
      storeVersionBefore,
      storeVersionAfter: reread.value.storeVersion,
    });
  }

  if (lastSuccessAttribution == null) {
    const payload = input.payloads[0]!;
    return failChain({
      substages,
      failureSubstage: "finalize_input_construction",
      payload,
    });
  }

  return {
    ok: true,
    substages: Object.freeze(substages),
    finalizedObjectIds: Object.freeze(finalizedObjectIds),
    finalizeAttribution: lastSuccessAttribution,
  };
}

export function extractControlPlaneCode(
  result: HeadlessControlPlaneResult<unknown>,
): string | undefined {
  if (result.ok) return undefined;
  return result.issues[0]?.code;
}
