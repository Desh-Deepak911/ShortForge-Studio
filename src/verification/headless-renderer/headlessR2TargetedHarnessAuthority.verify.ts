/**
 * Sprint 11E Phase 2C.1B — R2 targeted harness authority (deterministic, no remote).
 * Run: npm run test:headless-r2-targeted-harness-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";

import {
  checksumPrefix,
  createNotTestedR2TargetedEvidence,
  defaultR2OfficialLiveEvidencePath,
  renderR2TargetedEvidenceMarkdown,
  R2_OFFICIAL_LIVE_EVIDENCE_RELATIVE_PATH,
  type R2TargetedCaseEvidence,
} from "./r2-targeted/evidence";
import { validatePassR2TargetedEvidence } from "./r2-targeted/evidence-authority";
import {
  assertExactRequiredR2TargetedCasePassAuthority,
  createExactPassR2TargetedCaseResults,
  REQUIRED_R2_TARGETED_CASE_IDS,
} from "./r2-targeted/required-cases";
import { createPassingR2TargetedRunners } from "./r2-targeted/targeted-matrix";
import { runR2TargetedHarness } from "./r2-targeted/run-r2-targeted-harness";

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

async function main() {
  console.log(
    "\nSprint 11E Phase 2C.1B — R2 targeted harness authority\n",
  );

  await test("gate off → NOT_TESTED and zero connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "r2-targeted-"));
    const evidencePath = path.join(dir, "evidence.md");
    let dbCalls = 0;
    const result = await runR2TargetedHarness({
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
    assert.equal(existsSync(evidencePath), true);
  });

  await test("does not overwrite official LIVE evidence path", async () => {
    const officialPath = defaultR2OfficialLiveEvidencePath();
    assert.ok(
      officialPath.endsWith(R2_OFFICIAL_LIVE_EVIDENCE_RELATIVE_PATH),
    );
    const before = existsSync(officialPath)
      ? readFileSync(officialPath, "utf8")
      : null;

    const dir = mkdtempSync(path.join(tmpdir(), "r2-targeted-"));
    const evidencePath = path.join(dir, "targeted.md");
    await runR2TargetedHarness({ env: {}, evidencePath });

    const after = existsSync(officialPath)
      ? readFileSync(officialPath, "utf8")
      : null;
    assert.equal(after, before);

    // writeR2TargetedEvidence refuses official relative path suffix.
    let threw = false;
    try {
      const { writeR2TargetedEvidence } = await import(
        "./r2-targeted/evidence"
      );
      writeR2TargetedEvidence({
        evidencePath: officialPath,
        document: createNotTestedR2TargetedEvidence(),
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true);

    const afterRefuse = existsSync(officialPath)
      ? readFileSync(officialPath, "utf8")
      : null;
    assert.equal(afterRefuse, before);
  });

  await test("exact targeted membership authority", () => {
    assert.deepEqual([...REQUIRED_R2_TARGETED_CASE_IDS], [
      "env.config",
      "staging.same_snapshot_create",
      "upload.put_bytes",
      "metadata.head",
      "verify.finalize",
      "coverage.reconcile",
      "evidence.privacy",
      "cleanup.verify",
    ]);
    assert.equal(REQUIRED_R2_TARGETED_CASE_IDS.length, 8);
    const partial: R2TargetedCaseEvidence[] = [
      { caseId: "env.config", status: "PASS" },
    ];
    const bad = assertExactRequiredR2TargetedCasePassAuthority(partial);
    assert.equal(bad.ok, false);
    const good = assertExactRequiredR2TargetedCasePassAuthority(
      createExactPassR2TargetedCaseResults(),
    );
    assert.equal(good.ok, true);
  });

  await test("PASS authority requires migrations 000/001/002/004 fingerprint", () => {
    const fp = fingerprint();
    assert.ok(fp.migrationIds.includes("000_headless_schema_migrations"));
    assert.ok(fp.migrationIds.includes("001_headless_project_ownership"));
    assert.ok(fp.migrationIds.includes("002_headless_jobs"));
    assert.ok(fp.migrationIds.includes("004_headless_owned_objects"));
    const validated = validatePassR2TargetedEvidence({
      document: {
        ...createNotTestedR2TargetedEvidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassR2TargetedCaseResults(),
        schemaFingerprint: {
          migrationIds: fp.migrationIds,
          checksumPrefixes: fp.checksumPrefixes,
        },
        cleanupStatus: "ok",
      },
      expectedMigrationIds: fp.migrationIds,
      expectedChecksumPrefixes: fp.checksumPrefixes,
    });
    assert.equal(validated.ok, true);
  });

  await test("injected passing runners → PASS authority without remote", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "r2-targeted-"));
    const evidencePath = path.join(dir, "evidence.md");
    const officialPath = defaultR2OfficialLiveEvidencePath();
    const beforeOfficial = existsSync(officialPath)
      ? readFileSync(officialPath, "utf8")
      : null;

    const result = await runR2TargetedHarness({
      env: { HEADLESS_R2_QA_TARGETED: "1" },
      evidencePath,
      forceGateOn: true,
      assumeConfigured: true,
      injectedExecutor: {
        withClient: async () => ({ rows: [], rowCount: 0 }),
        withTransaction: async (fn) =>
          fn({
            query: async () => ({ rows: [], rowCount: 0 }),
          } as never),
      } as never,
      runSchemaPreflight: async () => {
        const sources = discoverHeadlessMigrationSources();
        return {
          ok: true as const,
          fingerprint: {
            migrationIds: sources.map((s) => s.migrationId),
            checksums: sources.map((s) => s.checksumSha256),
          },
        };
      },
      caseRunners: createPassingR2TargetedRunners(),
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "PASS");

    const afterOfficial = existsSync(officialPath)
      ? readFileSync(officialPath, "utf8")
      : null;
    assert.equal(afterOfficial, beforeOfficial);
  });

  await test("gate off preserves prior PASS targeted evidence", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "r2-targeted-"));
    const evidencePath = path.join(dir, "evidence.md");
    const fp = fingerprint();
    writeFileSync(
      evidencePath,
      renderR2TargetedEvidenceMarkdown({
        ...createNotTestedR2TargetedEvidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE — prior pass",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassR2TargetedCaseResults(),
        schemaFingerprint: {
          migrationIds: fp.migrationIds,
          checksumPrefixes: fp.checksumPrefixes,
        },
        cleanupStatus: "ok",
      }),
      "utf8",
    );
    const result = await runR2TargetedHarness({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    const after = readFileSync(evidencePath, "utf8");
    assert.match(after, /\*\*Overall:\*\* PASS/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
