/**
 * Fly verify live PASS evidence authority.
 */

import {
  embeddedSchemaFingerprintAsPreflightSources,
} from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";
import {
  HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import {
  buildCurrentPost007SchemaFingerprintForEvidence,
  buildHistoricalPre007SchemaFingerprintForEvidence,
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
  validateCurrentFlyLivePassImageAuthority,
  validateHistoricalFlyVerifyLivePassImageAuthority,
  validateHistoricalPost007PreTelemetryFlyLiveImageAuthority,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";

import {
  checksumPrefix,
  type FlyVerifyLiveEvidenceDocument,
} from "./evidence";
import { assertFlyVerifyLiveEvidencePrivacyStructure } from "./evidence-privacy-authority";
import {
  assertExactRequiredFlyVerifyLiveCasePassAuthority,
  REQUIRED_FLY_VERIFY_LIVE_CASE_IDS,
} from "./required-cases";

export const FLY_VERIFY_LIVE_REQUIRED_MIGRATION_IDS = Object.freeze([
  "000_headless_schema_migrations",
  "001_headless_project_ownership",
  "002_headless_jobs",
  "004_headless_owned_objects",
  "005_headless_cleanup_intents",
  "006_headless_render_dispatch_outbox",
  "007_headless_owned_object_slot_key_capacity",
] as const);

const CLEANUP_OK = new Set(["ok", "preserved"]);

const SECRETISH =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=|registry\.fly\.io\/)/i;

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.length >= 20 && value.length <= 40;
}

export function buildFlyVerifyLiveSchemaFingerprint(): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
} {
  const sources = embeddedSchemaFingerprintAsPreflightSources();
  const byId = new Map(sources.map((s) => [s.migrationId, s.checksumSha256]));
  const migrationIds: string[] = [];
  const checksumPrefixes: string[] = [];
  for (const id of FLY_VERIFY_LIVE_REQUIRED_MIGRATION_IDS) {
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

export function validatePassFlyVerifyLiveEvidence(input: {
  readonly document: unknown;
}):
  | { readonly ok: true; readonly document: FlyVerifyLiveEvidenceDocument }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(input.document)) {
      return { ok: false, message: "Hostile evidence rejected." };
    }
    const doc = input.document as FlyVerifyLiveEvidenceDocument;
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall must be PASS." };
    }
    if (
      typeof doc.startedAtIso !== "string" ||
      typeof doc.endedAtIso !== "string" ||
      !isIsoTimestamp(doc.startedAtIso) ||
      !isIsoTimestamp(doc.endedAtIso)
    ) {
      return { ok: false, message: "Timestamps invalid." };
    }
    if (!CLEANUP_OK.has(doc.cleanupStatus)) {
      return { ok: false, message: "cleanupStatus must be ok or preserved." };
    }
    const cases = assertExactRequiredFlyVerifyLiveCasePassAuthority(doc.cases);
    if (!cases.ok) return cases;
    if (doc.schemaFingerprint == null) {
      return { ok: false, message: "schemaFingerprint required." };
    }
    const schemaIds = doc.schemaFingerprint.migrationIds;
    const isHistoricalPre007Pass = validateHistoricalFlyVerifyLivePassImageAuthority({
      acceptedImageDigestSha256: doc.acceptedImageDigestSha256,
      schemaMigrationIds: schemaIds,
    });
    const isHistoricalPost007PreTelemetryPass =
      validateHistoricalPost007PreTelemetryFlyLiveImageAuthority({
        acceptedImageDigestSha256: doc.acceptedImageDigestSha256,
        schemaMigrationIds: schemaIds,
      });
    const isCurrentPass = validateCurrentFlyLivePassImageAuthority({
      acceptedImageDigestSha256: doc.acceptedImageDigestSha256,
      schemaMigrationIds: schemaIds,
    });
    if (
      !isHistoricalPre007Pass &&
      !isHistoricalPost007PreTelemetryPass &&
      !isCurrentPass
    ) {
      return { ok: false, message: "acceptedImageDigestSha256 mismatch." };
    }
    const expected =
      isCurrentPass || isHistoricalPost007PreTelemetryPass
        ? buildCurrentPost007SchemaFingerprintForEvidence()
        : buildHistoricalPre007SchemaFingerprintForEvidence();
    if (
      doc.schemaFingerprint.migrationIds.length !== expected.migrationIds.length ||
      doc.schemaFingerprint.checksumPrefixes.length !==
        expected.checksumPrefixes.length
    ) {
      return { ok: false, message: "schemaFingerprint shape invalid." };
    }
    for (let i = 0; i < expected.migrationIds.length; i++) {
      if (doc.schemaFingerprint.migrationIds[i] !== expected.migrationIds[i]) {
        return { ok: false, message: "schemaFingerprint migrationIds mismatch." };
      }
      if (
        doc.schemaFingerprint.checksumPrefixes[i] !== expected.checksumPrefixes[i]
      ) {
        return { ok: false, message: "schemaFingerprint checksum mismatch." };
      }
    }
    if (
      doc.flyVerifyTopology == null ||
      doc.flyVerifyTopology.verifyCount !== 1 ||
      doc.flyVerifyTopology.renderCount !== 0 ||
      doc.flyVerifyTopology.observedRegion !== "iad"
    ) {
      return { ok: false, message: "flyVerifyTopology invalid." };
    }
    const privacy = assertFlyVerifyLiveEvidencePrivacyStructure(doc);
    if (!privacy.ok) return privacy;
    const rendered = JSON.stringify(doc);
    if (SECRETISH.test(rendered)) {
      return { ok: false, message: "Evidence contains secret-like material." };
    }
    if (doc.cases.length !== REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length) {
      return { ok: false, message: "Case count mismatch." };
    }
    if (doc.title.length === 0) {
      return { ok: false, message: "title required." };
    }
    if (!doc.eligibilityVerdict.includes("ELIGIBLE")) {
      return { ok: false, message: "eligibilityVerdict must claim ELIGIBLE." };
    }
    if (doc.notes.some((n) => SECRETISH.test(n))) {
      return { ok: false, message: "notes contain secret-like material." };
    }
    return { ok: true, document: doc };
  } catch {
    return { ok: false, message: "Hostile evidence rejected." };
  }
}

export const FLY_VERIFY_LIVE_ACCEPTED_APP = HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP;

/** Current post-007 live harness / PASS evidence digest binding. */
export const FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST =
  resolveCurrentFlyStagingAcceptedImageDigestSha256();

export {
  buildHistoricalPre007SchemaFingerprintForEvidence,
  buildCurrentPost007SchemaFingerprintForEvidence,
};
