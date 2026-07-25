/**
 * Evidence coherence authority — PASS documents must satisfy exact membership.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { NeonLiveEvidenceDocument } from "./evidence";
import {
  assertExactRequiredLiveCasePassAuthority,
  REQUIRED_NEON_LIVE_CASE_IDS,
} from "./required-cases";

export type EvidenceAuthorityResult =
  | { readonly ok: true; readonly document: NeonLiveEvidenceDocument }
  | { readonly ok: false; readonly message: string };

const CLEANUP_OK = new Set(["ok", "preserved"]);

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== "string" || value.length < 20 || value.length > 40) {
    return false;
  }
  const t = Date.parse(value);
  return Number.isFinite(t);
}

/**
 * Validate a PASS evidence document before write.
 */
export function validatePassNeonLiveEvidence(options: {
  readonly document: unknown;
  readonly expectedMigrationIds: readonly string[];
  readonly expectedChecksumPrefixes: readonly string[];
}): EvidenceAuthorityResult {
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
    const doc = options.document as NeonLiveEvidenceDocument;
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

    const cases = assertExactRequiredLiveCasePassAuthority(doc.cases);
    if (!cases.ok) {
      return { ok: false, message: cases.message };
    }
    if (cases.cases.length !== REQUIRED_NEON_LIVE_CASE_IDS.length) {
      return { ok: false, message: "Case registry length mismatch." };
    }

    const serialized = JSON.stringify(doc);
    if (
      serialized.includes("postgresql://") ||
      serialized.includes("DATABASE_URL") ||
      serialized.includes("password") ||
      serialized.includes("secret")
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
