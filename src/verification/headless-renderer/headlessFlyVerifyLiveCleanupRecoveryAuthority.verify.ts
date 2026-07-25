/**
 * Sprint 11E Phase 2E.2D.7A.2 — Cleanup recovery discovery authority.
 * Run: npm run test:headless-fly-verify-live-cleanup-recovery-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

import {
  discoverFlyVerifyCleanupRecoveryTarget,
  FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS,
  FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS,
  parseFlyVerifyCleanupRecoveryOwnedObjectStoreId,
  type FlyVerifyCleanupRecoveryTarget,
} from "./fly-verify-live/cleanup-recovery";
import { executeFlyVerifyCleanupRecoveryMutation } from "./fly-verify-live/cleanup-recovery-mutation";
import { runFlyVerifyCleanupRecoveryHarness } from "./fly-verify-live/run-fly-verify-cleanup-recovery";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fixtureSql(rows: {
  jobs: Array<{
    job_id: string;
    owner_id: string;
    creator_idempotency_key: string;
    created_at_ms: string;
  }>;
  objects: Array<{ object_id: string; store_id: string; object_key: string }>;
  projects: Array<{ project_id: string }>;
}): HeadlessSqlExecutor {
  return {
    async withClient(fn) {
      const client = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
          if (sql.includes("COUNT") && sql.includes("headless_owned_objects")) {
            return { rows: [{ n: "0" }] as T[] };
          }
          if (sql.includes("COUNT") && sql.includes("headless_jobs")) {
            return { rows: [{ n: "0" }] as T[] };
          }
          if (sql.includes("COUNT") && sql.includes("headless_project_ownership")) {
            return { rows: [{ n: "0" }] as T[] };
          }
          if (sql.includes("headless_jobs")) {
            return { rows: rows.jobs as T[] };
          }
          if (sql.includes("headless_owned_objects")) {
            if (params?.[0] !== rows.jobs[0]?.owner_id) {
              return { rows: [] as T[] };
            }
            return { rows: rows.objects as T[] };
          }
          if (sql.includes("headless_project_ownership")) {
            return { rows: rows.projects as T[] };
          }
          return { rows: [] as T[] };
        },
      };
      return fn(client as never);
    },
    async withTransaction(fn) {
      return this.withClient(fn);
    },
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.7A.2 — Fly verify cleanup recovery authority\n",
  );

  await test("gate off → NOT_TESTED", async () => {
    const result = await runFlyVerifyCleanupRecoveryHarness({ env: {} });
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.exitCode, 0);
  });

  await test("owned object store id parser accepts assets and artifacts only", () => {
    assert.equal(parseFlyVerifyCleanupRecoveryOwnedObjectStoreId("assets"), "assets");
    assert.equal(
      parseFlyVerifyCleanupRecoveryOwnedObjectStoreId("artifacts"),
      "artifacts",
    );
    assert.equal(parseFlyVerifyCleanupRecoveryOwnedObjectStoreId("foreign"), null);
    assert.equal(parseFlyVerifyCleanupRecoveryOwnedObjectStoreId(null), null);
  });

  await test("exact single match → preview PASS", async () => {
    const sql = fixtureSql({
      jobs: [
        {
          job_id: "job_recover_1",
          owner_id: "fvl_owner_abcd1234",
          creator_idempotency_key: "fly-verify-live-run-1",
          created_at_ms: String(FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS + 1000),
        },
      ],
      objects: [
        {
          object_id: "obj_1",
          store_id: "assets",
          object_key: "qa/staging/key",
        },
      ],
      projects: [{ project_id: "proj_1" }],
    });
    const discovery = await discoverFlyVerifyCleanupRecoveryTarget({
      sql,
      windowStartMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS,
      windowEndMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS,
    });
    assert.equal(discovery.ok, true);
    if (discovery.ok) {
      assert.equal(discovery.preview.objectCount, 1);
      assert.equal(discovery.preview.r2LocatorCount, 1);
      assert.equal(discovery.target.storeId, "assets");
    }
  });

  await test("recovery discovery rejects invalid store_id", async () => {
    const sql = fixtureSql({
      jobs: [
        {
          job_id: "job_recover_1",
          owner_id: "fvl_owner_abcd1234",
          creator_idempotency_key: "fly-verify-live-run-1",
          created_at_ms: String(FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS + 1000),
        },
      ],
      objects: [
        {
          object_id: "obj_1",
          store_id: "foreign_bucket",
          object_key: "qa/staging/key",
        },
      ],
      projects: [{ project_id: "proj_1" }],
    });
    const discovery = await discoverFlyVerifyCleanupRecoveryTarget({
      sql,
      windowStartMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS,
      windowEndMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS,
    });
    assert.equal(discovery.ok, false);
    if (!discovery.ok) {
      assert.equal(discovery.failClass, "discovery_store_id_invalid");
    }
  });

  await test("mutation redis unavailable → frozen probe_failed disposition", async () => {
    const target: FlyVerifyCleanupRecoveryTarget = {
      ownerId: "fvl_owner_abcd1234",
      jobId: "job_recover_1",
      projectId: "proj_1",
      objectId: "obj_1",
      storeId: "assets",
      objectKey: "qa/staging/key",
      verifyAttempt: 1,
    };
    const result = await executeFlyVerifyCleanupRecoveryMutation({
      sql: fixtureSql({ jobs: [], objects: [], projects: [] }),
      storage: {
        probeExactObjectPresence: async () => ({ ok: false }),
        deleteObject: async () => ({ ok: false }),
      },
      redis: null,
      target,
      windowStartMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS,
      windowEndMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "redis_consumer_unavailable");
      assert.equal(result.dispositions.redis, "probe_failed");
      assert.equal(result.dispositions.r2, "not_run");
      assert.equal(result.dispositions.neon, "not_run");
      assert.equal(Object.isFrozen(result.dispositions), true);
    }
  });

  await test("recovery discovery ambiguity fails closed", async () => {
    const sql = fixtureSql({
      jobs: [
        {
          job_id: "job_a",
          owner_id: "fvl_owner_a",
          creator_idempotency_key: "fly-verify-live-a",
          created_at_ms: String(FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS + 1),
        },
        {
          job_id: "job_b",
          owner_id: "fvl_owner_b",
          creator_idempotency_key: "fly-verify-live-b",
          created_at_ms: String(FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS + 2),
        },
      ],
      objects: [],
      projects: [],
    });
    const discovery = await discoverFlyVerifyCleanupRecoveryTarget({
      sql,
      windowStartMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS,
      windowEndMs: FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS,
    });
    assert.equal(discovery.ok, false);
    if (!discovery.ok) {
      assert.equal(discovery.failClass, "discovery_multiple_matches");
    }
  });

  await test("recovery writes separate evidence and never touches live path", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-recovery-"));
    const evidencePath = path.join(dir, "cleanup-recovery.md");
    const sql = fixtureSql({
      jobs: [
        {
          job_id: "job_recover_1",
          owner_id: "fvl_owner_abcd1234",
          creator_idempotency_key: "fly-verify-live-run-1",
          created_at_ms: String(FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS + 1000),
        },
      ],
      objects: [
        {
          object_id: "obj_1",
          store_id: "assets",
          object_key: "qa/staging/key",
        },
      ],
      projects: [{ project_id: "proj_1" }],
    });
    const result = await runFlyVerifyCleanupRecoveryHarness({
      env: { HEADLESS_FLY_VERIFY_QA_CLEANUP_RECOVERY: "1" },
      evidencePath,
      sql,
    });
    assert.equal(result.overall, "PASS");
    const md = readFileSync(evidencePath, "utf8");
    assert.match(md, /object_count=1/);
    assert.match(md, /coherence_result=ok/);
    assert.doesNotMatch(md, /postgresql:\/\//);
    assert.doesNotMatch(md, /HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE\.md/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
