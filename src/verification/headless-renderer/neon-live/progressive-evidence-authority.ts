/**
 * Total hostile-input-safe progressive diagnostic evidence authority.
 * Only branded validated documents may be written.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import {
  isProgressiveSafeStage,
  type ProgressiveSafeStage,
} from "./injection";
import {
  isSafeProgressiveMarkdownToken,
  sanitizeProgressiveConstraintId,
  sanitizeProgressiveControlPlaneCode,
  sanitizeProgressiveSqlState,
} from "./progressive-diagnostic-allowlists";
import {
  emptyPromotionDiagnosticFields,
  sanitizePromotionDiagnosticFields,
  sanitizePromotionResultKind,
  sanitizeStageClassification,
  sanitizeStoreVersionDelta,
  type PromotionDiagnosticFields,
} from "./promotion-diagnostic";
import { isHeadlessPromotionReasonId } from "@/features/headless-renderer/control-plane/testing";
import type { NeonLiveCaseEvidence } from "./evidence";
import {
  assertExactRequiredLiveCasePassAuthority,
  assertExactRequiredLiveCasePrefixFailAuthority,
  NEON_LIVE_FAILURE_CATEGORIES,
  REQUIRED_NEON_LIVE_CASE_IDS,
  validateNeonLiveCaseEvidenceShape,
} from "./required-cases";

export type NeonProgressiveDiagnosticDocument = {
  readonly title: string;
  readonly overall: "PASS" | "FAIL" | "NOT_TESTED";
  readonly eligibilityVerdict: string;
  readonly startedAtIso: string | null;
  readonly endedAtIso: string | null;
  readonly lastCompletedRequiredCase: string | null;
  readonly activeFailedCase: string | null;
  readonly safeOperationStage: ProgressiveSafeStage | null;
  readonly safeControlPlaneCode: string | null;
  readonly allowlistedSqlState: string | null;
  readonly allowlistedConstraint: string | null;
  readonly promotionResultKind: PromotionDiagnosticFields["promotionResultKind"];
  readonly promotionReasonId: PromotionDiagnosticFields["promotionReasonId"];
  readonly durableCanonicalRowExists: boolean | null;
  readonly storeVersionDelta: PromotionDiagnosticFields["storeVersionDelta"];
  readonly stageClassification: PromotionDiagnosticFields["stageClassification"];
  readonly cases: readonly NeonLiveCaseEvidence[];
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumPrefixes: readonly string[];
  } | null;
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly notes: readonly string[];
};

const PROGRESSIVE_EVIDENCE_BRAND = Symbol("ValidatedNeonProgressiveEvidence");

export type ValidatedNeonProgressiveEvidence =
  NeonProgressiveDiagnosticDocument & {
    readonly [PROGRESSIVE_EVIDENCE_BRAND]: true;
  };

export type ProgressiveEvidenceAuthorityResult =
  | { readonly ok: true; readonly document: ValidatedNeonProgressiveEvidence }
  | { readonly ok: false; readonly message: string };

export const PROGRESSIVE_EVIDENCE_TITLE =
  "Sprint 11E Phase 2B.2D.1 — Neon progressive diagnostic" as const;

export const PROGRESSIVE_ELIGIBILITY = Object.freeze({
  PASS: "ELIGIBLE — progressive matrix completed all required cases with cleanup ok.",
  FAIL_CLEANUP: "NOT ELIGIBLE — cleanup failed.",
  FAIL_MATRIX:
    "NOT ELIGIBLE — progressive matrix stopped on first failure or incomplete authority.",
  FAIL_CONFIG:
    "NOT ELIGIBLE — HEADLESS_NEON_QA_PROGRESSIVE=1 but DATABASE_URL is missing or invalid.",
  FAIL_CONFIG_URL:
    "NOT ELIGIBLE — DATABASE_URL unavailable after classification.",
  FAIL_PREFLIGHT_MISSING: "NOT ELIGIBLE — schema preflight failed (SCHEMA_MISSING).",
  FAIL_PREFLIGHT_DRIFT: "NOT ELIGIBLE — schema preflight failed (SCHEMA_DRIFT).",
  FAIL_PREFLIGHT_INCOHERENT:
    "NOT ELIGIBLE — schema preflight failed (SCHEMA_INCOHERENT).",
  FAIL_BOOTSTRAP: "NOT ELIGIBLE — progressive matrix failed before required cases.",
  NOT_TESTED: "NOT ELIGIBLE — progressive Neon diagnostic has not been executed.",
} as const);

const ELIGIBILITY_SET = new Set<string>(Object.values(PROGRESSIVE_ELIGIBILITY));

export const PROGRESSIVE_NOTE_REGISTRY = Object.freeze([
  "Progressive diagnostic evidence — does not overwrite official live evidence.",
  "Evidence excludes URLs, credentials, SQL, provider text, owner/session IDs, and row payloads.",
  "Gate off — no Neon connection attempted.",
  "Prior PASS/FAIL progressive evidence must not be overwritten by gate-off runs.",
  "CONFIGURATION UNAVAILABLE — no connection attempted.",
  "CONFIGURATION UNAVAILABLE.",
  "Progressive diagnostic never auto-runs migrations.",
  "EVIDENCE_INVALID",
] as const);

const NOTE_REGISTRY_SET = new Set<string>(PROGRESSIVE_NOTE_REGISTRY);

const DOC_KEYS = Object.freeze([
  "title",
  "overall",
  "eligibilityVerdict",
  "startedAtIso",
  "endedAtIso",
  "lastCompletedRequiredCase",
  "activeFailedCase",
  "safeOperationStage",
  "safeControlPlaneCode",
  "allowlistedSqlState",
  "allowlistedConstraint",
  "promotionResultKind",
  "promotionReasonId",
  "durableCanonicalRowExists",
  "storeVersionDelta",
  "stageClassification",
  "cases",
  "schemaFingerprint",
  "cleanupStatus",
  "notes",
] as const);

const CLEANUP_ALL = new Set([
  "ok",
  "failed",
  "skipped",
  "preserved",
  "not_run",
]);

const FINAL_REQUIRED_CASE =
  REQUIRED_NEON_LIVE_CASE_IDS[REQUIRED_NEON_LIVE_CASE_IDS.length - 1]!;

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== "string" || value.length < 20 || value.length > 40) {
    return false;
  }
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function brand(
  document: NeonProgressiveDiagnosticDocument,
): ValidatedNeonProgressiveEvidence {
  return Object.freeze({
    ...document,
    cases: Object.freeze([...document.cases]),
    notes: Object.freeze([...document.notes]),
    schemaFingerprint:
      document.schemaFingerprint == null
        ? null
        : Object.freeze({
            migrationIds: Object.freeze([
              ...document.schemaFingerprint.migrationIds,
            ]),
            checksumPrefixes: Object.freeze([
              ...document.schemaFingerprint.checksumPrefixes,
            ]),
          }),
    [PROGRESSIVE_EVIDENCE_BRAND]: true as const,
  });
}

export function isValidatedNeonProgressiveEvidence(
  value: unknown,
): value is ValidatedNeonProgressiveEvidence {
  return (
    typeof value === "object" &&
    value != null &&
    (value as { [PROGRESSIVE_EVIDENCE_BRAND]?: unknown })[
      PROGRESSIVE_EVIDENCE_BRAND
    ] === true
  );
}

function validateNotes(
  notes: unknown,
): { ok: true; notes: readonly string[] } | { ok: false; message: string } {
  if (!Array.isArray(notes) || notes.length > 16) {
    return { ok: false, message: "notes shape invalid." };
  }
  const out: string[] = [];
  for (const note of notes) {
    if (typeof note !== "string" || note.length === 0 || note.length > 200) {
      return { ok: false, message: "note bound invalid." };
    }
    if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(note)) {
      return { ok: false, message: "note contains unsafe characters." };
    }
    if (NOTE_REGISTRY_SET.has(note)) {
      out.push(note);
      continue;
    }
    if (/^connectionFactoryCalls=\d{1,4}$/.test(note)) {
      out.push(note);
      continue;
    }
    if (/^casesRecorded=\d{1,3}$/.test(note)) {
      out.push(note);
      continue;
    }
    return { ok: false, message: "note is not allowlisted." };
  }
  return { ok: true, notes: out };
}

function validateFingerprint(
  fingerprint: unknown,
  expectedMigrationIds: readonly string[] | null,
  expectedChecksumPrefixes: readonly string[] | null,
  requireMatch: boolean,
):
  | {
      ok: true;
      fingerprint: NeonProgressiveDiagnosticDocument["schemaFingerprint"];
    }
  | { ok: false; message: string } {
  if (fingerprint == null) {
    if (requireMatch) {
      return { ok: false, message: "Schema fingerprint required." };
    }
    return { ok: true, fingerprint: null };
  }
  if (!isPlainObject(fingerprint)) {
    return { ok: false, message: "Schema fingerprint must be a plain object." };
  }
  const keys = Object.keys(fingerprint).sort();
  if (keys.join(",") !== "checksumPrefixes,migrationIds") {
    return { ok: false, message: "Schema fingerprint keys invalid." };
  }
  const migrationIds = fingerprint.migrationIds;
  const checksumPrefixes = fingerprint.checksumPrefixes;
  if (!Array.isArray(migrationIds) || !Array.isArray(checksumPrefixes)) {
    return { ok: false, message: "Schema fingerprint arrays invalid." };
  }
  if (migrationIds.length !== checksumPrefixes.length) {
    return { ok: false, message: "Schema fingerprint length mismatch." };
  }
  for (let i = 0; i < migrationIds.length; i++) {
    const id = migrationIds[i];
    const prefix = checksumPrefixes[i];
    if (typeof id !== "string" || !isSafeProgressiveMarkdownToken(id)) {
      return { ok: false, message: "migration id unsafe." };
    }
    if (typeof prefix !== "string" || !/^[0-9a-f]{12}$/.test(prefix)) {
      return { ok: false, message: "checksum prefix invalid." };
    }
  }
  if (requireMatch) {
    if (
      expectedMigrationIds == null ||
      expectedChecksumPrefixes == null ||
      migrationIds.length !== expectedMigrationIds.length
    ) {
      return { ok: false, message: "Schema fingerprint membership mismatch." };
    }
    for (let i = 0; i < expectedMigrationIds.length; i++) {
      if (migrationIds[i] !== expectedMigrationIds[i]) {
        return { ok: false, message: "Schema fingerprint migration ID mismatch." };
      }
      if (checksumPrefixes[i] !== expectedChecksumPrefixes[i]) {
        return {
          ok: false,
          message: "Schema fingerprint checksum prefix mismatch.",
        };
      }
    }
  }
  return {
    ok: true,
    fingerprint: {
      migrationIds: migrationIds as unknown as string[],
      checksumPrefixes: checksumPrefixes as unknown as string[],
    },
  };
}

function secretScan(serialized: string): boolean {
  return (
    serialized.includes("postgresql://") ||
    serialized.includes("DATABASE_URL") ||
    /password/i.test(serialized) ||
    /secret/i.test(serialized)
  );
}

/**
 * Canonical note builder — only registry / bounded counter notes.
 */
