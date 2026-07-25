/**
 * Structural privacy authority for Fly render live evidence.
 */

import type { FlyRenderLiveEvidenceDocument } from "./evidence";

const FORBIDDEN =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|registry\.fly\.io\/shortforge)/i;

export function assertFlyRenderLiveEvidencePrivacyStructure(
  doc: FlyRenderLiveEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const parts: string[] = [
    doc.title,
    doc.eligibilityVerdict,
    doc.startedAtIso ?? "",
    doc.endedAtIso ?? "",
    ...doc.notes,
    ...doc.cases.map((c) => `${c.caseId}:${c.status}:${c.failureCategory ?? ""}`),
  ];
  if (doc.jobCreateFailureAttribution != null) {
    const a = doc.jobCreateFailureAttribution;
    parts.push(
      a.failureStage,
      a.failureReasonId,
      a.safeControlPlaneCode ?? "",
      a.allowlistedSqlState ?? "",
      a.allowlistedConstraint ?? "",
      a.promotionReasonId ?? "",
      a.durableJobStage ?? "",
      a.storeVersionDelta ?? "",
      a.cleanupStatus ?? "",
      a.coverageAttribution != null
        ? [
            String(a.coverageAttribution.requiredTargetCount),
            String(a.coverageAttribution.stagedReferenceCount),
            String(a.coverageAttribution.finalizedOwnedObjectCount),
            String(a.coverageAttribution.verifiedTargetCountBefore),
            String(a.coverageAttribution.verifiedTargetCountAfter),
            String(a.coverageAttribution.missingTargetCount),
            a.coverageAttribution.duplicateExtraClassification,
            a.coverageAttribution.reconcileResultKind,
            a.coverageAttribution.storeVersionDelta ?? "",
            String(a.coverageAttribution.finalCoverageComplete),
            String(a.coverageAttribution.intermediateBlockedIncomplete),
          ].join("|")
        : "",
      a.stagingAttribution != null
        ? [
            a.stagingAttribution.stagingSubstage,
            a.stagingAttribution.objectPurposeClass,
            a.stagingAttribution.slotKeyClass,
            a.stagingAttribution.slotKeyLengthClass,
            a.stagingAttribution.storeClass,
            a.stagingAttribution.safeControlPlaneCode ?? "",
            a.stagingAttribution.allowlistedSqlState ?? "",
            a.stagingAttribution.allowlistedConstraint ?? "",
            a.stagingAttribution.resultKind,
            a.stagingAttribution.cleanupStatus ?? "",
          ].join("|")
        : "",
      a.finalizeAttribution != null
        ? [
            a.finalizeAttribution.finalizeSubstage,
            a.finalizeAttribution.objectPurposeClass,
            a.finalizeAttribution.slotKeyClass,
            a.finalizeAttribution.slotKeyLengthClass,
            a.finalizeAttribution.storeClass,
            a.finalizeAttribution.failureBoundaryClass ?? "",
            a.finalizeAttribution.safeControlPlaneCode ?? "",
            a.finalizeAttribution.allowlistedSqlState ?? "",
            a.finalizeAttribution.allowlistedConstraint ?? "",
            a.finalizeAttribution.resultKind,
            a.finalizeAttribution.storeVersionDelta ?? "",
            a.finalizeAttribution.durableObjectStageClass ?? "",
            a.finalizeAttribution.r2RevisionOutcomeClass ?? "",
            a.finalizeAttribution.cleanupStatus ?? "",
          ].join("|")
        : "",
    );
  }
  if (doc.acceptedImageDigestSha256 != null) {
    parts.push(doc.acceptedImageDigestSha256);
  }
  const joined = parts.join("\n");
  if (FORBIDDEN.test(joined)) {
    return { ok: false, message: "Evidence privacy violation." };
  }
  return { ok: true };
}
