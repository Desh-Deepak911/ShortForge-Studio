#!/usr/bin/env -S npx tsx
/**
 * Inspect immutable registry cleanup-runtime image and prove packaged artifact hashes.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  buildHeadlessFlyStagingCleanupRuntimePublicEnvironment,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import { HEADLESS_PACKAGED_STARTUP_PROBE_ENV } from "../../src/features/headless-renderer/worker/hosted/hosted-entrypoint";

const appName = process.argv[2] ?? "shortforge-hw-staging-4def8fa0";
const digest =
  process.argv[3] ??
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST;

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

function extractArtifactsWithDocker(
  imageRef: string,
  workDir: string,
  containerName: string,
): boolean {
  const pull = spawnSync("docker", ["pull", imageRef], { encoding: "utf8" });
  if (pull.status !== 0) return false;

  spawnSync("docker", ["rm", "-f", containerName], { encoding: "utf8" });
  const create = spawnSync(
    "docker",
    ["create", "--name", containerName, imageRef],
    { encoding: "utf8" },
  );
  if (create.status !== 0) return false;

  for (const artifact of [
    "hosted-worker.js",
    "page-render.iife.js",
    "BUILD_INFO.json",
  ] as const) {
    const cp = spawnSync(
      "docker",
      ["cp", `${containerName}:/app/${artifact}`, path.join(workDir, artifact)],
      { encoding: "utf8" },
    );
    if (cp.status !== 0) return false;
  }
  console.log(`registry_pull=PASS image_ref=${imageRef} mechanism=docker`);
  return true;
}

function extractArtifactsWithCrane(imageRef: string, workDir: string): boolean {
  const tarballPath = path.join(workDir, "image.tar");
  const exportResult = spawnSync("crane", ["export", imageRef, tarballPath], {
    encoding: "utf8",
  });
  if (exportResult.status !== 0) return false;

  for (const artifact of [
    "hosted-worker.js",
    "page-render.iife.js",
    "BUILD_INFO.json",
  ] as const) {
    const write = spawnSync("tar", ["-xOf", tarballPath, `app/${artifact}`], {
      encoding: "buffer",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (write.status !== 0 || !write.stdout) return false;
    writeFileSync(path.join(workDir, artifact), write.stdout);
  }
  console.log(`registry_pull=PASS image_ref=${imageRef} mechanism=crane_export`);
  return true;
}

const imageRef = `registry.fly.io/${appName}@sha256:${digest}`;
const workDir = mkdtempSync(path.join(tmpdir(), "cleanup-registry-inspect-"));
const containerName = `cleanup-inspect-${digest.slice(0, 8)}`;

function ensureFlyRegistryAuth(): void {
  spawnSync("fly", ["auth", "docker"], { encoding: "utf8", stdio: "ignore" });
}

try {
  ensureFlyRegistryAuth();
  const extracted =
    extractArtifactsWithCrane(imageRef, workDir) ||
    extractArtifactsWithDocker(imageRef, workDir, containerName);
  if (!extracted) die("registry_extract_failed");

  const workerSha = sha256File(path.join(workDir, "hosted-worker.js"));
  const pageSha = sha256File(path.join(workDir, "page-render.iife.js"));
  const buildInfoSha = sha256File(path.join(workDir, "BUILD_INFO.json"));

  console.log(`extracted_worker_sha256=${workerSha}`);
  console.log(`extracted_page_sha256=${pageSha}`);
  console.log(`extracted_build_info_sha256=${buildInfoSha}`);

  if (
    workerSha !==
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256
  ) {
    die("registry_worker_hash_mismatch");
  }
  if (pageSha !== HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256) {
    die("registry_page_hash_mismatch");
  }
  if (buildInfoSha !== HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256) {
    die("registry_build_info_hash_mismatch");
  }
  console.log("registry_artifact_binding=PASS");

  const publicEnv = buildHeadlessFlyStagingCleanupRuntimePublicEnvironment();
  const probeEnv: Record<string, string> = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    HEADLESS_WORKER_MODE: "verify",
    [HEADLESS_PACKAGED_STARTUP_PROBE_ENV]: "1",
    DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
    R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    ...publicEnv,
  };
  if (
    probeEnv.HEADLESS_RENDERER_BUILD_ID !==
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
  ) {
    die("registry_environment_renderer_build_id_incoherent");
  }

  const probe = spawnSync(
    process.execPath,
    [path.join(workDir, "hosted-worker.js")],
    {
      cwd: workDir,
      encoding: "utf8",
      env: probeEnv as NodeJS.ProcessEnv,
      timeout: 15_000,
    },
  );
  const output = `${probe.stdout}\n${probe.stderr}`;
  if (probe.status !== 0 || !/packaged_startup_probe_pass/.test(output)) {
    die("registry_packaged_startup_probe_failed");
  }
  console.log("registry_packaged_startup_probe=PASS");
  console.log(`gate=registry_image_inspection result=PASS digest=${digest}`);
} finally {
  spawnSync("docker", ["rm", "-f", containerName], { encoding: "utf8" });
  rmSync(workDir, { recursive: true, force: true });
}
