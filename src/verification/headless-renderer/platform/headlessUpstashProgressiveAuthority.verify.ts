/**
 * Sprint 11E Phase 2D.1D — progressive harness gate/evidence authority (no provider).
 * Run: npm run test:headless-upstash-progressive-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import { createPassingUpstashLiveCaseRunners } from "../upstash-live/live-matrix";
import {
  createNotTestedUpstashProgressiveEvidence,
  preserveOrInitializeUpstashProgressiveEvidence,
  progressiveCannotFalsePass,
  renderUpstashProgressiveEvidenceMarkdown,
} from "../upstash-live/progressive-evidence";
import { runUpstashProgressiveHarness } from "../upstash-live/run-upstash-progressive-harness";
import { REQUIRED_UPSTASH_LIVE_CASE_IDS } from "../upstash-live/required-cases";

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

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1D — Upstash progressive harness authority\n",
  );

  await test("gate-off opens zero connections and preserves PASS", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-prog-gate-"));
    const evidencePath = path.join(dir, "progressive.md");
    writeFileSync(
      evidencePath,
      renderUpstashProgressiveEvidenceMarkdown({
        ...createNotTestedUpstashProgressiveEvidence(),
        overall: "PASS",
        eligibilityVerdict: "prior",
        cleanupStatus: "ok",
        cases: REQUIRED_UPSTASH_LIVE_CASE_IDS.map((caseId) => ({
          caseId,
          status: "PASS" as const,
        })),
      }),
      "utf8",
    );
    const before = readFileSync(evidencePath, "utf8");
    let connections = 0;
    const result = await runUpstashProgressiveHarness({
      env: {},
      evidencePath,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(connections, 0);
    assert.equal(readFileSync(evidencePath, "utf8"), before);
    const preserved = preserveOrInitializeUpstashProgressiveEvidence(
      evidencePath,
    );
    assert.equal(preserved.overall, "PASS");
    assert.equal(preserved.action, "preserved");
  });

  await test("gate-off initializes NOT_TESTED when absent", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-prog-init-"));
    const evidencePath = path.join(dir, "progressive.md");
    const result = await runUpstashProgressiveHarness({
      env: {},
      evidencePath,
    });
    assert.equal(result.exitCode, 0);
    assert.ok(readFileSync(evidencePath, "utf8").includes("NOT_TESTED"));
  });

  await test("progressive false-PASS rejected", async () => {
    const rejected = progressiveCannotFalsePass({
      cases: [
        { caseId: "env.producer.config", status: "PASS" },
        {
          caseId: "env.consumer.config",
          status: "FAIL",
          failureCategory: "ENV_CONSUMER_FAILED",
        },
      ],
      cleanupStatus: "ok",
      claimedOverall: "PASS",
    });
    assert.equal(rejected.ok, false);
  });

  await test("injected happy path uses DEFAULT runner import surface", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-prog-pass-"));
    const evidencePath = path.join(dir, "progressive.md");
    const stream = new MemoryHeadlessStreamQueueAdapter({
      envName: "staging",
      nowMs: () => 1_700_000_000_000,
    });
    await stream.ensureConsumerGroups();
    const result = await runUpstashProgressiveHarness({
      forceGateOn: true,
      assumeConfigured: true,
      skipStubCheck: true,
      evidencePath,
      env: {
        HEADLESS_UPSTASH_QA_PROGRESSIVE: "1",
        HEADLESS_ENV_NAME: "staging",
        DATABASE_URL:
          "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
        UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
      },
      injectedSql: noopSql(),
      injectedRestProducer: stream,
      injectedTcpConsumer: stream,
      injectedStreamQueue: stream,
      injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
      injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
      injectedFingerprint: buildUpstashLiveSchemaFingerprint(),
      caseRunners: createPassingUpstashLiveCaseRunners(),
      cleanupRunner: async () => "ok",
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "PASS");
    assert.ok(
      readFileSync(evidencePath, "utf8").includes(
        "Upstash progressive diagnostic evidence",
      ),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
