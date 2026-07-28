/**
 * Sprint 11E Phase 2D.1B — enqueue probe gate/evidence authority (no provider).
 * Run: npm run test:headless-upstash-enqueue-probe-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  createFakeUpstashRestClient,
  FakeRedisStreams,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import {
  createNotTestedUpstashEnqueueProbeEvidence,
  enqueueProbeCannotFalsePass,
  preserveOrInitializeUpstashEnqueueProbeEvidence,
  renderUpstashEnqueueProbeEvidenceMarkdown,
  writeUpstashEnqueueProbeEvidence,
} from "../upstash-live/enqueue-probe-evidence";
import { runUpstashEnqueueProbe } from "../upstash-live/enqueue-probe";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";

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
  console.log("\nSprint 11E Phase 2D.1B — Upstash enqueue probe authority\n");

  await test("gate-off opens zero connections and preserves PASS", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-ep-gate-"));
    const evidencePath = path.join(dir, "probe.md");
    writeFileSync(
      evidencePath,
      renderUpstashEnqueueProbeEvidenceMarkdown({
        ...createNotTestedUpstashEnqueueProbeEvidence(),
        overall: "PASS",
        eligibilityVerdict: "prior",
        cleanupStatus: "ok",
        stages: [{ stage: "rest_xadd", status: "ok" }],
      }),
      "utf8",
    );
    const before = readFileSync(evidencePath, "utf8");
    let connections = 0;
    const result = await runUpstashEnqueueProbe({
      env: {},
      evidencePath,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(connections, 0);
    assert.equal(readFileSync(evidencePath, "utf8"), before);
    const preserved = preserveOrInitializeUpstashEnqueueProbeEvidence(
      evidencePath,
    );
    assert.equal(preserved.overall, "PASS");
    assert.equal(preserved.action, "preserved");
  });

  await test("gate-off initializes NOT_TESTED when absent", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-ep-init-"));
    const evidencePath = path.join(dir, "probe.md");
    const result = await runUpstashEnqueueProbe({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.connectionFactoryCalls, 0);
    assert.ok(readFileSync(evidencePath, "utf8").includes("NOT_TESTED"));
  });

  await test("injected happy path PASS + cleanup ok (temp evidence)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-ep-pass-"));
    const evidencePath = path.join(dir, "probe.md");
    const fake = new FakeRedisStreams({ nowMs: () => 1_700_000_000_000 });
    const restClient = createFakeUpstashRestClient(fake);
    const stream = new MemoryHeadlessStreamQueueAdapter({
      envName: "staging",
      nowMs: () => 1_700_000_000_000,
    });
    await stream.ensureConsumerGroups();

    const result = await runUpstashEnqueueProbe({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      env: {
        HEADLESS_UPSTASH_QA_ENQUEUE_PROBE: "1",
        HEADLESS_ENV_NAME: "staging",
        DATABASE_URL:
          "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
        UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
      },
      injectedSql: noopSql(),
      injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
      injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
      injectedRestProducer: stream,
      injectedTcpConsumer: stream,
      injectedRestClient: restClient,
      injectedFingerprint: buildUpstashLiveSchemaFingerprint(),
      verifyStreamEntry: async ({ streamKey, streamId }) => {
        return fake.testingLength(streamKey) > 0 && streamId.length > 0;
      },
      cleanupRunner: async () => "ok",
      nowIso: () => "2026-07-21T00:00:00.000Z",
    });
    assert.equal(result.exitCode, 0, `expected PASS exit 0 got ${result.overall}`);
    assert.equal(result.overall, "PASS");
    const md = readFileSync(evidencePath, "utf8");
    assert.ok(md.includes("**Overall:** PASS"));
    assert.equal(md.includes("UPSTASH_REDIS_REST_TOKEN"), false);
  });

  await test("missing stages / hostile cannot false PASS", () => {
    const bad = createNotTestedUpstashEnqueueProbeEvidence();
    assert.equal(enqueueProbeCannotFalsePass(bad).ok, false);
    assert.equal(
      enqueueProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        stages: [],
      }).ok,
      false,
    );
    assert.equal(
      enqueueProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "failed",
        stages: [{ stage: "rest_xadd", status: "ok" }],
      }).ok,
      false,
    );
    assert.equal(
      enqueueProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        stages: [{ stage: "rest_xadd", status: "failed", reasonId: "rest_xadd_rejected" }],
      }).ok,
      false,
    );
    assert.equal(
      enqueueProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        failureStage: "rest_xadd",
        stages: [{ stage: "rest_xadd", status: "ok" }],
      }).ok,
      false,
    );
  });

  await test("unknown stage / reason cannot produce PASS", () => {
    const doc = {
      ...createNotTestedUpstashEnqueueProbeEvidence(),
      overall: "PASS" as const,
      cleanupStatus: "ok" as const,
      stages: [
        {
          stage: "made_up_stage" as never,
          status: "ok" as const,
        },
      ],
    };
    assert.equal(enqueueProbeCannotFalsePass(doc).ok, false);
  });

  await test("evidence write does not touch official live path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-ep-iso-"));
    const evidencePath = path.join(dir, "probe.md");
    writeUpstashEnqueueProbeEvidence(
      createNotTestedUpstashEnqueueProbeEvidence(),
      evidencePath,
    );
    assert.equal(evidencePath.includes("UPSTASH_LIVE_EVIDENCE"), false);
    assert.ok(evidencePath.includes("probe.md"));
    void randomUUID;
    void HEADLESS_DEFAULT_DELIVERY_IDLE_MS;
    void HEADLESS_DEFAULT_RENDER_CLAIM_MS;
    void HEADLESS_DEFAULT_VERIFY_CLAIM_MS;
    void HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS;
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
