/**
 * Delete-now API security regression coverage.
 * Run: npm run test:headless-export-delete-now-security
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import { scheduleHeadlessExportDeleteNow } from "@/features/headless-renderer/control-plane/services/schedule-export-delete-now";
import { cpFail, cpOk } from "@/features/headless-renderer/control-plane/types/control-plane.types";

const DELETE_ROUTE = path.join(
  process.cwd(),
  "src/app/api/headless-render/jobs/[jobId]/delete/route.ts",
);

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function succeededJobStore(ownerId: string): HeadlessJobStorePort {
  return {
    getByJobIdAndOwner: async (jobId, requestOwnerId) => {
      if (requestOwnerId !== ownerId) {
        return cpFail("JOB_NOT_FOUND", "Export not found.");
      }
      if (jobId === "missing_job") {
        return cpFail("JOB_NOT_FOUND", "Export not found.");
      }
      if (jobId === "job_running") {
        return cpOk({
          stage: "canonical",
          ownerId,
          projectId: "project_a",
          jobId,
          storeVersion: 1,
          operationId: "op_a",
          canonicalJob: {
            jobId,
            state: "running",
            attempt: 1,
            updatedAtMs: 1,
            createdAtMs: 1,
            contractVersion: 1,
            rendererProfile: {
              resolution: "1080p",
              format: "webm",
              fps: 30,
              quality: "standard",
            },
          },
          artifactObjectBinding: null,
        } as never);
      }
      return cpOk({
        stage: "canonical",
        ownerId,
        projectId: "project_a",
        jobId,
        storeVersion: 1,
        operationId: "op_a",
        canonicalJob: {
          jobId,
          state: "succeeded",
          attempt: 1,
          updatedAtMs: 1,
          createdAtMs: 1,
          contractVersion: 1,
          rendererProfile: {
            resolution: "1080p",
            format: "webm",
            fps: 30,
            quality: "standard",
          },
        },
        artifactObjectBinding: {
          storageLocator: {
            kind: "object_storage",
            storeId: "artifacts",
            objectKey: "staging/finalized/artifacts/artifact/op_a/out.webm",
          },
          contentDigest: "sha256:" + "a".repeat(64),
          byteLength: 100,
          mimeType: "video/webm",
        },
      } as never);
    },
  } as HeadlessJobStorePort;
}

async function main() {
  console.log("\nHeadless export delete-now security\n");

  await test("production environment fails closed", async () => {
    const result = await scheduleHeadlessExportDeleteNow({
      envName: "production",
      ownerId: "owner_a",
      jobId: "job_a",
      jobStore: succeededJobStore("owner_a"),
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      nowMs: 1,
    });
    assert.equal(result.ok, false);
  });

  await test("cross-owner request matches missing export response class", async () => {
    const jobStore = succeededJobStore("owner_a");
    const missing = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_b",
      jobId: "job_delete",
      jobStore,
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      nowMs: 1,
    });
    const absent = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_b",
      jobId: "missing_job",
      jobStore,
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      nowMs: 1,
    });
    assert.equal(missing.ok, false);
    assert.equal(absent.ok, false);
    assert.equal(missing.issues[0]?.code, absent.issues[0]?.code);
  });

  await test("non-terminal export cannot schedule deletion", async () => {
    const result = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_a",
      jobId: "job_running",
      jobStore: succeededJobStore("owner_a"),
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      nowMs: 1,
    });
    assert.equal(result.ok, false);
  });

  await test("schedules durable cleanup instead of direct provider delete", async () => {
    let scheduleCalls = 0;
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const originalCreate = cleanup.createIfAbsent.bind(cleanup);
    cleanup.createIfAbsent = async (input) => {
      scheduleCalls += 1;
      return originalCreate(input);
    };
    const result = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_a",
      jobId: "job_delete",
      jobStore: succeededJobStore("owner_a"),
      cleanup,
      nowMs: 10,
    });
    assert.equal(result.ok, true);
    assert.equal(scheduleCalls, 1);
  });

  await test("repeated request is idempotent", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const first = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_a",
      jobId: "job_repeat",
      jobStore: succeededJobStore("owner_a"),
      cleanup,
      nowMs: 1,
    });
    const second = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_a",
      jobId: "job_repeat",
      jobStore: succeededJobStore("owner_a"),
      cleanup,
      nowMs: 2,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });

  await test("route uses authenticated gate and rejects raw locator fields", () => {
    const src = readFileSync(DELETE_ROUTE, "utf8");
    assert.equal(src.includes("evaluateHeadlessRouteAuth"), true);
    assert.equal(/request\.json\(\)/.test(src), false);
    assert.equal(
      /\bobjectKey\b|\bobject_key\b|\bstorageLocator\b|\bbucket\b|\bpresign\b|\bhttps?:\/\//i.test(
        src,
      ),
      false,
    );
    assert.match(src, /scheduleHeadlessExportDeleteNow/);
    assert.match(src, /gate\.principal\.ownerId/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
