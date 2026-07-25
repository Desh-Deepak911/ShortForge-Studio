/**
 * Sprint 11E Phase 2E.2D.8K — hosted 4K capacity PASS evidence authority.
 */

import {
  embeddedSchemaFingerprintAsPreflightSources,
} from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";
import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";

import { FLY_RENDER_LIVE_REQUIRED_MIGRATION_IDS } from "../fly-render-live/evidence-authority";

import {
  checksumPrefix,
  type FlyRender4kCapacityEvidenceDocument,
} from "./capacity-4k-evidence";
import {
  assertExactRequiredFlyRender4kCapacityCasePassAuthority,
  REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS,
} from "./capacity-4k-required-cases";
import { buildCapacity4kShortFunctionalMatrixBoundaries } from "./capacity-4k-workload";
import { validateHosted4kProcessTreeMemoryObservation } from "./hosted-4k-process-tree-memory-observer";
import { assertCapacity4kProfileAuditFrozen } from "./capacity-4k-profile-audit";

const SECRETISH =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|registry\.fly\.io\/)/i;

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.length >= 20 && value.length <= 40;
}

export const FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST =
  resolveCurrentFlyStagingAcceptedImageDigestSha256();

export function buildFlyRender4kCapacitySchemaFingerprint(): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
} {
  const sources = embeddedSchemaFingerprintAsPreflightSources();
  const byId = new Map(sources.map((s) => [s.migrationId, s.checksumSha256]));
  const migrationIds: string[] = [];
  const checksumPrefixes: string[] = [];
  for (const id of FLY_RENDER_LIVE_REQUIRED_MIGRATION_IDS) {
    const checksum = byId.get(id);
    if (checksum == null || checksum.length < 12) {
      throw new Error(`Missing required migration ${id}`);
    }
    migrationIds.push(id);
    checksumPrefixes.push(checksumPrefix(checksum));
  }
  return Object.freeze({
    migrationIds: Object.freeze(migrationIds.slice()),
    checksumPrefixes: Object.freeze(checksumPrefixes.slice()),
  });
}

export function validatePassFlyRender4kCapacityEvidence(input: {
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
    const shortBoundaries = buildCapacity4kShortFunctionalMatrixBoundaries();
    if (doc.certificationRecords.length < shortBoundaries.length) {
      return { ok: false, message: "Missing short functional certification records." };
    }
    for (const rec of doc.certificationRecords) {
      if (rec.certificationLevel === "short_functional") {
        if (rec.operationalDuration4kCapacity) {
          return {
            ok: false,
            message: "Short functional record must not claim operational capacity.",
          };
        }
      }
    }
    if (doc.processTreeObservation != null) {
      const obs = validateHosted4kProcessTreeMemoryObservation(
        doc.processTreeObservation,
      );
      if (!obs.ok) return obs;
    }
    const rendered = JSON.stringify(doc);
    if (SECRETISH.test(rendered)) {
      return { ok: false, message: "secret-like content in evidence." };
    }
    return { ok: true, document: doc };
  } catch {
    return { ok: false, message: "Hostile evidence rejected." };
  }
}
