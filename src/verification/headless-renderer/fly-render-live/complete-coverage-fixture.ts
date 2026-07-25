/**
 * Sprint 11E Phase 2E.2D.8C — production-authority complete coverage fixture chain.
 * Reconcile each finalized owned object; accept blocked_incomplete until all required
 * targets are verified; require final reread to prove exact complete coverage.
 */

import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane";
import { isProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";

import {
  buildCoverageAttributionSnapshot,
  type CoverageReconcileResultKind,
  type FlyRenderLiveCoverageAttributionSnapshot,
} from "./coverage-attribution";

export type CompleteLiveCoverageSuccess = {
  readonly ok: true;
  readonly record: HeadlessProvisionalStoredJobRecord;
  readonly snapshot: FlyRenderLiveCoverageAttributionSnapshot;
};

export type CompleteLiveCoverageFailure = {
  readonly ok: false;
  readonly reasonId:
    | "coverage_reconcile_failed"
    | "coverage_incomplete"
    | "provisional_reread_failed";
  readonly snapshot: FlyRenderLiveCoverageAttributionSnapshot;
};

export type CompleteLiveCoverageResult =
  | CompleteLiveCoverageSuccess
  | CompleteLiveCoverageFailure;

function mapReconcileStatus(
  status: string,
): CoverageReconcileResultKind {
  if (status === "applied") return "applied";
  if (status === "already_complete") return "already_complete";
  if (status === "blocked_incomplete") return "blocked_incomplete";
  if (status === "not_finalized") return "not_finalized";
  return "reconcile_error";
}

async function rereadProvisional(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly jobId: string;
  readonly ownerId: string;
}): Promise<
  | { readonly ok: true; readonly record: HeadlessProvisionalStoredJobRecord }
  | { readonly ok: false }
> {
  const loaded = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!loaded.ok || !isProvisionalStoredJobRecord(loaded.value)) {
    return { ok: false };
  }
  return { ok: true, record: loaded.value };
}

/**
 * Reconcile finalized objects in order through production authority.
 * Skips objects when forceIncomplete omits trailing ids (fixture negative tests).
 */
