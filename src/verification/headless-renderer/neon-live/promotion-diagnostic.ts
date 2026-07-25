/**
 * Map bounded promotion attribution into progressive / probe diagnostics.
 * Never carries jobs, fingerprints, SQL, rows, or provider text.
 */

import {
  HEADLESS_PROMOTION_RESULT_KINDS,
  HEADLESS_STORE_VERSION_DELTA_CLASSES,
  isHeadlessPromotionReasonId,
  isHeadlessPromotionSafeStage,
  type HeadlessPromotionAttribution,
  type HeadlessPromotionReasonId,
  type HeadlessPromotionResultKind,
  type HeadlessPromotionStageClass,
  type HeadlessStoreVersionDeltaClass,
} from "@/features/headless-renderer/control-plane/testing";

import type { CaseStepDiagnostic } from "./case-step";
import {
  isProgressiveSafeStage,
  type ProgressiveSafeStage,
} from "./injection";

export type PromotionDiagnosticFields = {
  readonly promotionResultKind: HeadlessPromotionResultKind | null;
  readonly promotionReasonId: HeadlessPromotionReasonId | null;
  readonly durableCanonicalRowExists: boolean | null;
  readonly storeVersionDelta: HeadlessStoreVersionDeltaClass | null;
  readonly stageClassification: HeadlessPromotionStageClass | null;
};

export function emptyPromotionDiagnosticFields(): PromotionDiagnosticFields {
  return {
    promotionResultKind: null,
    promotionReasonId: null,
    durableCanonicalRowExists: null,
    storeVersionDelta: null,
    stageClassification: null,
  };
}

export function sanitizePromotionResultKind(
  value: unknown,
): HeadlessPromotionResultKind | null {
  if (typeof value !== "string") return null;
  return (HEADLESS_PROMOTION_RESULT_KINDS as readonly string[]).includes(value)
    ? (value as HeadlessPromotionResultKind)
    : null;
}

export function sanitizeStoreVersionDelta(
  value: unknown,
): HeadlessStoreVersionDeltaClass | null {
  if (typeof value !== "string") return null;
  return (HEADLESS_STORE_VERSION_DELTA_CLASSES as readonly string[]).includes(
    value,
  )
    ? (value as HeadlessStoreVersionDeltaClass)
    : null;
}

export function sanitizeStageClassification(
  value: unknown,
): HeadlessPromotionStageClass | null {
  return value === "provisional" || value === "canonical" ? value : null;
}

export function sanitizePromotionDiagnosticFields(
  value: Partial<PromotionDiagnosticFields> | null | undefined,
): PromotionDiagnosticFields {
  if (value == null) return emptyPromotionDiagnosticFields();
  const reason =
    value.promotionReasonId == null
      ? null
      : isHeadlessPromotionReasonId(value.promotionReasonId)
        ? value.promotionReasonId
        : null;
  if (value.promotionReasonId != null && reason == null) {
    return emptyPromotionDiagnosticFields();
  }
  return {
    promotionResultKind: sanitizePromotionResultKind(value.promotionResultKind),
    promotionReasonId: reason,
    durableCanonicalRowExists:
      typeof value.durableCanonicalRowExists === "boolean"
        ? value.durableCanonicalRowExists
        : null,
    storeVersionDelta: sanitizeStoreVersionDelta(value.storeVersionDelta),
    stageClassification: sanitizeStageClassification(value.stageClassification),
  };
}

export function progressiveStageFromPromotionAttribution(
  attribution: HeadlessPromotionAttribution,
): ProgressiveSafeStage {
  if (isProgressiveSafeStage(attribution.safeOperationStage)) {
    return attribution.safeOperationStage;
  }
  if (isHeadlessPromotionSafeStage(attribution.safeOperationStage)) {
    return "promotion";
  }
  return "promotion";
}

export function caseDiagnosticFromPromotionAttribution(
  attribution: HeadlessPromotionAttribution,
): CaseStepDiagnostic {
  return {
    safeOperationStage: progressiveStageFromPromotionAttribution(attribution),
    safeControlPlaneCode: attribution.safeControlPlaneCode,
    allowlistedSqlState: attribution.allowlistedSqlState,
    allowlistedConstraint: attribution.allowlistedConstraint,
    ...sanitizePromotionDiagnosticFields({
      promotionResultKind: attribution.promotionResultKind,
      promotionReasonId: attribution.promotionReasonId,
      durableCanonicalRowExists: attribution.durableCanonicalRowExists,
      storeVersionDelta: attribution.storeVersionDelta,
      stageClassification: attribution.stageClassification,
    }),
  };
}
