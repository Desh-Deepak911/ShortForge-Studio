/**
 * Sprint 11E Phase 2E.2D.8D — safe dispatch-outbox observation attribution.
 * Classifications only — never IDs, delivery IDs, rows, SQL, or provider text.
 */

import type { HeadlessControlPlaneErrorCode } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import {
  HEADLESS_PROMOTION_RESULT_KINDS,
  type HeadlessPromotionResultKind,
} from "@/features/headless-renderer/control-plane/services/promotion-attribution";
import type { HeadlessStoreVersionDeltaClass } from "@/features/headless-renderer/control-plane/services/promotion-attribution";

import {
  MONOTONIC_DISPATCH_OUTBOX_INTENT_STATES,
  MONOTONIC_DISPATCH_OUTBOX_TRANSITION_CLASSES,
  type MonotonicDispatchOutboxIntentState,
  type MonotonicDispatchOutboxTransitionClass,
} from "./monotonic-dispatch-outbox-observation-authority";
import { classifyStoreVersionDelta } from "./coverage-attribution";

export type FlyRenderLiveDispatchOutboxObservationAttribution = {
  readonly promotionResultKind?: HeadlessPromotionResultKind;
  readonly firstObservedState: MonotonicDispatchOutboxIntentState;
  readonly rereadObservedState: MonotonicDispatchOutboxIntentState;
  readonly monotonicTransitionClass: MonotonicDispatchOutboxTransitionClass;
  readonly identityCoherent: true;
  readonly outboxStoreVersionDelta: HeadlessStoreVersionDeltaClass;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly cleanupStatus?:
    | "ok"
    | "failed"
    | "skipped"
    | "preserved"
    | "not_run";
};

const PROMOTION_KIND_SET = new Set<string>(HEADLESS_PROMOTION_RESULT_KINDS);
const INTENT_STATE_SET = new Set<string>(MONOTONIC_DISPATCH_OUTBOX_INTENT_STATES);
const TRANSITION_SET = new Set<string>(MONOTONIC_DISPATCH_OUTBOX_TRANSITION_CLASSES);

function isPromotionResultKind(value: unknown): value is HeadlessPromotionResultKind {
  return typeof value === "string" && PROMOTION_KIND_SET.has(value);
}

function sanitizeControlPlaneCode(
  value: unknown,
): HeadlessControlPlaneErrorCode | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return undefined;
  }
  if (/[\0-\x1f\x7f`<>|\\\s]/.test(value)) return undefined;
  return value as HeadlessControlPlaneErrorCode;
}

export function buildDispatchOutboxObservationAttribution(input: {
  readonly promotionResultKind?: HeadlessPromotionResultKind | null;
  readonly firstObservedState: MonotonicDispatchOutboxIntentState;
  readonly rereadObservedState: MonotonicDispatchOutboxIntentState;
  readonly monotonicTransitionClass: MonotonicDispatchOutboxTransitionClass;
  readonly firstStoreVersion: number;
  readonly rereadStoreVersion: number;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode | null;
  readonly cleanupStatus?: FlyRenderLiveDispatchOutboxObservationAttribution["cleanupStatus"];
}): FlyRenderLiveDispatchOutboxObservationAttribution {
  const promo =
    input.promotionResultKind != null &&
    isPromotionResultKind(input.promotionResultKind)
      ? input.promotionResultKind
      : undefined;
  const code = sanitizeControlPlaneCode(input.safeControlPlaneCode);
  return Object.freeze({
    firstObservedState: input.firstObservedState,
    rereadObservedState: input.rereadObservedState,
    monotonicTransitionClass: input.monotonicTransitionClass,
    identityCoherent: true as const,
    outboxStoreVersionDelta: classifyStoreVersionDelta(
      input.firstStoreVersion,
      input.rereadStoreVersion,
    ),
    ...(promo != null ? { promotionResultKind: promo } : {}),
    ...(code != null ? { safeControlPlaneCode: code } : {}),
    ...(input.cleanupStatus != null ? { cleanupStatus: input.cleanupStatus } : {}),
  });
}

export function sanitizeDispatchOutboxObservationAttribution(
  value: unknown,
): FlyRenderLiveDispatchOutboxObservationAttribution | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const first = v.firstObservedState;
  const reread = v.rereadObservedState;
  const transition = v.monotonicTransitionClass;
  if (
    typeof first !== "string" ||
    !INTENT_STATE_SET.has(first) ||
    typeof reread !== "string" ||
    !INTENT_STATE_SET.has(reread) ||
    typeof transition !== "string" ||
    !TRANSITION_SET.has(transition) ||
    v.identityCoherent !== true
  ) {
    return null;
  }
  const delta = v.outboxStoreVersionDelta;
  if (
    delta !== "unchanged" &&
    delta !== "plus_one" &&
    delta !== "unexpected"
  ) {
    return null;
  }
  const promo =
    v.promotionResultKind != null && isPromotionResultKind(v.promotionResultKind)
      ? v.promotionResultKind
      : undefined;
  const code = sanitizeControlPlaneCode(v.safeControlPlaneCode);
  const cleanup = v.cleanupStatus;
  const cleanupOk =
    cleanup === "ok" ||
    cleanup === "failed" ||
    cleanup === "skipped" ||
    cleanup === "preserved" ||
    cleanup === "not_run"
      ? cleanup
      : undefined;
  return Object.freeze({
    firstObservedState: first as MonotonicDispatchOutboxIntentState,
    rereadObservedState: reread as MonotonicDispatchOutboxIntentState,
    monotonicTransitionClass: transition as MonotonicDispatchOutboxTransitionClass,
    identityCoherent: true as const,
    outboxStoreVersionDelta: delta as HeadlessStoreVersionDeltaClass,
    ...(promo != null ? { promotionResultKind: promo } : {}),
    ...(code != null ? { safeControlPlaneCode: code } : {}),
    ...(cleanupOk != null ? { cleanupStatus: cleanupOk } : {}),
  });
}