export async function reconcileCompleteLiveCoverage(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly provisional: HeadlessProvisionalStoredJobRecord;
  readonly finalizedObjectIds: readonly string[];
  readonly ownerId: string;
  readonly nowMs: number;
  readonly forceOmitObjectIds?: readonly string[];
}): Promise<CompleteLiveCoverageResult> {
  const objectIds = input.finalizedObjectIds.filter(
    (id) => !(input.forceOmitObjectIds ?? []).includes(id),
  );
  let verifiedBefore =
    input.provisional.verificationCoverage.verifiedTargets.length;
  let sawBlockedIncomplete = false;
  let lastStoreVersion = input.provisional.storeVersion;

  for (let i = 0; i < objectIds.length; i++) {
    const objectId = objectIds[i]!;
    const isLast = i === objectIds.length - 1;
    const nowMs = input.nowMs + i + 1;

    const beforeRead = await rereadProvisional({
      jobStore: input.jobStore,
      jobId: input.provisional.jobId,
      ownerId: input.ownerId,
    });
    if (!beforeRead.ok) {
      return {
        ok: false,
        reasonId: "provisional_reread_failed",
        snapshot: buildCoverageAttributionSnapshot({
          provisional: input.provisional,
          finalizedOwnedObjectCount: objectIds.length,
          verifiedTargetCountBefore: verifiedBefore,
          verifiedTargetCountAfter: verifiedBefore,
          reconcileResultKind: "reconcile_error",
        }),
      };
    }
    const storeVersionBefore = beforeRead.record.storeVersion;

    const result = await reconcileFinalizedOwnedObjectCoverage({
      jobStore: input.jobStore,
      ownedObjectStore: input.ownedObjectStore,
      objectId,
      ownerId: input.ownerId,
      nowMs,
    });

    const afterFailRead = await rereadProvisional({
      jobStore: input.jobStore,
      jobId: input.provisional.jobId,
      ownerId: input.ownerId,
    });
    const afterRecord = afterFailRead.ok ? afterFailRead.record : beforeRead.record;
    const verifiedAfter =
      afterRecord.verificationCoverage.verifiedTargets.length;

    if (!result.ok) {
      const kind: CoverageReconcileResultKind =
        result.issues[0]?.code === "STALE_TRANSITION"
          ? "cas_stale"
          : result.issues[0]?.code === "HOSTILE_INPUT"
            ? "hostile_input"
            : "reconcile_error";
      return {
        ok: false,
        reasonId: "coverage_reconcile_failed",
        snapshot: buildCoverageAttributionSnapshot({
          provisional: afterRecord,
          finalizedOwnedObjectCount: objectIds.length,
          verifiedTargetCountBefore: verifiedBefore,
          verifiedTargetCountAfter: verifiedAfter,
          reconcileResultKind: kind,
          storeVersionBefore,
          storeVersionAfter: afterRecord.storeVersion,
        }),
      };
    }

    const kind = mapReconcileStatus(result.value.status);
    if (kind === "blocked_incomplete") {
      sawBlockedIncomplete = true;
      if (isLast && !result.value.coverageComplete) {
        // Expected intermediate on non-final objects only; terminal incomplete if last.
      }
    }

    if (
      kind !== "applied" &&
      kind !== "already_complete" &&
      kind !== "blocked_incomplete"
    ) {
      return {
        ok: false,
        reasonId: "coverage_reconcile_failed",
        snapshot: buildCoverageAttributionSnapshot({
          provisional: afterRecord,
          finalizedOwnedObjectCount: objectIds.length,
          verifiedTargetCountBefore: verifiedBefore,
          verifiedTargetCountAfter: verifiedAfter,
          reconcileResultKind: kind,
          storeVersionBefore,
          storeVersionAfter: afterRecord.storeVersion,
          intermediateBlockedIncomplete: sawBlockedIncomplete,
        }),
      };
    }

    if (!afterFailRead.ok) {
      return {
        ok: false,
        reasonId: "provisional_reread_failed",
        snapshot: buildCoverageAttributionSnapshot({
          provisional: input.provisional,
          finalizedOwnedObjectCount: objectIds.length,
          verifiedTargetCountBefore: verifiedBefore,
          verifiedTargetCountAfter: verifiedBefore,
          reconcileResultKind: kind,
        }),
      };
    }

    verifiedBefore = afterFailRead.record.verificationCoverage.verifiedTargets.length;
    lastStoreVersion = afterFailRead.record.storeVersion;

    if (isLast && result.value.coverageComplete) {
      return {
        ok: true,
        record: afterFailRead.record,
        snapshot: buildCoverageAttributionSnapshot({
          provisional: afterFailRead.record,
          finalizedOwnedObjectCount: objectIds.length,
          verifiedTargetCountBefore:
            input.provisional.verificationCoverage.verifiedTargets.length,
          verifiedTargetCountAfter: verifiedBefore,
          reconcileResultKind: kind,
          storeVersionBefore: input.provisional.storeVersion,
          storeVersionAfter: lastStoreVersion,
          intermediateBlockedIncomplete: sawBlockedIncomplete,
        }),
      };
    }
  }

  const finalRead = await rereadProvisional({
    jobStore: input.jobStore,
    jobId: input.provisional.jobId,
    ownerId: input.ownerId,
  });
  if (!finalRead.ok) {
    return {
      ok: false,
      reasonId: "provisional_reread_failed",
      snapshot: buildCoverageAttributionSnapshot({
        provisional: input.provisional,
        finalizedOwnedObjectCount: objectIds.length,
        verifiedTargetCountBefore: verifiedBefore,
        verifiedTargetCountAfter: verifiedBefore,
        reconcileResultKind: "reconcile_error",
      }),
    };
  }

  const finalRecord = finalRead.record;
  const complete = finalRecord.verificationCoverage.complete;
  const snapshot = buildCoverageAttributionSnapshot({
    provisional: finalRecord,
    finalizedOwnedObjectCount: objectIds.length,
    verifiedTargetCountBefore:
      input.provisional.verificationCoverage.verifiedTargets.length,
    verifiedTargetCountAfter:
      finalRecord.verificationCoverage.verifiedTargets.length,
    reconcileResultKind: complete ? "applied" : "terminal_incomplete",
    storeVersionBefore: input.provisional.storeVersion,
    storeVersionAfter: finalRecord.storeVersion,
    intermediateBlockedIncomplete: sawBlockedIncomplete,
  });

  if (!complete) {
    return {
      ok: false,
      reasonId: "coverage_incomplete",
      snapshot,
    };
  }

  return { ok: true, record: finalRecord, snapshot };
}
