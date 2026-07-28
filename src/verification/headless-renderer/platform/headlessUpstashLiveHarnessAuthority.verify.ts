/**
 * Sprint 11E Phase 2D.1A — Upstash live harness authority (deterministic, no remote).
 * Run: npm run test:headless-upstash-live-harness-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { HEADLESS_QUEUE_PROTOCOL_VERSION } from "@/features/headless-renderer/control-plane";
import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { runUpstashLiveHarness } from "../upstash-live/run-upstash-live-harness";
import {
  createNotTestedUpstashEvidence,
  renderUpstashLiveEvidenceMarkdown,
  type UpstashLiveCaseEvidence,
} from "../upstash-live/evidence";
import {
  assertExactRequiredUpstashLiveCasePassAuthority,
  assertExactRequiredUpstashLiveCasePrefixFailAuthority,
  createExactPassUpstashCaseResults,
  REQUIRED_UPSTASH_LIVE_CASE_IDS,
} from "../upstash-live/required-cases";
import { createPassingUpstashLiveCaseRunners } from "../upstash-live/live-matrix";
import {
  buildUpstashLiveSchemaFingerprint,
  validatePassUpstashLiveEvidence,
  UPSTASH_LIVE_REQUIRED_MIGRATION_IDS,
} from "../upstash-live/evidence-authority";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function noopSql(): HeadlessSqlExecutor {
  const client = {
    async query<T = Record<string, unknown>>() {
      return { rows: [{ n: "0" }] as T[] };
    },
  };
  return {
    async withClient(fn) {
      return fn(client as never);
    },
    async withTransaction(fn) {
      return fn(client as never);
    },
  };
}

const CONFIGURED_ENV = {
  HEADLESS_UPSTASH_QA: "1",
  HEADLESS_ENV_NAME: "staging",
  DATABASE_URL:
    "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
  UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
};

async function main() {
  console.log("\nSprint 11E Phase 2D.1A — Upstash live harness authority\n");

  await test("gate off → NOT_TESTED and zero connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "upstash-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    let connections = 0;
    const result = await runUpstashLiveHarness({
      env: {},
      evidencePath,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(connections, 0);
    assert.equal(existsSync(evidencePath), true);
  });

  await test("gate off preserves prior PASS evidence", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "upstash-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const fp = buildUpstashLiveSchemaFingerprint();
    writeFileSync(
      evidencePath,
      renderUpstashLiveEvidenceMarkdown({
        ...createNotTestedUpstashEvidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE — prior pass",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassUpstashCaseResults(),
        schemaFingerprint: fp,
        cleanupStatus: "ok",
      }),
      "utf8",
    );
    const before = readFileSync(evidencePath, "utf8");
    const result = await runUpstashLiveHarness({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(readFileSync(evidencePath, "utf8"), before);
  });

  await test("exact membership requires all frozen case IDs", () => {
    assert.equal(REQUIRED_UPSTASH_LIVE_CASE_IDS.length, 22);
    assert.ok(REQUIRED_UPSTASH_LIVE_CASE_IDS.includes("env.producer.config"));
    assert.ok(REQUIRED_UPSTASH_LIVE_CASE_IDS.includes("evidence.privacy"));
    const partial: UpstashLiveCaseEvidence[] = [
      { caseId: "env.producer.config", status: "PASS" },
    ];
    const bad = assertExactRequiredUpstashLiveCasePassAuthority(partial);
    assert.equal(bad.ok, false);
    const good = assertExactRequiredUpstashLiveCasePassAuthority(
      createExactPassUpstashCaseResults(),
    );
    assert.equal(good.ok, true);
  });

  await test("PASS authority requires cleanup ok|preserved", () => {
    const fp = buildUpstashLiveSchemaFingerprint();
    const base = {
      ...createNotTestedUpstashEvidence(),
      overall: "PASS" as const,
      eligibilityVerdict: "ELIGIBLE",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:01:00.000Z",
      cases: createExactPassUpstashCaseResults(),
      schemaFingerprint: fp,
    };
    assert.equal(
      validatePassUpstashLiveEvidence({ ...base, cleanupStatus: "skipped" }).ok,
      false,
    );
    assert.equal(
      validatePassUpstashLiveEvidence({ ...base, cleanupStatus: "ok" }).ok,
      true,
    );
  });

  await test("PASS authority requires Neon 000/001/002/004 + protocol", () => {
    assert.deepEqual(
      [...UPSTASH_LIVE_REQUIRED_MIGRATION_IDS],
      [
        "000_headless_schema_migrations",
        "001_headless_project_ownership",
        "002_headless_jobs",
        "004_headless_owned_objects",
      ],
    );
    const fp = buildUpstashLiveSchemaFingerprint();
    assert.equal(fp.queueProtocolVersion, HEADLESS_QUEUE_PROTOCOL_VERSION);
    const doc = {
      ...createNotTestedUpstashEvidence(),
      overall: "PASS" as const,
      eligibilityVerdict: "ELIGIBLE",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:01:00.000Z",
      cases: createExactPassUpstashCaseResults(),
      schemaFingerprint: fp,
      cleanupStatus: "ok" as const,
    };
    assert.equal(validatePassUpstashLiveEvidence(doc).ok, true);
  });

  await test("prefix-FAIL authority accepts PASS* + FAIL + NOT_TESTED*", () => {
    const cases: UpstashLiveCaseEvidence[] = REQUIRED_UPSTASH_LIVE_CASE_IDS.map(
      (caseId, i) => {
        if (i < 2) return { caseId, status: "PASS" as const };
        if (i === 2) {
          return {
            caseId,
            status: "FAIL" as const,
            failureCategory: "LEASE_SETTINGS_FAILED",
          };
        }
        return { caseId, status: "NOT_TESTED" as const };
      },
    );
    const prefix = assertExactRequiredUpstashLiveCasePrefixFailAuthority(cases);
    assert.equal(prefix.ok, true);
    if (prefix.ok) {
      assert.equal(prefix.failedCaseId, "env.lease.settings");
    }
  });

  await test(
    "force gate-on with injected ports + passing runners → PASS",
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "upstash-live-"));
      const evidencePath = path.join(dir, "evidence.md");
      const stream = new MemoryHeadlessStreamQueueAdapter({
        envName: "staging",
      });
      const result = await runUpstashLiveHarness({
        forceGateOn: true,
        assumeConfigured: true,
        evidencePath,
        env: CONFIGURED_ENV,
        caseRunners: createPassingUpstashLiveCaseRunners(),
        injectedSql: noopSql(),
        injectedRestProducer: stream,
        injectedTcpConsumer: stream,
        injectedStreamQueue: stream,
        injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
        injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
        injectedProjectAuthorization:
          new MemoryHeadlessProjectOwnershipAdapter(),
        injectedFingerprint: buildUpstashLiveSchemaFingerprint(),
        cleanupRunner: async () => "ok",
      });
      assert.equal(result.exitCode, 0);
      assert.equal(result.overall, "PASS");
    },
  );

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
