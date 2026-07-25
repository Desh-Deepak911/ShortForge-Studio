/**
 * Upstash live PASS evidence authority —
 * Neon fingerprint + protocol + cleanup ok|preserved + timestamps + privacy.
 */

import { HEADLESS_QUEUE_PROTOCOL_VERSION } from "@/features/headless-renderer/control-plane";
import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  checksumPrefix,
  type UpstashLiveEvidenceDocument,
} from "./evidence";
import { assertUpstashEvidencePrivacyStructure } from "./evidence-privacy-authority";
import {
  assertExactRequiredUpstashLiveCasePassAuthority,
  REQUIRED_UPSTASH_LIVE_CASE_IDS,
} from "./required-cases";

/** Neon executable migrations required for dual-lease authority (000/001/002/004). */
export const UPSTASH_LIVE_REQUIRED_MIGRATION_IDS = Object.freeze([
  "000_headless_schema_migrations",
  "001_headless_project_ownership",
  "002_headless_jobs",
  "004_headless_owned_objects",
] as const);

const CLEANUP_OK = new Set(["ok", "preserved"]);

const SECRETISH =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_REDIS_|eyJ[A-Za-z0-9_-]{10,}\.|password=|token=)/i;

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== "string" || value.length < 20 || value.length > 40) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

export function buildUpstashLiveSchemaFingerprint(): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
  readonly queueProtocolVersion: string;
} {
  const sources = discoverHeadlessMigrationSources();
  const byId = new Map(sources.map((s) => [s.migrationId, s]));
  const migrationIds: string[] = [];
  const checksumPrefixes: string[] = [];
  for (const id of UPSTASH_LIVE_REQUIRED_MIGRATION_IDS) {
    const src = byId.get(id);
    if (src == null) {
      throw new Error(`Missing required migration ${id}`);
    }
    migrationIds.push(id);
    checksumPrefixes.push(checksumPrefix(src.checksumSha256));
  }
  return Object.freeze({
    migrationIds: Object.freeze(migrationIds.slice()),
    checksumPrefixes: Object.freeze(checksumPrefixes.slice()),
    queueProtocolVersion: HEADLESS_QUEUE_PROTOCOL_VERSION,
  });
}

/** Build fingerprint from a live preflight result (actual applied schema). */
export function fingerprintFromPreflight(input: {
  readonly migrationIds: readonly string[];
  readonly checksums: readonly string[];
}): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
  readonly queueProtocolVersion: string;
} {
  const byId = new Map(
    input.migrationIds.map((id, i) => [id, input.checksums[i] ?? ""]),
  );
  const migrationIds: string[] = [];
  const checksumPrefixes: string[] = [];
  for (const id of UPSTASH_LIVE_REQUIRED_MIGRATION_IDS) {
    const full = byId.get(id);
    if (full == null || full.length < 12) {
      throw new Error(`Preflight missing required migration ${id}`);
    }
    migrationIds.push(id);
    checksumPrefixes.push(checksumPrefix(full));
  }
  return Object.freeze({
    migrationIds: Object.freeze(migrationIds.slice()),
    checksumPrefixes: Object.freeze(checksumPrefixes.slice()),
    queueProtocolVersion: HEADLESS_QUEUE_PROTOCOL_VERSION,
  });
}

function scanSecrets(doc: UpstashLiveEvidenceDocument): string | null {
  try {
    const blob = JSON.stringify(doc);
    if (SECRETISH.test(blob)) {
      return "Evidence contains secret-like material.";
    }
  } catch {
    return "Evidence secret scan failed.";
  }
  for (const note of doc.notes) {
    if (SECRETISH.test(note)) {
      return "Evidence notes contain secret-like material.";
    }
  }
  return null;
}

export function validatePassUpstashLiveEvidence(
  doc: UpstashLiveEvidenceDocument,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(doc)) {
      return { ok: false, message: "Hostile evidence document rejected." };
    }
    if (doc.overall !== "PASS") {
      return { ok: false, message: "overall must be PASS." };
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
      return {
        ok: false,
        message: "PASS requires cleanupStatus ok|preserved (not skipped/failed/not_run).",
      };
    }
    const cases = assertExactRequiredUpstashLiveCasePassAuthority(doc.cases);
    if (!cases.ok) return cases;
    if (doc.schemaFingerprint == null) {
      return { ok: false, message: "schemaFingerprint required for PASS." };
    }
    if (
      doc.schemaFingerprint.queueProtocolVersion !==
      HEADLESS_QUEUE_PROTOCOL_VERSION
    ) {
      return { ok: false, message: "queueProtocolVersion mismatch." };
    }
    if (
      doc.schemaFingerprint.queueProtocolVersion !== "hfq-dual-lease-v1"
    ) {
      return { ok: false, message: "protocol must be hfq-dual-lease-v1." };
    }
    const expected = buildUpstashLiveSchemaFingerprint();
    if (
      doc.schemaFingerprint.migrationIds.length !==
      expected.migrationIds.length
    ) {
      return { ok: false, message: "migrationIds length mismatch." };
    }
    for (let i = 0; i < expected.migrationIds.length; i++) {
      if (doc.schemaFingerprint.migrationIds[i] !== expected.migrationIds[i]) {
        return { ok: false, message: "migrationIds mismatch." };
      }
      if (
        doc.schemaFingerprint.checksumPrefixes[i] !==
        expected.checksumPrefixes[i]
      ) {
        return { ok: false, message: "checksumPrefixes mismatch." };
      }
      const prefix = doc.schemaFingerprint.checksumPrefixes[i]!;
      if (!/^[0-9a-f]{12}$/.test(prefix)) {
        return { ok: false, message: "checksum prefix is not bounded hex." };
      }
    }
    if (doc.cases.length !== REQUIRED_UPSTASH_LIVE_CASE_IDS.length) {
      return { ok: false, message: "case count mismatch." };
    }
    const secret = scanSecrets(doc);
    if (secret != null) {
      return { ok: false, message: secret };
    }
    for (const c of doc.cases) {
      const privacy = assertUpstashEvidencePrivacyStructure(c);
      if (!privacy.ok) {
        return { ok: false, message: privacy.message };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "PASS authority rejected hostile evidence." };
  }
}
