/**
 * Sprint 11E Phase 2E.2D.8D — earliest authoritative dispatch-outbox capture.
 */

import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessRenderDispatchOutboxPort } from "@/features/headless-renderer/control-plane/ports/render-dispatch-outbox.port";
import type { HeadlessPromotionAttribution } from "@/features/headless-renderer/control-plane/services/promotion-attribution";

import {
  buildDispatchOutboxObservationAttribution,
  type FlyRenderLiveDispatchOutboxObservationAttribution,
} from "./dispatch-outbox-observation-attribution";
import {
  assertCanonicalJobForDispatchOutboxObservation,
  classifyMonotonicDispatchOutboxIntentObservation,
  classifyMonotonicDispatchOutboxTransition,
  type MonotonicDispatchOutboxIntentState,
  type MonotonicDispatchOutboxObservationFailClass,
} from "./monotonic-dispatch-outbox-observation-authority";

export type FlyRenderLiveDispatchOutboxObservationAnchor = {
  readonly firstObservedState: MonotonicDispatchOutboxIntentState;
  readonly rereadObservedState: MonotonicDispatchOutboxIntentState;
  readonly monotonicTransitionClass:
    FlyRenderLiveDispatchOutboxObservationAttribution["monotonicTransitionClass"];
  readonly identityCoherent: true;
  readonly anchorAttempt: number;
  readonly firstStoreVersion: number;
  readonly rereadStoreVersion: number;
  readonly attribution: FlyRenderLiveDispatchOutboxObservationAttribution;
};

export async function captureMonotonicDispatchOutboxObservation(input: {
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly jobStore: HeadlessJobStorePort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly expectedOperationId?: string | null;
  readonly promotionAttribution?: HeadlessPromotionAttribution | null;
}): Promise<
  | { readonly ok: true; readonly anchor: FlyRenderLiveDispatchOutboxObservationAnchor }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    }
> {
  try {
    const jobLoaded = await input.jobStore.getByJobIdAndOwner(
      input.jobId,
      input.ownerId,
    );
    if (!jobLoaded.ok) {
      return { ok: false, failClass: "missing_row" };
    }
    const canonical = assertCanonicalJobForDispatchOutboxObservation(
      jobLoaded.value,
    );
    if (!canonical.ok) {
      return { ok: false, failClass: canonical.failClass };
    }
    const job = canonical.record;
    const attempt = job.canonicalJob.attempt;

    const firstRead = await input.dispatchOutbox.getByJobAttemptAndOwner({
      jobId: input.jobId,
      ownerId: input.ownerId,
      attempt,
    });
    const firstObservation = classifyMonotonicDispatchOutboxIntentObservation({
      row: firstRead.ok ? firstRead.value : null,
      job,
      expectedOperationId: input.expectedOperationId,
    });
    if (!firstObservation.ok) {
      return { ok: false, failClass: firstObservation.failClass };
    }

    const reread = await input.dispatchOutbox.getByJobAttemptAndOwner({
      jobId: input.jobId,
      ownerId: input.ownerId,
      attempt,
    });
    const rereadObservation = classifyMonotonicDispatchOutboxIntentObservation({
      row: reread.ok ? reread.value : null,
      job,
      expectedOperationId: input.expectedOperationId,
    });
    if (!rereadObservation.ok) {
      return { ok: false, failClass: rereadObservation.failClass };
    }

    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: firstObservation.observedState,
      rereadState: rereadObservation.observedState,
      firstStoreVersion: firstObservation.storeVersion,
      rereadStoreVersion: rereadObservation.storeVersion,
    });
    if (!transition.ok) {
      return { ok: false, failClass: transition.failClass };
    }

    const attribution = buildDispatchOutboxObservationAttribution({
      promotionResultKind: input.promotionAttribution?.promotionResultKind,
      firstObservedState: firstObservation.observedState,
      rereadObservedState: rereadObservation.observedState,
      monotonicTransitionClass: transition.transitionClass,
      firstStoreVersion: firstObservation.storeVersion,
      rereadStoreVersion: rereadObservation.storeVersion,
      safeControlPlaneCode: input.promotionAttribution?.safeControlPlaneCode,
    });

    return {
      ok: true,
      anchor: Object.freeze({
        firstObservedState: firstObservation.observedState,
        rereadObservedState: rereadObservation.observedState,
        monotonicTransitionClass: transition.transitionClass,
        identityCoherent: true as const,
        anchorAttempt: attempt,
        firstStoreVersion: firstObservation.storeVersion,
        rereadStoreVersion: rereadObservation.storeVersion,
        attribution,
      }),
    };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export async function rereadMonotonicDispatchOutboxIntentObservation(input: {
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly jobStore: HeadlessJobStorePort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly expectedOperationId?: string | null;
  readonly anchor: FlyRenderLiveDispatchOutboxObservationAnchor;
}): Promise<
  | {
      readonly ok: true;
      readonly attribution: FlyRenderLiveDispatchOutboxObservationAttribution;
    }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    }
> {
  try {
    const jobLoaded = await input.jobStore.getByJobIdAndOwner(
      input.jobId,
      input.ownerId,
    );
    if (!jobLoaded.ok) {
      return { ok: false, failClass: "missing_row" };
    }
    const canonical = assertCanonicalJobForDispatchOutboxObservation(
      jobLoaded.value,
    );
    if (!canonical.ok) {
      return { ok: false, failClass: canonical.failClass };
    }
    const reread = await input.dispatchOutbox.getByJobAttemptAndOwner({
      jobId: input.jobId,
      ownerId: input.ownerId,
      attempt: input.anchor.anchorAttempt,
    });
    const observation = classifyMonotonicDispatchOutboxIntentObservation({
      row: reread.ok ? reread.value : null,
      job: canonical.record,
      expectedOperationId: input.expectedOperationId,
    });
    if (!observation.ok) {
      return { ok: false, failClass: observation.failClass };
    }
    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: input.anchor.firstObservedState,
      rereadState: observation.observedState,
      firstStoreVersion: input.anchor.firstStoreVersion,
      rereadStoreVersion: observation.storeVersion,
    });
    if (!transition.ok) {
      return { ok: false, failClass: transition.failClass };
    }
    return {
      ok: true,
      attribution: buildDispatchOutboxObservationAttribution({
        promotionResultKind: input.anchor.attribution.promotionResultKind,
        firstObservedState: input.anchor.firstObservedState,
        rereadObservedState: observation.observedState,
        monotonicTransitionClass: transition.transitionClass,
        firstStoreVersion: input.anchor.firstStoreVersion,
        rereadStoreVersion: observation.storeVersion,
        safeControlPlaneCode: input.anchor.attribution.safeControlPlaneCode,
      }),
    };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}
