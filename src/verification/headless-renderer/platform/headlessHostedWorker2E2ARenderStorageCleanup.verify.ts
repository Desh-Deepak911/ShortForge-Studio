/**
 * Sprint 11E Phase 2E.2A — render storage + cleanup seams closed locally.
 * Run: npm run test:headless-hosted-worker-2e2a-render-storage-cleanup
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker";
import {
  buildHeadlessHostedFoundationManifest,
  composeHostedHeadlessWorker,
  HEADLESS_HOSTED_CLOSED_SEAMS,
  HEADLESS_HOSTED_IMAGE_CLASS,
  HEADLESS_HOSTED_RENDER_SEAMS,
  HEADLESS_HOSTED_UNRESOLVED_COMPOSITION_SEAMS,
  HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES,
  HEADLESS_HOSTED_VERIFY_SEAMS,
} from "@/features/headless-renderer/worker/hosted";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function validHostedEnv(mode: "verify" | "render"): Record<string, string> {
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
  };
}

function main() {
  console.log("\nSprint 11E Phase 2E.2A — render storage/cleanup seams\n");

  test("closed seams include storage + cleanup + verify promotion", () => {
    assert.deepEqual([...HEADLESS_HOSTED_CLOSED_SEAMS], [
      "RENDER_STORAGE_PORT_SEAM",
      "ARTIFACT_CLEANUP_DURABLE_SEAM",
      "VERIFY_PROMOTION_COMPOSITION_SEAM",
    ]);
    assert.deepEqual([...HEADLESS_HOSTED_RENDER_SEAMS], []);
    assert.deepEqual([...HEADLESS_HOSTED_VERIFY_SEAMS], []);
  });

  test("render composition storage/cleanup implemented; packaging resolved", () => {
    const c = composeHostedHeadlessWorker(validHostedEnv("render"));
    assert.equal(c.canStartConsumerLoop, true);
    assert.equal(c.reasonId, "composition_ready");
    assert.equal(c.compositionMap?.r2JobBoundStorage, true);
    assert.equal(c.compositionMap?.neonArtifactCleanup, true);
    assert.equal(c.compositionMap?.streamedArtifactFinalization, true);
    assert.equal(c.compositionMap?.cleanupIntentSupport, true);
    assert.equal(c.compositionMap?.trustedVerifyPromotion, false);
  });

  test("verify composition closes promotion; packaging resolved", () => {
    const c = composeHostedHeadlessWorker(validHostedEnv("verify"));
    assert.equal(c.canStartConsumerLoop, true);
    assert.equal(c.reasonId, "composition_ready");
    assert.equal(c.seams.includes("VERIFY_PROMOTION_COMPOSITION_SEAM"), false);
    assert.equal(c.compositionMap?.trustedVerifyPromotion, true);
    assert.equal(c.compositionMap?.neonArtifactCleanup, true);
  });

  test("deployable_worker classification with empty packaging lists", () => {
    const manifest = buildHeadlessHostedFoundationManifest();
    assert.equal(HEADLESS_HOSTED_IMAGE_CLASS, "deployable_worker");
    assert.equal(manifest.deployable, true);
    assert.equal(manifest.canStartConsumerLoop, true);
    assert.equal(manifest.imageClass, "deployable_worker");
    assert.deepEqual([...HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES], []);
    assert.deepEqual([...HEADLESS_HOSTED_UNRESOLVED_COMPOSITION_SEAMS], []);
  });

  test("materialize imports production adapters only", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/hosted/materialize-hosted-worker-adapters.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("memory-storage"), false);
    assert.equal(src.includes("memory-artifact-cleanup"), false);
    assert.equal(src.includes("FakeS3"), false);
    assert.equal(src.includes("FakeRedis"), false);
    assert.equal(src.includes("createR2JobBoundStorageAdapter"), true);
    assert.equal(src.includes("NeonHeadlessArtifactCleanupAdapter"), true);
    assert.equal(/from ["'].*product\//.test(src), false);
    assert.equal(/from ["']next\//.test(src), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
