/**
 * Bounded promotion attribution — QA/diagnostic only.
 * Never carries jobs, fingerprints, digests, SQL, rows, or provider text.
 */

import type { HeadlessControlPlaneErrorCode } from "../types/control-plane.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessPromoteProvisionalResult } from "../ports/job-store.port";
import {
  sanitizeHeadlessPromotionReasonId,
  type HeadlessPromotionReasonId,
} from "./promotion-reason-ids";

export const HEADLESS_PROMOTION_SAFE_STAGES = Object.freeze([
  "canonical_pair_construction",
  "promotion_record_read",
  "promotion_preflight",
  "promotion_update",
  "promotion_rehydrate",
  "promotion_post_write",
  "promotion",
] as const);

export type HeadlessPromotionSafeStage =
  (typeof HEADLESS_PROMOTION_SAFE_STAGES)[number];

const STAGE_SET = new Set<string>(HEADLESS_PROMOTION_SAFE_STAGES);

export function isHeadlessPromotionSafeStage(
  value: unknown,
): value is HeadlessPromotionSafeStage {
  return typeof value === "string" && STAGE_SET.has(value);
}

export const HEADLESS_PROMOTION_RESULT_KINDS = Object.freeze([
  "updated",
  "already_promoted",
  "rejected",
  "stale",
  "control_plane_failure",
] as const);

export type HeadlessPromotionResultKind =
  (typeof HEADLESS_PROMOTION_RESULT_KINDS)[number];

export const HEADLESS_STORE_VERSION_DELTA_CLASSES = Object.freeze([
  "unchanged",
  "plus_one",
  "unexpected",
] as const);

export type HeadlessStoreVersionDeltaClass =
  (typeof HEADLESS_STORE_VERSION_DELTA_CLASSES)[number];

export type HeadlessPromotionStageClass = "provisional" | "canonical";

export type HeadlessPromotionAttribution = {
  readonly safeOperationStage: HeadlessPromotionSafeStage;
  readonly promotionResultKind: HeadlessPromotionResultKind | null;
  readonly safeControlPlaneCode: HeadlessControlPlaneErrorCode | null;
  readonly allowlistedSqlState: string | null;
  readonly allowlistedConstraint: string | null;
  readonly promotionReasonId: HeadlessPromotionReasonId | null;
  readonly durableCanonicalRowExists: boolean | null;
  readonly storeVersionDelta: HeadlessStoreVersionDeltaClass | null;
  readonly stageClassification: HeadlessPromotionStageClass | null;
};

export type HeadlessPromotionAttributedResult = {
  readonly result: HeadlessControlPlaneResult<HeadlessPromoteProvisionalResult>;
  readonly attribution: HeadlessPromotionAttribution;
};

export function emptyPromotionAttribution(
  stage: HeadlessPromotionSafeStage = "promotion",
): HeadlessPromotionAttribution {
  return {
    safeOperationStage: stage,
    promotionResultKind: null,
    safeControlPlaneCode: null,
    allowlistedSqlState: null,
    allowlistedConstraint: null,
    promotionReasonId: null,
    durableCanonicalRowExists: null,
    storeVersionDelta: null,
    stageClassification: null,
  };
}

export function sanitizePromotionAttribution(
  value: unknown,
): HeadlessPromotionAttribution | null {
  try {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const v = value as Record<string, unknown>;
    if (!isHeadlessPromotionSafeStage(v.safeOperationStage)) return null;
    const kind = v.promotionResultKind;
    if (
      kind != null &&
      !(HEADLESS_PROMOTION_RESULT_KINDS as readonly string[]).includes(
        kind as string,
      )
    ) {
      return null;
    }
    const delta = v.storeVersionDelta;
    if (
      delta != null &&
      !(HEADLESS_STORE_VERSION_DELTA_CLASSES as readonly string[]).includes(
        delta as string,
      )
    ) {
      return null;
    }
    const stageClass = v.stageClassification;
    if (
      stageClass != null &&
      stageClass !== "provisional" &&
      stageClass !== "canonical"
    ) {
      return null;
    }
    const reason = sanitizeHeadlessPromotionReasonId(v.promotionReasonId);
    if (v.promotionReasonId != null && reason == null) return null;

    return {
      safeOperationStage: v.safeOperationStage,
      promotionResultKind:
        kind == null ? null : (kind as HeadlessPromotionResultKind),
      safeControlPlaneCode:
        typeof v.safeControlPlaneCode === "string"
          ? (v.safeControlPlaneCode as HeadlessControlPlaneErrorCode)
          : null,
      allowlistedSqlState:
        typeof v.allowlistedSqlState === "string" ? v.allowlistedSqlState : null,
      allowlistedConstraint:
        typeof v.allowlistedConstraint === "string"
          ? v.allowlistedConstraint
          : null,
      promotionReasonId: reason,
      durableCanonicalRowExists:
        typeof v.durableCanonicalRowExists === "boolean"
          ? v.durableCanonicalRowExists
          : null,
      storeVersionDelta:
        delta == null ? null : (delta as HeadlessStoreVersionDeltaClass),
      stageClassification:
        stageClass == null ? null : (stageClass as HeadlessPromotionStageClass),
    };
  } catch {
    return null;
  }
}
