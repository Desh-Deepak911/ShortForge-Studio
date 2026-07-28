/**
 * Sprint 11E Phase 2B.2D.1A — progressive evidence authority (deterministic, no remote DB).
 * Run: npm run test:headless-neon-progressive-evidence-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";

import { checksumPrefix } from "../neon-live/evidence";
import {
  sanitizeProgressiveConstraintId,
  sanitizeProgressiveControlPlaneCode,
  sanitizeProgressiveSqlState,
} from "../neon-live/progressive-diagnostic-allowlists";
import {
  preserveOrInitializeNeonProgressiveEvidence,
  renderNeonProgressiveEvidenceMarkdown,
  writeNeonProgressiveEvidence,
} from "../neon-live/progressive-evidence";
import {
  buildProgressiveEvidenceNotes,
  createNotTestedProgressiveEvidence,
  PROGRESSIVE_ELIGIBILITY,
  PROGRESSIVE_EVIDENCE_TITLE,
  validateNeonProgressiveEvidence,
  type NeonProgressiveDiagnosticDocument,
} from "../neon-live/progressive-evidence-authority";
import { emptyPromotionDiagnosticFields } from "../neon-live/promotion-diagnostic";
import { runNeonProgressiveDiagnostic } from "../neon-live/run-neon-progressive-diagnostic";
import {
  createExactPassCaseResults,
  REQUIRED_NEON_LIVE_CASE_IDS,
} from "../neon-live/required-cases";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fingerprint() {
  const sources = discoverHeadlessMigrationSources();
  return {
    migrationIds: sources.map((s) => s.migrationId),
    checksumPrefixes: sources.map((s) => checksumPrefix(s.checksumSha256)),
  };
}

function baseFailDoc(
  partial: Partial<NeonProgressiveDiagnosticDocument>,
): NeonProgressiveDiagnosticDocument {
  const fp = fingerprint();
  return {
    title: PROGRESSIVE_EVIDENCE_TITLE,
    overall: "FAIL",
    eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.FAIL_MATRIX,
    startedAtIso: "2026-07-20T10:00:00.000Z",
    endedAtIso: "2026-07-20T10:00:01.000Z",
    lastCompletedRequiredCase: null,
    activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
    safeOperationStage: "ownership",
    safeControlPlaneCode: null,
    allowlistedSqlState: null,
    allowlistedConstraint: null,
    ...emptyPromotionDiagnosticFields(),
    cases: [
      {
        caseId: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
        status: "FAIL",
        failureCategory: "CLAIM_FAILED",
      },
    ],
    schemaFingerprint: fp,
    cleanupStatus: "ok",
    notes: buildProgressiveEvidenceNotes({
      connectionFactoryCalls: 1,
      casesRecorded: 1,
    }),
    ...partial,
  };
}

function exactPassDoc(): NeonProgressiveDiagnosticDocument {
  const fp = fingerprint();
  const cases = createExactPassCaseResults();
  return {
    title: PROGRESSIVE_EVIDENCE_TITLE,
    overall: "PASS",
    eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.PASS,
    startedAtIso: "2026-07-20T10:00:00.000Z",
    endedAtIso: "2026-07-20T10:00:05.000Z",
    lastCompletedRequiredCase:
      REQUIRED_NEON_LIVE_CASE_IDS[REQUIRED_NEON_LIVE_CASE_IDS.length - 1]!,
    activeFailedCase: null,
    safeOperationStage: null,
    safeControlPlaneCode: null,
    allowlistedSqlState: null,
    allowlistedConstraint: null,
    ...emptyPromotionDiagnosticFields(),
    cases,
    schemaFingerprint: fp,
    cleanupStatus: "ok",
    notes: buildProgressiveEvidenceNotes({
      connectionFactoryCalls: 1,
      casesRecorded: cases.length,
    }),
  };
}

function expectReject(doc: unknown, expectedMigration = true): void {
  const fp = fingerprint();
  const result = validateNeonProgressiveEvidence({
    document: doc,
    expectedMigrationIds: expectedMigration ? fp.migrationIds : undefined,
    expectedChecksumPrefixes: expectedMigration
      ? fp.checksumPrefixes
      : undefined,
  });
  assert.equal(result.ok, false);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2B.2D.1A — progressive evidence authority\n",
  );

  const fp = fingerprint();

  await test("positive: exact 29-case PASS", () => {
    const result = validateNeonProgressiveEvidence({
      document: exactPassDoc(),
      expectedMigrationIds: fp.migrationIds,
      expectedChecksumPrefixes: fp.checksumPrefixes,
    });
    assert.equal(result.ok, true);
  });

  await test("positive: failure at first required case", () => {
    const result = validateNeonProgressiveEvidence({
      document: baseFailDoc({}),
      expectedMigrationIds: fp.migrationIds,
      expectedChecksumPrefixes: fp.checksumPrefixes,
    });
    assert.equal(result.ok, true);
  });

  await test("positive: failure in the middle", () => {
    const mid = 4;
    const cases = REQUIRED_NEON_LIVE_CASE_IDS.slice(0, mid + 1).map((id, i) =>
      i < mid
        ? { caseId: id, status: "PASS" as const }
        : {
            caseId: id,
            status: "FAIL" as const,
            failureCategory: "PROVISIONAL_CREATE_FAILED" as const,
          },
    );
    const result = validateNeonProgressiveEvidence({
      document: baseFailDoc({
        cases,
        lastCompletedRequiredCase: REQUIRED_NEON_LIVE_CASE_IDS[mid - 1]!,
        activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[mid]!,
        safeOperationStage: "provisional_create",
        safeControlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
        allowlistedSqlState: "22P05",
        notes: buildProgressiveEvidenceNotes({
          connectionFactoryCalls: 1,
          casesRecorded: cases.length,
        }),
      }),
      expectedMigrationIds: fp.migrationIds,
      expectedChecksumPrefixes: fp.checksumPrefixes,
    });
    assert.equal(result.ok, true);
  });

  await test("positive: failure at final required case", () => {
    const last = REQUIRED_NEON_LIVE_CASE_IDS.length - 1;
    const cases = REQUIRED_NEON_LIVE_CASE_IDS.map((id, i) =>
      i < last
        ? { caseId: id, status: "PASS" as const }
        : {
            caseId: id,
            status: "FAIL" as const,
            failureCategory: "MALFORMED_NOT_REJECTED" as const,
          },
    );
    const result = validateNeonProgressiveEvidence({
      document: baseFailDoc({
        cases,
        lastCompletedRequiredCase: REQUIRED_NEON_LIVE_CASE_IDS[last - 1]!,
        activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[last]!,
        safeOperationStage: "malformed_probe",
        notes: buildProgressiveEvidenceNotes({
          connectionFactoryCalls: 1,
          casesRecorded: cases.length,
        }),
      }),
      expectedMigrationIds: fp.migrationIds,
      expectedChecksumPrefixes: fp.checksumPrefixes,
    });
    assert.equal(result.ok, true);
  });

  await test("positive: pre-case bootstrap failure", () => {
    const result = validateNeonProgressiveEvidence({
      document: {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.FAIL_BOOTSTRAP,
        startedAtIso: "2026-07-20T10:00:00.000Z",
        endedAtIso: "2026-07-20T10:00:01.000Z",
        lastCompletedRequiredCase: null,
        activeFailedCase: "matrix.exception",
        safeOperationStage: "matrix_bootstrap",
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
    ...emptyPromotionDiagnosticFields(),
        cases: [
          {
            caseId: "matrix.exception",
            status: "FAIL",
            failureCategory: "MATRIX_EXCEPTION",
          },
        ],
        schemaFingerprint: null,
        cleanupStatus: "ok",
        notes: buildProgressiveEvidenceNotes({
          connectionFactoryCalls: 0,
          casesRecorded: 1,
        }),
      },
    });
    assert.equal(result.ok, true);
  });

  await test("positive: gate-off initial NOT_TESTED", () => {
    const result = validateNeonProgressiveEvidence({
      document: createNotTestedProgressiveEvidence(),
    });
    assert.equal(result.ok, true);
  });

  await test("negative: one PASS case cannot PASS", () => {
    expectReject({
      ...exactPassDoc(),
      cases: [{ caseId: REQUIRED_NEON_LIVE_CASE_IDS[0]!, status: "PASS" }],
      lastCompletedRequiredCase: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
    });
  });

  await test("negative: 28 PASS cases cannot PASS", () => {
    expectReject({
      ...exactPassDoc(),
      cases: createExactPassCaseResults().slice(0, 28),
      lastCompletedRequiredCase: REQUIRED_NEON_LIVE_CASE_IDS[27]!,
    });
  });

  await test("negative: missing final case cannot PASS", () => {
    expectReject({
      ...exactPassDoc(),
      cases: createExactPassCaseResults().slice(0, 28),
    });
  });

  await test("negative: duplicate case cannot PASS", () => {
    const cases = [...createExactPassCaseResults()];
    cases[1] = cases[0]!;
    expectReject({ ...exactPassDoc(), cases });
  });

  await test("negative: unknown case cannot PASS", () => {
    const cases = [...createExactPassCaseResults()];
    cases[0] = { caseId: "job.not_a_real_case", status: "PASS" };
    expectReject({ ...exactPassDoc(), cases });
  });

  await test("negative: extra case cannot PASS", () => {
    expectReject({
      ...exactPassDoc(),
      cases: [
        ...createExactPassCaseResults(),
        { caseId: "job.extra", status: "PASS" },
      ],
    });
  });

  await test("negative: PASS with active failure", () => {
    expectReject({
      ...exactPassDoc(),
      activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
    });
  });

  await test("negative: PASS with wrong last-completed case", () => {
    expectReject({
      ...exactPassDoc(),
      lastCompletedRequiredCase: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
    });
  });

  await test("negative: FAIL with non-prefix cases", () => {
    expectReject(
      baseFailDoc({
        cases: [
          {
            caseId: REQUIRED_NEON_LIVE_CASE_IDS[2]!,
            status: "FAIL",
            failureCategory: "CLAIM_FAILED",
          },
        ],
        activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[2]!,
      }),
    );
  });

  await test("negative: FAIL with two failures", () => {
    expectReject(
      baseFailDoc({
        cases: [
          {
            caseId: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
            status: "FAIL",
            failureCategory: "CLAIM_FAILED",
          },
          {
            caseId: REQUIRED_NEON_LIVE_CASE_IDS[1]!,
            status: "FAIL",
            failureCategory: "ACCESS_FAILED",
          },
        ],
        activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[1]!,
      }),
    );
  });

  await test("negative: FAIL with a case after failure", () => {
    expectReject(
      baseFailDoc({
        cases: [
          {
            caseId: REQUIRED_NEON_LIVE_CASE_IDS[0]!,
            status: "FAIL",
            failureCategory: "CLAIM_FAILED",
          },
          { caseId: REQUIRED_NEON_LIVE_CASE_IDS[1]!, status: "PASS" },
        ],
      }),
    );
  });

  await test("negative: attribution mismatch", () => {
    expectReject(
      baseFailDoc({
        activeFailedCase: REQUIRED_NEON_LIVE_CASE_IDS[1]!,
      }),
    );
  });

  await test("negative: arbitrary control-plane code", () => {
    assert.equal(
      sanitizeProgressiveControlPlaneCode("SELECT * FROM secrets"),
      null,
    );
    assert.equal(
      sanitizeProgressiveControlPlaneCode("TOTALLY_MADE_UP_CODE"),
      null,
    );
    expectReject(
      baseFailDoc({
        safeControlPlaneCode: "TOTALLY_MADE_UP_CODE",
      }),
    );
  });

  await test("negative: regex-valid but unowned constraint", () => {
    assert.equal(
      sanitizeProgressiveConstraintId("pg_authid_rolname_index"),
      null,
    );
    expectReject(
      baseFailDoc({
        allowlistedConstraint: "pg_authid_rolname_index",
      }),
    );
  });

  await test("negative: unknown SQLSTATE", () => {
    assert.equal(sanitizeProgressiveSqlState("99999"), null);
    assert.equal(sanitizeProgressiveSqlState("22P05"), "22P05");
    expectReject(
      baseFailDoc({
        allowlistedSqlState: "99999",
      }),
    );
  });

  await test("negative: secret/newline/backtick injection", () => {
    expectReject({
      ...exactPassDoc(),
      notes: ["password=supersecret\n`DROP TABLE`"],
    });
    expectReject({
      ...exactPassDoc(),
      eligibilityVerdict: "ELIGIBLE\n<script>alert(1)</script>",
    });
    const poisoned = exactPassDoc();
    const md = renderNeonProgressiveEvidenceMarkdown({
      ...poisoned,
      activeFailedCase: "none`\n- injected",
    });
    assert.equal(md.includes("injected"), false);
    assert.equal(md.includes("<script>"), false);
  });

  await test("negative: hostile Proxy/getters/cycle/null-prototype", () => {
    const cycle: Record<string, unknown> = {
      ...exactPassDoc(),
    };
    cycle.self = cycle;
    expectReject(cycle);

    const protoNull = Object.assign(Object.create(null), exactPassDoc());
    // null prototype is allowed by isPlainObject — ensure key set still enforced
    const withExtra = Object.assign(Object.create(null), {
      ...exactPassDoc(),
      evil: "x",
    });
    expectReject(withExtra);

    const proxy = new Proxy(exactPassDoc(), {
      get(target, prop, receiver) {
        if (prop === "cases") throw new Error("getter");
        return Reflect.get(target, prop, receiver);
      },
    });
    expectReject(proxy);
    void protoNull;
  });

  await test("negative: cleanup failure cannot PASS", () => {
    expectReject({
      ...exactPassDoc(),
      cleanupStatus: "failed",
    });
  });

  await test("negative: incoherent timestamps/fingerprint", () => {
    expectReject({
      ...exactPassDoc(),
      endedAtIso: "2026-07-20T09:00:00.000Z",
      startedAtIso: "2026-07-20T10:00:00.000Z",
    });
    expectReject({
      ...exactPassDoc(),
      schemaFingerprint: {
        migrationIds: ["not-a-real-migration"],
        checksumPrefixes: ["aaaaaaaaaaaa"],
      },
    });
  });

  await test("gate-off prior evidence preservation", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "prog-ev-"));
    const evidencePath = path.join(dir, "progressive.md");
    const pass = validateNeonProgressiveEvidence({
      document: exactPassDoc(),
      expectedMigrationIds: fp.migrationIds,
      expectedChecksumPrefixes: fp.checksumPrefixes,
    });
    assert.equal(pass.ok, true);
    if (!pass.ok) return;
    writeNeonProgressiveEvidence({ evidencePath, document: pass.document });
    const before = readFileSync(evidencePath, "utf8");
    const preserved = preserveOrInitializeNeonProgressiveEvidence({
      evidencePath,
    });
    assert.equal(preserved.action, "preserved");
    assert.equal(preserved.overall, "PASS");
    assert.equal(readFileSync(evidencePath, "utf8"), before);

    let dbCalls = 0;
    const result = await runNeonProgressiveDiagnostic({
      env: {},
      evidencePath,
      createSqlExecutor: () => {
        dbCalls += 1;
        throw new Error("must not connect");
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(dbCalls, 0);
    assert.equal(readFileSync(evidencePath, "utf8"), before);
  });

  await test("gate-off initializes NOT_TESTED when absent", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "prog-ev-init-"));
    const evidencePath = path.join(dir, "progressive.md");
    assert.equal(existsSync(evidencePath), false);
    const result = await runNeonProgressiveDiagnostic({
      env: {},
      evidencePath,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(existsSync(evidencePath), true);
    assert.match(readFileSync(evidencePath, "utf8"), /NOT_TESTED/);
  });

  await test("allowlisted codes accept known stable IDs", () => {
    assert.equal(
      sanitizeProgressiveControlPlaneCode("JOB_STORE_COHERENCE_REJECTED"),
      "JOB_STORE_COHERENCE_REJECTED",
    );
    assert.equal(
      sanitizeProgressiveConstraintId("headless_jobs_pkey"),
      "headless_jobs_pkey",
    );
    assert.equal(sanitizeProgressiveSqlState("23505"), "23505");
  });

  await test("write rejects non-branded document", () => {
    assert.throws(() =>
      writeNeonProgressiveEvidence({
        evidencePath: path.join(tmpdir(), "x.md"),
        document: exactPassDoc() as never,
      }),
    );
  });

  // silence unused
  void writeFileSync;

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  console.log(
    "\nFAIL — progressive evidence authority terminated unexpectedly.\n",
  );
  process.exitCode = 1;
});
