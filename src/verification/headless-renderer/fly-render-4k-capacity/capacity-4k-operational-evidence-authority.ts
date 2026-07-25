/**
 * Sprint 11E Phase 2E.2D.8L — hosted 4K operational-duration PASS evidence authority.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { FlyRender4kCapacityEvidenceDocument } from "./capacity-4k-evidence";
import {
  assertExactRequiredFlyRender4kCapacityCasePassAuthority,
  REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS,
} from "./capacity-4k-required-cases";
import {
  buildCapacity4kOperationalDurationMatrixBoundaries,
} from "./capacity-4k-workload";
import {
  CAPACITY_4K_OPERATIONAL_CONTENT_MS,
  CAPACITY_4K_OPERATIONAL_MAX_FRAMES,
  CAPACITY_4K_OPERATIONAL_RENDER_MS,
  assertCapacity4kProfileAuditFrozen,
} from "./capacity-4k-profile-audit";
import { validateHosted4kProcessTreeMemoryObservation } from "./hosted-4k-process-tree-memory-observer";
import {
  FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
  buildFlyRender4kCapacitySchemaFingerprint,
} from "./capacity-4k-evidence-authority";

export const FLY_RENDER_4K_SHORT_FUNCTIONAL_PASS_EVIDENCE_SHA =
  "24d3ad9818c52451a0c356ae8176e5cd255a4a8ef958a180dadaf641b30119df" as const;

const SECRETISH =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|registry\.fly\.io\/)/i;

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.length >= 20 && value.length <= 40;
}

export function validatePassFlyRender4kOperationalCapacityEvidence(input: {
  readonly document: unknown;
}):
  | { readonly ok: true; readonly document: FlyRender4kCapacityEvidenceDocument }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(input.document)) {
      return { ok: false, message: "Hostile evidence rejected." };
    }
    const doc = input.document as FlyRender4kCapacityEvidenceDocument;
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall must be PASS." };
    }
    if (doc.fullCapacityClaimJustified !== true) {
      return { ok: false, message: "fullCapacityClaimJustified must be true." };
    }
    const profileAudit = assertCapacity4kProfileAuditFrozen();
    if (!profileAudit.ok) {
      return { ok: false, message: "4K profile audit not frozen." };
    }
    if (
      doc.acceptedImageDigestSha256 !== FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST
    ) {
      return { ok: false, message: "acceptedImageDigestSha256 mismatch." };
    }
    if (doc.startedAtIso == null || !isIsoTimestamp(doc.startedAtIso)) {
      return { ok: false, message: "startedAtIso invalid." };
    }
    if (doc.endedAtIso == null || !isIsoTimestamp(doc.endedAtIso)) {
      return { ok: false, message: "endedAtIso invalid." };
    }
    const cases = assertExactRequiredFlyRender4kCapacityCasePassAuthority(doc.cases);
    if (!cases.ok) return cases;
    if (doc.cases.length !== REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.length) {
      return { ok: false, message: "Case count mismatch." };
    }
    const operationalBoundaries = buildCapacity4kOperationalDurationMatrixBoundaries();
    if (doc.certificationRecords.length < operationalBoundaries.length) {
      return {
        ok: false,
        message: "Missing operational-duration certification records.",
      };
    }
    for (const rec of doc.certificationRecords) {
      if (rec.certificationLevel !== "operational_duration") {
        return {
          ok: false,
          message: "Operational PASS requires operational_duration records only.",
        };
      }
      if (!rec.operationalDuration4kCapacity) {
        return {
          ok: false,
          message: "Operational record must claim operational capacity.",
        };
      }
      if (rec.shortFunctional4kSupport) {
        return {
          ok: false,
          message: "Operational record must not claim short functional support.",
        };
      }
      if (
        rec.contentDurationMs !== CAPACITY_4K_OPERATIONAL_CONTENT_MS ||
        rec.renderDurationMs !== CAPACITY_4K_OPERATIONAL_RENDER_MS ||
        rec.renderedFrames !== CAPACITY_4K_OPERATIONAL_MAX_FRAMES
      ) {
        return { ok: false, message: "Operational frame plan mismatch." };
      }
    }
    if (doc.processTreeObservation != null) {
      const obs = validateHosted4kProcessTreeMemoryObservation(
        doc.processTreeObservation,
      );
      if (!obs.ok) return obs;
      if (
        doc.processTreeObservation.cadence?.samplingCompletenessClass !==
        "complete"
      ) {
        return { ok: false, message: "Process-tree cadence incomplete." };
      }
    }
    if (doc.headroomEvaluation?.fullCapacityClaimJustified !== true) {
      return { ok: false, message: "Headroom evaluation must justify full capacity." };
    }
    void buildFlyRender4kCapacitySchemaFingerprint();
    const rendered = JSON.stringify(doc);
    if (SECRETISH.test(rendered)) {
      return { ok: false, message: "secret-like content in evidence." };
    }
    return { ok: true, document: doc };
  } catch {
    return { ok: false, message: "Hostile evidence rejected." };
  }
}