export function buildProgressiveEvidenceNotes(input: {
  readonly connectionFactoryCalls: number;
  readonly casesRecorded: number;
  readonly extra?: readonly (typeof PROGRESSIVE_NOTE_REGISTRY)[number][];
}): readonly string[] {
  const calls = Math.max(
    0,
    Math.min(9999, Math.floor(input.connectionFactoryCalls)),
  );
  const recorded = Math.max(
    0,
    Math.min(999, Math.floor(input.casesRecorded)),
  );
  return [
    PROGRESSIVE_NOTE_REGISTRY[0],
    PROGRESSIVE_NOTE_REGISTRY[1],
    `connectionFactoryCalls=${calls}`,
    `casesRecorded=${recorded}`,
    ...(input.extra ?? []),
  ];
}

export function createNotTestedProgressiveEvidence(): NeonProgressiveDiagnosticDocument {
  return {
    title: PROGRESSIVE_EVIDENCE_TITLE,
    overall: "NOT_TESTED",
    eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.NOT_TESTED,
    startedAtIso: null,
    endedAtIso: null,
    lastCompletedRequiredCase: null,
    activeFailedCase: null,
    safeOperationStage: null,
    safeControlPlaneCode: null,
    allowlistedSqlState: null,
    allowlistedConstraint: null,
    ...emptyPromotionDiagnosticFields(),
    cases: [],
    schemaFingerprint: null,
    cleanupStatus: "not_run",
    notes: [PROGRESSIVE_NOTE_REGISTRY[2], PROGRESSIVE_NOTE_REGISTRY[3]],
  };
}

