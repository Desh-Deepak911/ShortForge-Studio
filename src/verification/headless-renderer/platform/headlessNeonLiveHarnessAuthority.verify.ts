/**
 * Sprint 11E Phase 2B.2B.1 — Neon live harness authority (deterministic, no remote DB).
 * Run: npm run test:headless-neon-live-harness-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  NEON_LIVE_PLACEHOLDER_SUCCESS_BAN,
  runNeonLiveHarness,
} from "../neon-live/run-neon-live-harness";
import {
  createNotTestedEvidence,
  renderNeonLiveEvidenceMarkdown,
  writeNeonLiveEvidence,
  type NeonLiveCaseEvidence,
} from "../neon-live/evidence";
import {
  assertExactRequiredLiveCasePassAuthority,
  createExactPassCaseResults,
  REQUIRED_NEON_LIVE_CASE_IDS,
} from "../neon-live/required-cases";
import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { checksumPrefix } from "../neon-live/evidence";
import type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/runtime/sql-client";

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
    checksums: sources.map((s) => s.checksumSha256),
  };
}

function okPreflight() {
  const fp = fingerprint();
  return async () =>
    ({
      ok: true as const,
      fingerprint: fp,
    }) as const;
}

function noopSql(): HeadlessSqlExecutor {
  const client: HeadlessSqlClient = {
    query: async <Row extends Record<string, unknown>>() => ({
      rows: [] as Row[],
      rowCount: 0,
    }),
  };
  return {
    withClient: async <T>(fn: (c: HeadlessSqlClient) => Promise<T>) =>
      fn(client),
    withTransaction: async <T>(fn: (c: HeadlessSqlClient) => Promise<T>) =>
      fn(client),
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2B.2B.1 — Neon live harness authority\n");

  await test("gate off → NOT TESTED and zero database calls", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    let dbCalls = 0;
    const result = await runNeonLiveHarness({
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
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    writeFileSync(
      evidencePath,
      renderNeonLiveEvidenceMarkdown({
        ...createNotTestedEvidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE — prior pass",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassCaseResults(),
        cleanupStatus: "ok",
        schemaFingerprint: {
          migrationIds: ["000_headless_schema_migrations"],
          checksumPrefixes: ["abcdabcdabcd"],
        },
        notes: ["prior"],
      }),
      "utf8",
    );
    await runNeonLiveHarness({ env: {}, evidencePath });
    const after = readFileSync(evidencePath, "utf8");
    assert.match(after, /\*\*Overall:\*\* PASS/);
  });

  await test("gate on + missing config → non-zero", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    let dbCalls = 0;
    const result = await runNeonLiveHarness({
      env: { HEADLESS_NEON_QA: "1" },
      evidencePath,
      createSqlExecutor: () => {
        dbCalls += 1;
        throw new Error("must not connect");
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.overall, "CONFIGURATION_UNAVAILABLE");
    assert.equal(dbCalls, 0);
  });

  await test("gate on + schema missing → non-zero", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: async () => ({
        ok: false,
        code: "SCHEMA_MISSING",
        message: "missing",
      }),
      caseRunner: async () => {
        throw new Error("matrix must not run");
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.overall, "FAIL");
  });

  await test("one PASS case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => [
        { caseId: "ownership.first_claim", status: "PASS" },
      ],
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("missing required case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const cases = createExactPassCaseResults().slice(1);
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("duplicate case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const cases = [...createExactPassCaseResults()];
    cases[1] = { caseId: REQUIRED_NEON_LIVE_CASE_IDS[0]!, status: "PASS" };
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("unknown case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const cases: NeonLiveCaseEvidence[] = [
      ...createExactPassCaseResults().slice(0, -1),
      { caseId: "job.unknown_case", status: "PASS" },
    ];
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("malformed case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const cases = [
      ...createExactPassCaseResults().slice(0, -1),
      { caseId: "job.bigint_decoding", status: "PASS", extra: true },
    ] as unknown as NeonLiveCaseEvidence[];
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("hostile case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const hostile = new Proxy(
      { caseId: "ownership.first_claim", status: "PASS" },
      {
        get() {
          throw new Error("hostile");
        },
      },
    );
    const cases = [
      hostile,
      ...createExactPassCaseResults().slice(1),
    ] as unknown as NeonLiveCaseEvidence[];
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("extra case cannot exit 0", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const cases = [
      ...createExactPassCaseResults(),
      { caseId: "job.extra_case", status: "PASS" as const },
    ];
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("gate on + one failed case → non-zero", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const cases = [...createExactPassCaseResults()];
    cases[3] = {
      caseId: "job.provisional_create",
      status: "FAIL",
      failureCategory: "PROVISIONAL_CREATE_FAILED",
    };
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => cases,
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("gate on + cleanup failure → non-zero", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: okPreflight(),
      caseRunner: async () => createExactPassCaseResults(),
      cleanupRunner: async () => "failed",
    });
    assert.equal(result.exitCode, 1);
  });

  await test("gate on + exact cases + cleanup ok → zero", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const fp = fingerprint();
    let uuidCalls = 0;
    const result = await runNeonLiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      injectedExecutor: noopSql(),
      runSchemaPreflight: async () => ({ ok: true, fingerprint: fp }),
      caseRunner: async (ctx) => {
        ctx.uuid();
        uuidCalls += 1;
        return createExactPassCaseResults();
      },
      cleanupRunner: async () => "ok",
      writeEvidence: writeNeonLiveEvidence,
      randomUUID: () => {
        uuidCalls += 1;
        return "11111111-1111-4111-8111-111111111111";
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "PASS");
    assert.ok(uuidCalls >= 1);
    const md = readFileSync(evidencePath, "utf8");
    assert.match(md, /\*\*Overall:\*\* PASS/);
    assert.equal(md.includes("postgresql://"), false);
    for (const id of REQUIRED_NEON_LIVE_CASE_IDS) {
      assert.match(md, new RegExp(id.replace(/\./g, "\\.")));
    }
    assert.ok(md.includes(checksumPrefix(fp.checksums[0]!)));
  });

  await test("registry rejects weak every(PASS) authority", () => {
    const weak = assertExactRequiredLiveCasePassAuthority([
      { caseId: "ownership.first_claim", status: "PASS" },
    ]);
    assert.equal(weak.ok, false);
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/verification/headless-renderer/neon-live/run-neon-live-harness.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("cases.every((c) => c.status === \"PASS\")"), false);
    assert.equal(src.includes("cases.length > 0 &&"), false);
    assert.ok(src.includes("assertExactRequiredLiveCasePassAuthority"));
  });

  await test("placeholder gate-on success is impossible", () => {
    const liveSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/verification/headless-renderer/platform/headlessNeonLive.verify.ts",
      ),
      "utf8",
    );
    const harnessSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/verification/headless-renderer/neon-live/run-neon-live-harness.ts",
      ),
      "utf8",
    );
    assert.equal(liveSrc.includes("not implemented in this phase"), false);
    assert.equal(liveSrc.includes(NEON_LIVE_PLACEHOLDER_SUCCESS_BAN), false);
    assert.ok(harnessSrc.includes("validatePassNeonLiveEvidence"));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
