/**
 * Targeted evidence coherence authority — PASS documents must satisfy exact
 * membership and schema fingerprint including migrations 000/001/002/004.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { R2TargetedEvidenceDocument } from "./evidence";
import {
  assertExactRequiredR2TargetedCasePassAuthority,
  REQUIRED_R2_TARGETED_CASE_IDS,
} from "./required-cases";

export type R2TargetedEvidenceAuthorityResult =
  | { readonly ok: true; readonly document: R2TargetedEvidenceDocument }
  | { readonly ok: false; readonly message: string };

const CLEANUP_OK = new Set(["ok", "preserved"]);

const REQUIRED_MIGRATION_IDS = Object.freeze([
  "000_headless_schema_migrations",
  "001_headless_project_ownership",
  "002_headless_jobs",
  "004_headless_owned_objects",
] as const);

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== "string" || value.length < 20 || value.length > 40) {
    return false;
  }
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function assertFingerprintIncludesRequiredMigrations(
  migrationIds: readonly string[],
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  for (const required of REQUIRED_MIGRATION_IDS) {
    if (!migrationIds.includes(required)) {
      return {
        ok: false,
        message: `PASS fingerprint missing migration ${required}.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Validate a PASS targeted evidence document before write.
 * Requires migration fingerprint membership including 000/001/002/004.
 */
export function validatePassR2TargetedEvidence(options: {
  readonly document: unknown;
  readonly expectedMigrationIds: readonly string[];
  readonly expectedChecksumPrefixes: readonly string[];
}): R2TargetedEvidenceAuthorityResult {
  try {
    if (guardHeadlessStructure(options.document)) {
      return { ok: false, message: "Hostile evidence document rejected." };
    }
    if (
      options.document == null ||
      typeof options.document !== "object" ||
      Array.isArray(options.document)
    ) {
      return { ok: false, message: "Evidence document must be a plain object." };
    }
    const doc = options.document as R2TargetedEvidenceDocument;
    if (doc.overall !== "PASS") {
      return { ok: false, message: "Evidence overall must be PASS." };
    }
    if (typeof doc.startedAtIso !== "string" || !isIsoTimestamp(doc.startedAtIso)) {
      return { ok: false, message: "startedAtIso is incoherent." };
    }
    if (typeof doc.endedAtIso !== "string" || !isIsoTimestamp(doc.endedAtIso)) {
      return { ok: false, message: "endedAtIso is incoherent." };
    }
    if (Date.parse(doc.endedAtIso) < Date.parse(doc.startedAtIso)) {
      return { ok: false, message: "endedAtIso precedes startedAtIso." };
    }
    if (!CLEANUP_OK.has(doc.cleanupStatus)) {
      return { ok: false, message: "Cleanup status does not satisfy policy." };
    }
    if (doc.schemaFingerprint == null) {
      return { ok: false, message: "Schema fingerprint required for PASS." };
    }

    const expectedRequired = assertFingerprintIncludesRequiredMigrations(
      options.expectedMigrationIds,
    );
    if (!expectedRequired.ok) return expectedRequired;

    if (
      doc.schemaFingerprint.migrationIds.length !==
        options.expectedMigrationIds.length ||
      doc.schemaFingerprint.checksumPrefixes.length !==
        options.expectedChecksumPrefixes.length
    ) {
      return { ok: false, message: "Schema fingerprint membership mismatch." };
    }
    for (let i = 0; i < options.expectedMigrationIds.length; i++) {
      if (
        doc.schemaFingerprint.migrationIds[i] !==
        options.expectedMigrationIds[i]
      ) {
        return { ok: false, message: "Schema fingerprint migration ID mismatch." };
      }
      if (
        doc.schemaFingerprint.checksumPrefixes[i] !==
        options.expectedChecksumPrefixes[i]
      ) {
        return {
          ok: false,
          message: "Schema fingerprint checksum prefix mismatch.",
        };
      }
      const prefix = doc.schemaFingerprint.checksumPrefixes[i]!;
      if (!/^[0-9a-f]{12}$/.test(prefix)) {
        return { ok: false, message: "Checksum prefix is not bounded hex." };
      }
    }

    const docRequired = assertFingerprintIncludesRequiredMigrations(
      doc.schemaFingerprint.migrationIds,
    );
    if (!docRequired.ok) return docRequired;

    const cases = assertExactRequiredR2TargetedCasePassAuthority(doc.cases);
    if (!cases.ok) {
      return { ok: false, message: cases.message };
    }
    if (cases.cases.length !== REQUIRED_R2_TARGETED_CASE_IDS.length) {
      return { ok: false, message: "Case registry length mismatch." };
    }

    const serialized = JSON.stringify(doc);
    if (
      serialized.includes("postgresql://") ||
      serialized.includes("DATABASE_URL") ||
      serialized.includes("R2_SECRET") ||
      serialized.includes("password") ||
      serialized.includes("secret") ||
      serialized.includes("X-Amz-")
    ) {
      return { ok: false, message: "Evidence contains secret-bearing content." };
    }

    return {
      ok: true,
      document: {
        ...doc,
        cases: cases.cases,
      },
    };
  } catch {
    return { ok: false, message: "Hostile evidence document rejected." };
  }
}