/**
 * Total validator for progressive diagnostic evidence.
 */
export function validateNeonProgressiveEvidence(options: {
  readonly document: unknown;
  readonly expectedMigrationIds?: readonly string[];
  readonly expectedChecksumPrefixes?: readonly string[];
}): ProgressiveEvidenceAuthorityResult {
  try {
    if (guardHeadlessStructure(options.document)) {
      return { ok: false, message: "Hostile evidence document rejected." };
    }
    if (!isPlainObject(options.document)) {
      return { ok: false, message: "Evidence document must be a plain object." };
    }
    const keys = Object.keys(options.document).sort();
    const expectedKeys = [...DOC_KEYS].sort();
    if (keys.length !== expectedKeys.length) {
      return { ok: false, message: "Evidence top-level key set invalid." };
    }
    for (let i = 0; i < expectedKeys.length; i++) {
      if (keys[i] !== expectedKeys[i]) {
        return { ok: false, message: "Evidence has unknown or missing keys." };
      }
    }

    const doc = options.document as NeonProgressiveDiagnosticDocument;
    if (doc.title !== PROGRESSIVE_EVIDENCE_TITLE) {
      return { ok: false, message: "title is not canonical." };
    }
    if (
      doc.overall !== "PASS" &&
      doc.overall !== "FAIL" &&
      doc.overall !== "NOT_TESTED"
    ) {
      return { ok: false, message: "overall is not bounded." };
    }
    if (!ELIGIBILITY_SET.has(doc.eligibilityVerdict)) {
      return { ok: false, message: "eligibilityVerdict is not allowlisted." };
    }
    if (!CLEANUP_ALL.has(doc.cleanupStatus)) {
      return { ok: false, message: "cleanupStatus is not bounded." };
    }

    const notes = validateNotes(doc.notes);
    if (!notes.ok) return notes;

    const stage =
      doc.safeOperationStage == null
        ? null
        : isProgressiveSafeStage(doc.safeOperationStage)
          ? doc.safeOperationStage
          : undefined;
    if (stage === undefined) {
      return { ok: false, message: "safeOperationStage is not allowlisted." };
    }

    const cpCode = sanitizeProgressiveControlPlaneCode(doc.safeControlPlaneCode);
    if (doc.safeControlPlaneCode != null && cpCode == null) {
      return { ok: false, message: "safeControlPlaneCode is not allowlisted." };
    }
    const sqlState = sanitizeProgressiveSqlState(doc.allowlistedSqlState);
    if (doc.allowlistedSqlState != null && sqlState == null) {
      return { ok: false, message: "allowlistedSqlState is not allowlisted." };
    }
    const constraint = sanitizeProgressiveConstraintId(
      doc.allowlistedConstraint,
    );
    if (doc.allowlistedConstraint != null && constraint == null) {
      return { ok: false, message: "allowlistedConstraint is not allowlisted." };
    }

    const promotionFields = sanitizePromotionDiagnosticFields({
      promotionResultKind: doc.promotionResultKind,
      promotionReasonId: doc.promotionReasonId,
      durableCanonicalRowExists: doc.durableCanonicalRowExists,
      storeVersionDelta: doc.storeVersionDelta,
      stageClassification: doc.stageClassification,
    });
    if (
      (doc.promotionResultKind != null &&
        sanitizePromotionResultKind(doc.promotionResultKind) == null) ||
      (doc.promotionReasonId != null &&
        !isHeadlessPromotionReasonId(doc.promotionReasonId)) ||
      (doc.storeVersionDelta != null &&
        sanitizeStoreVersionDelta(doc.storeVersionDelta) == null) ||
      (doc.stageClassification != null &&
        sanitizeStageClassification(doc.stageClassification) == null) ||
      (doc.durableCanonicalRowExists != null &&
        typeof doc.durableCanonicalRowExists !== "boolean")
    ) {
      return { ok: false, message: "promotion attribution fields are invalid." };
    }

    if (doc.overall === "NOT_TESTED") {
      if (
        doc.startedAtIso != null ||
        doc.endedAtIso != null ||
        doc.lastCompletedRequiredCase != null ||
        doc.activeFailedCase != null ||
        stage != null ||
        cpCode != null ||
        sqlState != null ||
        constraint != null ||
        promotionFields.promotionResultKind != null ||
        promotionFields.promotionReasonId != null ||
        promotionFields.durableCanonicalRowExists != null ||
        promotionFields.storeVersionDelta != null ||
        promotionFields.stageClassification != null ||
        doc.schemaFingerprint != null ||
        doc.cleanupStatus !== "not_run" ||
        !Array.isArray(doc.cases) ||
        doc.cases.length !== 0
      ) {
        return { ok: false, message: "NOT_TESTED evidence is incoherent." };
      }
      const canonical = brand({
        ...createNotTestedProgressiveEvidence(),
        eligibilityVerdict: doc.eligibilityVerdict,
        notes: notes.notes,
      });
      if (secretScan(JSON.stringify(canonical))) {
        return { ok: false, message: "Evidence contains secret-bearing content." };
      }
      return { ok: true, document: canonical };
    }

    if (
      typeof doc.startedAtIso !== "string" ||
      !isIsoTimestamp(doc.startedAtIso) ||
      typeof doc.endedAtIso !== "string" ||
      !isIsoTimestamp(doc.endedAtIso)
    ) {
      return { ok: false, message: "timestamps are incoherent." };
    }
    if (Date.parse(doc.endedAtIso) < Date.parse(doc.startedAtIso)) {
      return { ok: false, message: "endedAtIso precedes startedAtIso." };
    }

    if (doc.overall === "PASS") {
      if (doc.cleanupStatus !== "ok") {
        return { ok: false, message: "PASS requires cleanup ok." };
      }
      if (doc.activeFailedCase != null) {
        return { ok: false, message: "PASS forbids activeFailedCase." };
      }
      if (doc.lastCompletedRequiredCase !== FINAL_REQUIRED_CASE) {
        return {
          ok: false,
          message: "PASS lastCompletedRequiredCase must be final required case.",
        };
      }
      if (
        stage != null ||
        cpCode != null ||
        sqlState != null ||
        constraint != null ||
        promotionFields.promotionResultKind != null ||
        promotionFields.promotionReasonId != null ||
        promotionFields.durableCanonicalRowExists != null ||
        promotionFields.storeVersionDelta != null ||
        promotionFields.stageClassification != null
      ) {
        return { ok: false, message: "PASS forbids failure attribution fields." };
      }
      if (doc.eligibilityVerdict !== PROGRESSIVE_ELIGIBILITY.PASS) {
        return { ok: false, message: "PASS eligibilityVerdict mismatch." };
      }
      const fp = validateFingerprint(
        doc.schemaFingerprint,
        options.expectedMigrationIds ?? null,
        options.expectedChecksumPrefixes ?? null,
        true,
      );
      if (!fp.ok) return fp;
      const cases = assertExactRequiredLiveCasePassAuthority(doc.cases);
      if (!cases.ok) {
        return { ok: false, message: cases.message };
      }
      const canonical = brand({
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "PASS",
        eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.PASS,
        startedAtIso: doc.startedAtIso,
        endedAtIso: doc.endedAtIso,
        lastCompletedRequiredCase: FINAL_REQUIRED_CASE,
        activeFailedCase: null,
        safeOperationStage: null,
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        ...emptyPromotionDiagnosticFields(),
        cases: cases.cases,
        schemaFingerprint: fp.fingerprint,
        cleanupStatus: "ok",
        notes: notes.notes,
      });
      if (secretScan(JSON.stringify(canonical))) {
        return { ok: false, message: "Evidence contains secret-bearing content." };
      }
      return { ok: true, document: canonical };
    }

    // FAIL
    const bootstrap =
      doc.activeFailedCase === "matrix.exception" &&
      Array.isArray(doc.cases) &&
      (doc.cases.length === 0 ||
        (doc.cases.length === 1 &&
          isPlainObject(doc.cases[0]) &&
          (doc.cases[0] as { caseId?: unknown }).caseId === "matrix.exception"));

    if (bootstrap) {
      if (doc.lastCompletedRequiredCase != null) {
        return { ok: false, message: "bootstrap FAIL forbids lastCompleted." };
      }
      if (stage !== "matrix_bootstrap") {
        return { ok: false, message: "bootstrap FAIL requires matrix_bootstrap." };
      }
      if (doc.cases.length === 1) {
        const shaped = validateNeonLiveCaseEvidenceShape(doc.cases[0]);
        if (
          !shaped.ok ||
          shaped.case.caseId !== "matrix.exception" ||
          shaped.case.status !== "FAIL" ||
          shaped.case.failureCategory !== "MATRIX_EXCEPTION"
        ) {
          return { ok: false, message: "bootstrap case evidence invalid." };
        }
      }
      const fp = validateFingerprint(
        doc.schemaFingerprint,
        options.expectedMigrationIds ?? null,
        options.expectedChecksumPrefixes ?? null,
        false,
      );
      if (!fp.ok) return fp;
      const canonical = brand({
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: doc.eligibilityVerdict,
        startedAtIso: doc.startedAtIso,
        endedAtIso: doc.endedAtIso,
        lastCompletedRequiredCase: null,
        activeFailedCase: "matrix.exception",
        safeOperationStage: "matrix_bootstrap",
        safeControlPlaneCode: cpCode,
        allowlistedSqlState: sqlState,
        allowlistedConstraint: constraint,
        ...emptyPromotionDiagnosticFields(),
        cases:
          doc.cases.length === 0
            ? []
            : [
                {
                  caseId: "matrix.exception",
                  status: "FAIL",
                  failureCategory: "MATRIX_EXCEPTION",
                },
              ],
        schemaFingerprint: fp.fingerprint,
        cleanupStatus: doc.cleanupStatus,
        notes: notes.notes,
      });
      if (secretScan(JSON.stringify(canonical))) {
        return { ok: false, message: "Evidence contains secret-bearing content." };
      }
      return { ok: true, document: canonical };
    }

    // Prefix-FAIL after case execution
    if (
      doc.cleanupStatus !== "ok" &&
      doc.cleanupStatus !== "failed" &&
      doc.cleanupStatus !== "preserved"
    ) {
      // allow not_run for preflight-only fails without cases
      if (
        !(
          doc.cleanupStatus === "not_run" &&
          Array.isArray(doc.cases) &&
          doc.cases.length === 0
        )
      ) {
        return { ok: false, message: "FAIL cleanupStatus is not bounded." };
      }
    }

    if (Array.isArray(doc.cases) && doc.cases.length === 0) {
      // Preflight / config FAIL without required cases (not bootstrap matrix.exception)
      if (doc.lastCompletedRequiredCase != null) {
        return { ok: false, message: "empty FAIL forbids lastCompleted." };
      }
      if (doc.activeFailedCase != null && doc.activeFailedCase !== "matrix.exception") {
        return { ok: false, message: "empty FAIL activeFailedCase invalid." };
      }
      const fp = validateFingerprint(
        doc.schemaFingerprint,
        options.expectedMigrationIds ?? null,
        options.expectedChecksumPrefixes ?? null,
        false,
      );
      if (!fp.ok) return fp;
      if (stage == null) {
        return { ok: false, message: "empty FAIL requires safeOperationStage." };
      }
      const canonical = brand({
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: doc.eligibilityVerdict,
        startedAtIso: doc.startedAtIso,
        endedAtIso: doc.endedAtIso,
        lastCompletedRequiredCase: null,
        activeFailedCase: doc.activeFailedCase,
        safeOperationStage: stage,
        safeControlPlaneCode: cpCode,
        allowlistedSqlState: sqlState,
        allowlistedConstraint: constraint,
        ...emptyPromotionDiagnosticFields(),
        cases: [],
        schemaFingerprint: fp.fingerprint,
        cleanupStatus: doc.cleanupStatus,
        notes: notes.notes,
      });
      if (secretScan(JSON.stringify(canonical))) {
        return { ok: false, message: "Evidence contains secret-bearing content." };
      }
      return { ok: true, document: canonical };
    }

    const prefix = assertExactRequiredLiveCasePrefixFailAuthority(doc.cases);
    if (!prefix.ok) {
      return { ok: false, message: prefix.message };
    }
    if (doc.activeFailedCase !== prefix.failedCaseId) {
      return { ok: false, message: "activeFailedCase attribution mismatch." };
    }
    if (doc.lastCompletedRequiredCase !== prefix.lastCompletedRequiredCase) {
      return {
        ok: false,
        message: "lastCompletedRequiredCase attribution mismatch.",
      };
    }
    if (stage == null) {
      return { ok: false, message: "prefix-FAIL requires safeOperationStage." };
    }
    const fp = validateFingerprint(
      doc.schemaFingerprint,
      options.expectedMigrationIds ?? null,
      options.expectedChecksumPrefixes ?? null,
      true,
    );
    if (!fp.ok) return fp;
    if (
      doc.cleanupStatus !== "ok" &&
      doc.cleanupStatus !== "failed" &&
      doc.cleanupStatus !== "preserved"
    ) {
      return { ok: false, message: "prefix-FAIL cleanupStatus invalid." };
    }

    const failCat = prefix.cases[prefix.cases.length - 1]!.failureCategory;
    if (
      failCat == null ||
      !(NEON_LIVE_FAILURE_CATEGORIES as readonly string[]).includes(failCat)
    ) {
      return { ok: false, message: "failureCategory not allowlisted." };
    }

    const canonical = brand({
      title: PROGRESSIVE_EVIDENCE_TITLE,
      overall: "FAIL",
      eligibilityVerdict: doc.eligibilityVerdict,
      startedAtIso: doc.startedAtIso,
      endedAtIso: doc.endedAtIso,
      lastCompletedRequiredCase: prefix.lastCompletedRequiredCase,
      activeFailedCase: prefix.failedCaseId,
      safeOperationStage: stage as ProgressiveSafeStage,
      safeControlPlaneCode: cpCode,
      allowlistedSqlState: sqlState,
      allowlistedConstraint: constraint,
      ...promotionFields,
      cases: prefix.cases,
      schemaFingerprint: fp.fingerprint,
      cleanupStatus: doc.cleanupStatus,
      notes: notes.notes,
    });
    if (secretScan(JSON.stringify(canonical))) {
      return { ok: false, message: "Evidence contains secret-bearing content." };
    }
    return { ok: true, document: canonical };
  } catch {
    return { ok: false, message: "Hostile evidence document rejected." };
  }
}
