/**
 * Sprint 11E Phase 2C.1A — R2 live harness authority (deterministic, no remote).
 * Run: npm run test:headless-r2-live-harness-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { runR2LiveHarness } from "./r2-live/run-r2-live-harness";
import {
  checksumPrefix,
  createNotTestedR2Evidence,
  renderR2LiveEvidenceMarkdown,
  type R2LiveCaseEvidence,
} from "./r2-live/evidence";
import {
  assertExactRequiredR2LiveCasePassAuthority,
  createExactPassR2CaseResults,
  REQUIRED_R2_LIVE_CASE_IDS,
} from "./r2-live/required-cases";
import { createPassingR2LiveRunners } from "./r2-live/live-matrix";
import { validatePassR2LiveEvidence } from "./r2-live/evidence-authority";

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
  console.log("\nSprint 11E Phase 2C.1A — R2 live harness authority\n");

  await test("gate off → NOT_TESTED and zero connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "r2-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    let dbCalls = 0;
    const result = await runR2LiveHarness({
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

  await test("gate off preserves prior PASS evidence", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "r2-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const fp = fingerprint();
    writeFileSync(
      evidencePath,
      renderR2LiveEvidenceMarkdown({
        ...createNotTestedR2Evidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE — prior pass",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassR2CaseResults(),
        schemaFingerprint: {
          migrationIds: fp.migrationIds,
          checksumPrefixes: fp.checksumPrefixes,
        },
        cleanupStatus: "ok",
      }),
      "utf8",
    );
    const result = await runR2LiveHarness({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
  });

  await test("exact membership requires all frozen case IDs", () => {
    assert.ok(REQUIRED_R2_LIVE_CASE_IDS.includes("env.config"));
    assert.ok(REQUIRED_R2_LIVE_CASE_IDS.includes("finalize.neon_atomic"));
    assert.ok(REQUIRED_R2_LIVE_CASE_IDS.includes("evidence.privacy"));
    assert.equal(REQUIRED_R2_LIVE_CASE_IDS.length, 21);
    const partial: R2LiveCaseEvidence[] = [
      { caseId: "env.config", status: "PASS" },
    ];
    const bad = assertExactRequiredR2LiveCasePassAuthority(partial);
    assert.equal(bad.ok, false);
    const good = assertExactRequiredR2LiveCasePassAuthority(
      createExactPassR2CaseResults(),
    );
    assert.equal(good.ok, true);
  });

  await test("PASS authority requires migration 004 fingerprint", () => {
    const fp = fingerprint();
    assert.ok(fp.migrationIds.includes("004_headless_owned_objects"));
    const validated = validatePassR2LiveEvidence({
      document: {
        ...createNotTestedR2Evidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassR2CaseResults(),
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

  await test("injected passing runners exercise matrix order", async () => {
    const runners = createPassingR2LiveRunners();
    const cases = [];
    for (const id of REQUIRED_R2_LIVE_CASE_IDS) {
      cases.push(await runners[id]!({} as never));
    }
    const authority = assertExactRequiredR2LiveCasePassAuthority(cases);
    assert.equal(authority.ok, true);
  });

  await test("gate-on with injected runners + noop cleanup → PASS authority", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "r2-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const result = await runR2LiveHarness({
      env: { HEADLESS_R2_QA: "1" },
      evidencePath,
      forceGateOn: true,
      assumeConfigured: true,
      injectedExecutor: {
        withClient: async () => ({ rows: [], rowCount: 0 }),
        withTransaction: async (fn: (client: never) => Promise<unknown>) =>
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
      caseRunners: createPassingR2LiveRunners(),
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "PASS");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
