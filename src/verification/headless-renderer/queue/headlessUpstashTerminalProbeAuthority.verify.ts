/**
 * Sprint 11E Phase 2D.1C — terminal probe gate/evidence authority (no provider).
 * Run: npm run test:headless-upstash-terminal-probe-authority
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
import { runUpstashTerminalProbe } from "../upstash-live/terminal-probe";
import {
  createNotTestedUpstashTerminalProbeEvidence,
  preserveOrInitializeUpstashTerminalProbeEvidence,
  renderUpstashTerminalProbeEvidenceMarkdown,
  terminalProbeCannotFalsePass,
  writeUpstashTerminalProbeEvidence,
} from "../upstash-live/terminal-probe-evidence";

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
  console.log("\nSprint 11E Phase 2D.1C — Upstash terminal probe authority\n");

  await test("gate-off opens zero connections and preserves PASS", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-tp-gate-"));
    const evidencePath = path.join(dir, "probe.md");
    writeFileSync(
      evidencePath,
      renderUpstashTerminalProbeEvidenceMarkdown({
        ...createNotTestedUpstashTerminalProbeEvidence(),
        overall: "PASS",
        eligibilityVerdict: "prior",
        cleanupStatus: "ok",
        stages: [{ stage: "redis_ack", status: "ok" }],
      }),
      "utf8",
    );
    const before = readFileSync(evidencePath, "utf8");
    let connections = 0;
    const result = await runUpstashTerminalProbe({
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
    const preserved = preserveOrInitializeUpstashTerminalProbeEvidence(
      evidencePath,
    );
    assert.equal(preserved.overall, "PASS");
    assert.equal(preserved.action, "preserved");
  });

  await test("gate-off initializes NOT_TESTED when absent", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-tp-init-"));
    const evidencePath = path.join(dir, "probe.md");
    const result = await runUpstashTerminalProbe({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.connectionFactoryCalls, 0);
    assert.ok(readFileSync(evidencePath, "utf8").includes("NOT_TESTED"));
  });

  await test("injected happy path PASS + cleanup ok (temp evidence)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-tp-pass-"));
    const evidencePath = path.join(dir, "probe.md");
    const stream = new MemoryHeadlessStreamQueueAdapter({
      envName: "staging",
      nowMs: () => 1_700_000_000_000,
    });
    await stream.ensureConsumerGroups();

    const result = await runUpstashTerminalProbe({
      forceGateOn: true,
      assumeConfigured: true,
      evidencePath,
      env: {
        HEADLESS_UPSTASH_QA_TERMINAL_PROBE: "1",
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
      injectedFingerprint: buildUpstashLiveSchemaFingerprint(),
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
    const bad = createNotTestedUpstashTerminalProbeEvidence();
    assert.equal(terminalProbeCannotFalsePass(bad).ok, false);
    assert.equal(
      terminalProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        stages: [],
      }).ok,
      false,
    );
    assert.equal(
      terminalProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "failed",
        stages: [{ stage: "redis_ack", status: "ok" }],
      }).ok,
      false,
    );
    assert.equal(
      terminalProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        stages: [
          {
            stage: "redis_ack",
            status: "failed",
            reasonId: "redis_ack_failed",
          },
        ],
      }).ok,
      false,
    );
  });

  await test("evidence write does not touch official live path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-tp-iso-"));
    const evidencePath = path.join(dir, "probe.md");
    writeUpstashTerminalProbeEvidence(
      createNotTestedUpstashTerminalProbeEvidence(),
      evidencePath,
    );
    assert.equal(evidencePath.includes("UPSTASH_LIVE_EVIDENCE"), false);
    assert.ok(evidencePath.includes("probe.md"));
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
