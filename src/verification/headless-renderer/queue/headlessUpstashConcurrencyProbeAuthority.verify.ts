/**
 * Sprint 11E Phase 2D.1H — concurrency probe gate/evidence authority (no provider).
 * Run: npm run test:headless-upstash-concurrency-probe-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createFakeUpstashRestClient,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

import {
  CONCURRENCY_ATTRIBUTION_REASON_IDS,
  CONCURRENCY_ATTRIBUTION_STAGE_IDS,
} from "../upstash-live/concurrency-attribution";
import { runUpstashConcurrencyProbe } from "../upstash-live/concurrency-probe";
import {
  concurrencyProbeCannotFalsePass,
  createNotTestedUpstashConcurrencyProbeEvidence,
  preserveOrInitializeUpstashConcurrencyProbeEvidence,
  renderUpstashConcurrencyProbeEvidenceMarkdown,
  writeUpstashConcurrencyProbeEvidence,
} from "../upstash-live/concurrency-probe-evidence";
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
  console.log(
    "\nSprint 11E Phase 2D.1H — Upstash concurrency probe authority\n",
  );

  await test("gate-off opens zero connections and preserves PASS", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-conc-gate-"));
    const evidencePath = path.join(dir, "probe.md");
    writeFileSync(
      evidencePath,
      renderUpstashConcurrencyProbeEvidenceMarkdown({
        ...createNotTestedUpstashConcurrencyProbeEvidence(),
        overall: "PASS",
        eligibilityVerdict: "prior",
        cleanupStatus: "ok",
        duplicateDeliveryModel: "two_distinct_stream_ids",
        stages: [{ stageId: "cleanup", ok: true }],
      }),
      "utf8",
    );
    const before = readFileSync(evidencePath, "utf8");
    let connections = 0;
    const result = await runUpstashConcurrencyProbe({
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
    const preserved =
      preserveOrInitializeUpstashConcurrencyProbeEvidence(evidencePath);
    assert.equal(preserved.overall, "PASS");
    assert.equal(preserved.action, "preserved");
  });

  await test("gate-off initializes NOT_TESTED when absent", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-conc-init-"));
    const evidencePath = path.join(dir, "probe.md");
    const result = await runUpstashConcurrencyProbe({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.connectionFactoryCalls, 0);
    assert.ok(readFileSync(evidencePath, "utf8").includes("NOT_TESTED"));
  });

  await test("injected happy path PASS + cleanup ok (temp evidence)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-conc-pass-"));
    const evidencePath = path.join(dir, "probe.md");
    const stream = new MemoryHeadlessStreamQueueAdapter({
      envName: "staging",
      nowMs: () => 1_700_000_000_000,
    });
    await stream.ensureConsumerGroups();

    const result = await runUpstashConcurrencyProbe({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      env: {
        HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE: "1",
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
      injectedTcpConsumer: stream,
      injectedRestClient: createFakeUpstashRestClient(stream.testingFake()),
      injectedFingerprint: buildUpstashLiveSchemaFingerprint(),
      cleanupRunner: async () => "ok",
      nowIso: () => "2026-07-21T00:00:00.000Z",
    });
    assert.equal(
      result.exitCode,
      0,
      `expected PASS exit 0 got ${result.overall}`,
    );
    assert.equal(result.overall, "PASS");
    const md = readFileSync(evidencePath, "utf8");
    assert.ok(md.includes("**Overall:** PASS"));
    assert.ok(md.includes("rest_xadd"));
    assert.ok(md.includes("two_distinct_stream_ids"));
    assert.equal(md.includes("UPSTASH_REDIS_REST_TOKEN"), false);
    assert.equal(md.includes("PROGRESSIVE_DIAGNOSTIC"), false);
    assert.equal(md.includes("LIVE_EVIDENCE"), false);
  });

  await test("missing stages / hostile cannot false PASS", () => {
    const bad = createNotTestedUpstashConcurrencyProbeEvidence();
    assert.equal(concurrencyProbeCannotFalsePass(bad).ok, false);
    assert.equal(
      concurrencyProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        stages: [],
      }).ok,
      false,
    );
    assert.equal(
      concurrencyProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        duplicateDeliveryModel: "two_distinct_stream_ids",
        stages: [{ stageId: "cleanup", ok: false }],
      }).ok,
      false,
    );
    assert.equal(
      concurrencyProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        stages: [{ stageId: "cleanup", ok: true }],
      }).ok,
      false,
    );
  });

  await test("unknown stage cannot produce PASS", () => {
    const doc = {
      ...createNotTestedUpstashConcurrencyProbeEvidence(),
      overall: "PASS" as const,
      cleanupStatus: "ok" as const,
      duplicateDeliveryModel: "two_distinct_stream_ids" as const,
      stages: [
        {
          stageId: "made_up_stage" as never,
          ok: true as const,
        },
      ],
    };
    assert.equal(concurrencyProbeCannotFalsePass(doc).ok, false);
  });

  await test("concurrency attribution allowlists are frozen", () => {
    assert.equal(CONCURRENCY_ATTRIBUTION_STAGE_IDS.length, 16);
    assert.ok(CONCURRENCY_ATTRIBUTION_STAGE_IDS.includes("concurrent_consume"));
    assert.ok(CONCURRENCY_ATTRIBUTION_STAGE_IDS.includes("lock_scope_a_release"));
    assert.ok(CONCURRENCY_ATTRIBUTION_STAGE_IDS.includes("neon_no_steal"));
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("two_winners"),
    );
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("peer_left_pending_unrecovered"),
    );
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("peer_dlq_rejected"),
    );
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes(
        "lock_scope_a_deadline_elapsed",
      ),
    );
  });

  await test("evidence write does not touch progressive/official paths", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-conc-iso-"));
    const evidencePath = path.join(dir, "probe.md");
    writeUpstashConcurrencyProbeEvidence(
      createNotTestedUpstashConcurrencyProbeEvidence(),
      evidencePath,
    );
    assert.equal(evidencePath.includes("UPSTASH_LIVE_EVIDENCE"), false);
    assert.equal(evidencePath.includes("PROGRESSIVE_DIAGNOSTIC"), false);
    assert.ok(evidencePath.includes("probe.md"));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
