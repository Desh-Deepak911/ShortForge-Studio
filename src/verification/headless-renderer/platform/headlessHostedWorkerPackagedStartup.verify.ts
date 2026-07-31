/**
 * Packaged hosted-worker startup regression for cleanup-runtime renderer build ID acceptance.
 * Run: npm run test:headless-hosted-worker-packaged-startup
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { HEADLESS_PACKAGED_STARTUP_PROBE_ENV } from "@/features/headless-renderer/worker/hosted/hosted-entrypoint";
import {
  buildHeadlessFlyStagingCleanupRuntimePublicEnvironment,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const DIST = path.join(ROOT, "dist/headless-worker");
const WORKER = path.join(DIST, "hosted-worker.js");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function buildWorker(): void {
  const result = spawnSync("npm", ["run", "build:headless-worker"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "build failed");
  }
}

function validSecrets(): Record<string, string> {
  return {
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
    HEADLESS_WORKER_CONCURRENCY: "1",
  };
}

function runPackagedProbe(
  mode: "verify" | "render",
  envOverrides: Record<string, string | undefined> = {},
): { readonly status: number | null; readonly output: string } {
  const publicEnv = buildHeadlessFlyStagingCleanupRuntimePublicEnvironment();
  const env: Record<string, string> = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    ...validSecrets(),
    ...publicEnv,
    HEADLESS_WORKER_MODE: mode,
    [HEADLESS_PACKAGED_STARTUP_PROBE_ENV]: "1",
  };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const result = spawnSync(process.execPath, [WORKER], {
    cwd: DIST,
    encoding: "utf8",
    env,
    timeout: 15_000,
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

function parseEvents(output: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      events.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      // ignore non-json
    }
  }
  return events;
}

async function main() {
  console.log("\nPackaged hosted-worker cleanup-runtime startup regression\n");
  buildWorker();

  test("cleanup verify packaged probe accepts renderer build ID in strict mode", () => {
    const { status, output } = runPackagedProbe("verify");
    const events = parseEvents(output);
    const classified = events.find((e) => e.name === "hosted.env.classified");
    const packaged = events.find((e) => e.name === "hosted.packaged_startup.classified");
    const readiness = events.find((e) => e.name === "hosted.packaged_startup.loop_readiness");
    assert.equal(classified?.status, "configured");
    assert.notEqual(classified?.reasonId, "invalid_renderer_build_id");
    assert.equal(packaged?.status, "configured");
    assert.deepEqual((packaged?.facts as Record<string, unknown>)?.compatibilityMode, "strict");
    assert.equal((packaged?.facts as Record<string, unknown>)?.maintenanceEnabled, "0");
    assert.equal(readiness?.status, "ok");
    assert.equal(status, 0);
    assert.match(output, /packaged_startup_probe_pass/);
  });

  test("cleanup render packaged probe reaches loop-start readiness", () => {
    const { status, output } = runPackagedProbe("render");
    assert.equal(status, 0);
    assert.match(output, /hosted\.packaged_startup\.loop_readiness/);
  });

  test("bridge build ID cannot substitute on cleanup environment", () => {
    const { status, output } = runPackagedProbe("verify", {
      HEADLESS_RENDERER_BUILD_ID: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    });
    assert.notEqual(status, 0);
    assert.match(output, /invalid_schema_compatibility_mode|bridge_build_id_without_bridge_mode|invalid_renderer_build_id/);
  });

  test("unknown build ID fails with invalid_renderer_build_id", () => {
    const { status, output } = runPackagedProbe("verify", {
      HEADLESS_RENDERER_BUILD_ID: "headless-local-chromium-ffmpeg-unknown",
    });
    assert.notEqual(status, 0);
    const classified = parseEvents(output).find((e) => e.name === "hosted.env.classified");
    assert.equal(classified?.status, "invalid");
    assert.equal(classified?.reasonId, "invalid_renderer_build_id");
  });

  test("maintenance enabled is rejected for cleanup build ID", () => {
    const { status, output } = runPackagedProbe("verify", {
      HEADLESS_EXPORT_MAINTENANCE_ENABLED: "1",
    });
    assert.notEqual(status, 0);
    assert.match(output, /maintenance_enabled_forbidden/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
