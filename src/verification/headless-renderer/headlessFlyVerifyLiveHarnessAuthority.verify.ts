/**
 * Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live harness authority.
 * Run: npm run test:headless-fly-verify-live-harness-authority
 *
 * Deterministic — no Neon, R2, Upstash, or Fly contact.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessRenderDispatchOutboxAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import {
  FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
} from "./fly-verify-live/evidence-authority";

import { runFlyVerifyLiveHarness } from "./fly-verify-live/run-fly-verify-live-harness";
import { createCanonicalFlyVerifyLiveQaConfiguredEnv } from "./fly-verify-live/qa-secret-contract";
import {
  createNotTestedFlyVerifyLiveEvidence,
  renderFlyVerifyLiveEvidenceMarkdown,
  writeFlyVerifyLiveEvidence,
  FLY_VERIFY_FIRST_PASS_EVIDENCE_RELATIVE_PATH,
  type FlyVerifyLiveCaseEvidence,
} from "./fly-verify-live/evidence";
import {
  buildFlyVerifyLiveSchemaFingerprint,
  FLY_VERIFY_LIVE_REQUIRED_MIGRATION_IDS,
  validatePassFlyVerifyLiveEvidence,
} from "./fly-verify-live/evidence-authority";
import { createPassingFlyVerifyLiveCaseRunners } from "./fly-verify-live/live-matrix";
import {
  assertExactRequiredFlyVerifyLiveCasePassAuthority,
  assertExactRequiredFlyVerifyLiveCasePrefixFailAuthority,
  createExactPassFlyVerifyLiveCaseResults,
  REQUIRED_FLY_VERIFY_LIVE_CASE_IDS,
} from "./fly-verify-live/required-cases";
import { emptyFlyVerifyLiveSession } from "./fly-verify-live/types";
import type { FlyVerifyLiveMatrixContext } from "./fly-verify-live/types";

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

const CONFIGURED_ENV = createCanonicalFlyVerifyLiveQaConfiguredEnv();

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.7A — Hosted Fly verifier live harness authority\n",
  );

  await test("gate off → NOT_TESTED and zero connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    let connections = 0;
    const result = await runFlyVerifyLiveHarness({
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
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    const fp = buildFlyVerifyLiveSchemaFingerprint();
    writeFileSync(
      evidencePath,
      renderFlyVerifyLiveEvidenceMarkdown({
        ...createNotTestedFlyVerifyLiveEvidence(),
        overall: "PASS",
        eligibilityVerdict: "ELIGIBLE — prior pass",
        startedAtIso: "2026-01-01T00:00:00.000Z",
        endedAtIso: "2026-01-01T00:01:00.000Z",
        cases: createExactPassFlyVerifyLiveCaseResults(),
        schemaFingerprint: fp,
        acceptedImageDigestSha256:
          FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
        flyVerifyTopology: {
          verifyCount: 1,
          renderCount: 0,
          observedRegion: "iad",
        },
        cleanupStatus: "ok",
      }),
      "utf8",
    );
    const before = readFileSync(evidencePath, "utf8");
    const result = await runFlyVerifyLiveHarness({ env: {}, evidencePath });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(readFileSync(evidencePath, "utf8"), before);
  });

  await test("exact membership requires all 20 frozen case IDs", () => {
    assert.equal(REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length, 20);
    assert.ok(REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.includes("env.config"));
    assert.ok(REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.includes("evidence.privacy"));
    const partial: FlyVerifyLiveCaseEvidence[] = [
      { caseId: "env.config", status: "PASS" },
    ];
    assert.equal(
      assertExactRequiredFlyVerifyLiveCasePassAuthority(partial).ok,
      false,
    );
    assert.equal(
      assertExactRequiredFlyVerifyLiveCasePassAuthority(
        createExactPassFlyVerifyLiveCaseResults(),
      ).ok,
      true,
    );
  });

  await test("seven-migration fingerprint includes 005, 006, and 007", () => {
    assert.deepEqual([...FLY_VERIFY_LIVE_REQUIRED_MIGRATION_IDS], [
      "000_headless_schema_migrations",
      "001_headless_project_ownership",
      "002_headless_jobs",
      "004_headless_owned_objects",
      "005_headless_cleanup_intents",
      "006_headless_render_dispatch_outbox",
      "007_headless_owned_object_slot_key_capacity",
    ]);
    const fp = buildFlyVerifyLiveSchemaFingerprint();
    assert.equal(fp.migrationIds.length, 7);
  });

  await test("PASS authority requires cleanup ok|preserved", () => {
    const fp = buildFlyVerifyLiveSchemaFingerprint();
    const base = {
      ...createNotTestedFlyVerifyLiveEvidence(),
      overall: "PASS" as const,
      eligibilityVerdict: "ELIGIBLE",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:01:00.000Z",
      cases: createExactPassFlyVerifyLiveCaseResults(),
      schemaFingerprint: fp,
      acceptedImageDigestSha256:
        FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
      flyVerifyTopology: {
        verifyCount: 1,
        renderCount: 0,
        observedRegion: "iad",
      },
    };
    assert.equal(
      validatePassFlyVerifyLiveEvidence({
        document: { ...base, cleanupStatus: "skipped" },
      }).ok,
      false,
    );
    assert.equal(
      validatePassFlyVerifyLiveEvidence({
        document: { ...base, cleanupStatus: "ok" },
      }).ok,
      true,
    );
  });

  await test("prefix-FAIL authority accepts PASS* + FAIL + NOT_TESTED*", () => {
    const cases: FlyVerifyLiveCaseEvidence[] =
      REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.map((caseId, i) => {
        if (i < 2) return { caseId, status: "PASS" as const };
        if (i === 2) {
          return {
            caseId,
            status: "FAIL" as const,
            failureCategory: "SCHEMA_FINGERPRINT_FAILED",
          };
        }
        return { caseId, status: "NOT_TESTED" as const };
      });
    const prefix =
      assertExactRequiredFlyVerifyLiveCasePrefixFailAuthority(cases);
    assert.equal(prefix.ok, true);
    if (prefix.ok) {
      assert.equal(prefix.failedCaseId, "neon.schema_fingerprint");
    }
  });

  await test("live harness must never write verify-first PASS path", () => {
    const fp = buildFlyVerifyLiveSchemaFingerprint();
    const doc = {
      ...createNotTestedFlyVerifyLiveEvidence(),
      overall: "PASS" as const,
      eligibilityVerdict: "ELIGIBLE",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:01:00.000Z",
      cases: createExactPassFlyVerifyLiveCaseResults(),
      schemaFingerprint: fp,
      acceptedImageDigestSha256:
        FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
      flyVerifyTopology: {
        verifyCount: 1,
        renderCount: 0,
        observedRegion: "iad",
      },
      cleanupStatus: "ok" as const,
    };
    assert.throws(() =>
      writeFlyVerifyLiveEvidence({
        evidencePath: path.join(process.cwd(), FLY_VERIFY_FIRST_PASS_EVIDENCE_RELATIVE_PATH),
        document: doc,
      }),
    );
    void renderFlyVerifyLiveEvidenceMarkdown(doc);
  });

  await test("injected passing runners → PASS without provider contact", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-live-"));
    const evidencePath = path.join(dir, "evidence.md");
    let connections = 0;
    const streamNames = deriveHeadlessQueueStreamNames("staging");
    const r2Config = {
      endpoint: "https://example.r2.cloudflarestorage.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
      bucketAssets: "assets",
      bucketArtifacts: "artifacts",
      allowedOrigins: ["https://example.com"],
    };
    const passing = createPassingFlyVerifyLiveCaseRunners();
    const sql = noopSql();
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "staging",
    });
    const result = await runFlyVerifyLiveHarness({
      env: CONFIGURED_ENV,
      evidencePath,
      forceGateOn: true,
      injectedSql: sql,
      injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
      injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
      injectedDispatchOutbox: new MemoryHeadlessRenderDispatchOutboxAdapter(),
      injectedTcpConsumer: streamQueue as never,
      injectedRestProducer: streamQueue as never,
      injectedFingerprint: buildFlyVerifyLiveSchemaFingerprint(),
      readFlyTopology: async () => ({
        verifyCount: 1,
        renderCount: 0,
        region: "iad",
        verifyMachineId: "abc12345",
        imageDigestSha256: FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
      }),
      pollHostedVerifier: async () => ({
        finalized: true,
        claimCleared: true,
        coverageReconciled: true,
        coverageComplete: false,
        promoted: false,
        renderDispatchPresent: false,
        verifyPendingCleared: true,
        storeVersion: 1,
      }),
      cleanupRunner: async () => "ok",
      caseRunners: passing,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(connections, 1);
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "PASS");
    const markdown = readFileSync(evidencePath, "utf8");
    assert.match(markdown, /\*\*Overall:\*\* PASS/);
    assert.doesNotMatch(markdown, /postgresql:\/\//);
    assert.doesNotMatch(markdown, /rediss?:\/\//);
    void streamNames;
    void r2Config;
    void emptyFlyVerifyLiveSession;
    void (null as FlyVerifyLiveMatrixContext | null);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
