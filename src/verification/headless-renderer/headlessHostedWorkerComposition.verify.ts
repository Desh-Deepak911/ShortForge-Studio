/**
 * Sprint 11E Phase 2E.1 — Hosted verify/render composition + entrypoint ordering.
 * Run: npm run test:headless-hosted-worker-composition
 */

import assert from "node:assert/strict";

import { composeProductionHeadlessControlPlane } from "@/features/headless-renderer/control-plane";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker";
import {
  composeHostedHeadlessWorker,
  HEADLESS_HOSTED_RENDER_SEAMS,
  HEADLESS_HOSTED_VERIFY_SEAMS,
  runHostedWorkerEntrypoint,
} from "@/features/headless-renderer/worker/hosted";

let passed = 0;
let providerContactAttempts = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function validHostedEnv(
  mode: "verify" | "render",
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    HEADLESS_WORKER_MODE: mode,
    HEADLESS_ENV_NAME: "staging",
    DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
    R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
    HEADLESS_RENDERER_BUILD_ID: HEADLESS_WORKER_RENDERER_BUILD_ID,
    HEADLESS_WORKER_CONCURRENCY: "1",
    ...overrides,
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.1 — Hosted worker composition\n");

  await test("render composition closes storage/cleanup; packaging resolved", () => {
    const c = composeHostedHeadlessWorker(validHostedEnv("render"));
    assert.equal(c.environment.status, "configured");
    assert.equal(c.canStartConsumerLoop, true);
    assert.deepEqual([...c.seams], [...HEADLESS_HOSTED_RENDER_SEAMS]);
    assert.equal(c.reasonId, "composition_ready");
    assert.equal(c.compositionMap?.mode, "render");
    assert.equal(c.compositionMap?.upstashTcpConsumer, true);
    assert.equal(c.compositionMap?.r2JobBoundStorage, true);
    assert.equal(c.compositionMap?.neonArtifactCleanup, true);
    assert.equal(c.compositionMap?.chromiumFfmpegRunner, true);
    assert.equal(c.compositionMap?.streamedArtifactFinalization, true);
    assert.equal(c.compositionMap?.cleanupIntentSupport, true);
    assert.equal(c.compositionMap?.trustedVerifyPromotion, false);
  });

  await test("verify composition closes promotion seam; packaging resolved", () => {
    const c = composeHostedHeadlessWorker(validHostedEnv("verify"));
    assert.equal(c.canStartConsumerLoop, true);
    assert.deepEqual([...c.seams], [...HEADLESS_HOSTED_VERIFY_SEAMS]);
    assert.equal(c.seams.includes("VERIFY_PROMOTION_COMPOSITION_SEAM"), false);
    assert.equal(c.reasonId, "composition_ready");
    assert.equal(c.compositionMap?.trustedVerifyPromotion, true);
    assert.equal(c.compositionMap?.neonOwnedObjectStore, true);
    assert.equal(c.compositionMap?.neonArtifactCleanup, true);
  });

  await test("mode separation — verify map ≠ render map", () => {
    const r = composeHostedHeadlessWorker(validHostedEnv("render"));
    const v = composeHostedHeadlessWorker(validHostedEnv("verify"));
    assert.notDeepEqual(r.compositionMap, v.compositionMap);
    assert.equal(r.compositionMap?.neonOwnedObjectStore, true);
    assert.equal(r.compositionMap?.r2JobBoundStorage, true);
    assert.equal(v.compositionMap?.r2JobBoundStorage, false);
    assert.equal(v.compositionMap?.chromiumFfmpegRunner, false);
  });

  await test("invalid config never starts loop / no provider contact", async () => {
    providerContactAttempts = 0;
    const events: string[] = [];
    const result = await runHostedWorkerEntrypoint({
      env: { HEADLESS_WORKER_MODE: "render" },
      installSignalHandlers: false,
      skipBinaryPreflight: true,
      eventSink: (e) => {
        events.push(e.name);
        if (e.name === "hosted.loop.started") providerContactAttempts += 1;
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.reasonId, "partial_configuration");
    assert.equal(providerContactAttempts, 0);
    assert.equal(events.includes("hosted.loop.started"), false);
  });

  await test("configured render → schema preflight blocks before queue; no loop start", async () => {
    const events: string[] = [];
    let groupsEnsured = 0;
    let closed = 0;
    const result = await runHostedWorkerEntrypoint({
      env: validHostedEnv("render"),
      installSignalHandlers: false,
      skipBinaryPreflight: true,
      runSchemaPreflight: async () => ({
        ok: false as const,
        code: "SCHEMA_MISSING" as const,
        message: "injected schema miss",
      }),
      materializeAdapters: () =>
        ({
          sql: {
            withClient: async () => {
              throw new Error("sql must not run when schema is injected");
            },
            withTransaction: async () => {
              throw new Error("sql must not run when schema is injected");
            },
          },
          jobStore: {} as never,
          ownedObjectStore: {} as never,
          artifactCleanup: {} as never,
          dispatchOutbox: {} as never,
          streamQueue: {
            ensureConsumerGroups: async () => {
              groupsEnsured += 1;
              return { ok: true, value: undefined };
            },
            close: async () => undefined,
          },
          r2ObjectIo: {} as never,
          createJobBoundStorage: () => {
            throw new Error("R2 must not run");
          },
          createOnClaimedRender: () => async () => ({
            kind: "render_failed" as const,
            reasonId: "unused",
          }),
          createOnClaimedVerify: () => async () => ({
            kind: "verify_failed",
            reasonId: "unused",
          }),
          leaseSettings: {
            visibilityTimeoutMs: 30_000,
            minIdleMs: 30_000,
            claimBatchSize: 1,
          },
          close: async () => {
            closed += 1;
          },
        }) as never,
      eventSink: (e) => events.push(`${e.name}:${e.reasonId ?? ""}`),
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.reasonId, "schema_schema_missing");
    assert.ok(events.some((e) => e.startsWith("hosted.env.classified")));
    assert.ok(events.some((e) => e.startsWith("hosted.composition.ready")));
    assert.ok(events.some((e) => e.startsWith("hosted.schema.preflight")));
    assert.equal(groupsEnsured, 0);
    assert.ok(closed >= 1);
    assert.equal(
      events.some((e) => e.startsWith("hosted.loop.started")),
      false,
    );
  });

  await test("production control plane remains blocked", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
